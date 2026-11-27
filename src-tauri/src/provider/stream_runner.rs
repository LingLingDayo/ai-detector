use std::time::{Duration, Instant};

use crate::error::{AppError, AppResult};
use crate::infra::cancel::CancellationToken;
use crate::infra::http::{compact_error, resolve_user_agent, HttpClient};

use super::sse::{feed_sse_data_line, SseLineDecoder};
use super::types::{
    CompletionOutput, LlmCompletionRequest, ParseMode, StreamParseState,
};
use super::url::normalize_completion_url;
use super::{protocol_for, LlmProtocol};

const STREAM_CHUNK_IDLE_TIMEOUT_SECS: u64 = 90;
const PROGRESS_THROTTLE_MS: u64 = 100;
/// 无显式思考事件时，首包到首字间隔小于该阈值视为普通分包/网关缓冲抖动
const IMPLICIT_THINKING_MIN_MS: u64 = 500;

/// 基于单调时钟精准追踪流式响应中的思考耗时：
/// - 首包即包含非空白正文时直接定格为 `None`，不产生 1ms 伪耗时
/// - 出现显式思考信号时从首个思考分片计时到首个非空白正文分片
/// - 无显式思考信号时仅当空首包到首字间隔 >= 500ms 才计为思考耗时
#[derive(Debug)]
pub(crate) struct StreamThinkingTracker {
    stream_started_at: Instant,
    first_reasoning_at: Option<Instant>,
    first_text_at: Option<Instant>,
    resolved_thinking_ms: Option<Option<u64>>,
}

impl StreamThinkingTracker {
    pub(crate) fn new(stream_started_at: Instant) -> Self {
        Self {
            stream_started_at,
            first_reasoning_at: None,
            first_text_at: None,
            resolved_thinking_ms: None,
        }
    }

    pub(crate) fn record_chunk(
        &mut self,
        at: Instant,
        has_reasoning: bool,
        has_non_ws_text: bool,
    ) -> bool {
        if self.first_reasoning_at.is_none() && has_reasoning {
            self.first_reasoning_at = Some(at);
        }
        if self.first_text_at.is_none() && has_non_ws_text {
            self.first_text_at = Some(at);
            self.resolved_thinking_ms = Some(Self::compute_thinking_ms(
                self.stream_started_at,
                self.first_reasoning_at,
                at,
            ));
            return true;
        }
        false
    }

    pub(crate) fn settled_thinking_ms(&self) -> Option<u64> {
        self.resolved_thinking_ms.flatten()
    }

    pub(crate) fn finalize(&self, ended_at: Instant) -> Option<u64> {
        if let Some(resolved) = self.resolved_thinking_ms {
            return resolved;
        }
        Self::compute_thinking_ms(self.stream_started_at, self.first_reasoning_at, ended_at)
    }

    fn compute_thinking_ms(
        stream_started_at: Instant,
        first_reasoning_at: Option<Instant>,
        end_at: Instant,
    ) -> Option<u64> {
        if let Some(t_reason) = first_reasoning_at {
            let ms = end_at.saturating_duration_since(t_reason).as_millis() as u64;
            if ms > 0 {
                Some(ms)
            } else {
                None
            }
        } else {
            let ms = end_at.saturating_duration_since(stream_started_at).as_millis() as u64;
            if ms >= IMPLICIT_THINKING_MIN_MS {
                Some(ms)
            } else {
                None
            }
        }
    }
}

pub trait CompletionStreamObserver: Send {
    fn on_start(&mut self, state: &StreamParseState);
    fn on_progress(&mut self, state: &StreamParseState, thinking_ms: Option<u64>);
}

pub struct NoopStreamObserver;

impl CompletionStreamObserver for NoopStreamObserver {
    fn on_start(&mut self, _state: &StreamParseState) {}
    fn on_progress(&mut self, _state: &StreamParseState, _thinking_ms: Option<u64>) {}
}

pub async fn execute_completion(
    http: &HttpClient,
    req: &LlmCompletionRequest,
    mode: ParseMode,
    cancel: &mut CancellationToken,
    observer: &mut dyn CompletionStreamObserver,
) -> AppResult<CompletionOutput> {
    cancel.ensure_running()?;

    let protocol = protocol_for(req.api_format);
    let target_url = normalize_completion_url(&req.base_url, req.api_format);
    let body = protocol.build_request_body(req);
    let start_time = Instant::now();

    let mut builder = http
        .post(&target_url)
        .header(
            reqwest::header::USER_AGENT,
            resolve_user_agent(req.user_agent.as_deref()),
        )
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(
            reqwest::header::ACCEPT,
            if req.stream {
                "text/event-stream, application/json"
            } else {
                "application/json"
            },
        );
    builder = protocol.apply_auth_headers(builder, &req.api_key);

    if req.stream {
        execute_streaming(
            builder.json(&body),
            protocol,
            req,
            mode,
            start_time,
            cancel,
            observer,
        )
        .await
    } else {
        execute_non_streaming(builder.json(&body), protocol, req, mode, start_time, cancel).await
    }
}

async fn execute_streaming(
    builder: reqwest::RequestBuilder,
    protocol: &dyn LlmProtocol,
    req: &LlmCompletionRequest,
    mode: ParseMode,
    start_time: Instant,
    cancel: &mut CancellationToken,
    observer: &mut dyn CompletionStreamObserver,
) -> AppResult<CompletionOutput> {
    let first_response_timeout = Duration::from_secs(req.timeout_seconds);
    let send_res = cancel
        .run(tokio::time::timeout(first_response_timeout, builder.send()))
        .await?;

    let mut resp = match send_res {
        Ok(Ok(r)) => r,
        Ok(Err(err)) => {
            log::error!(
                "上游流式请求无法连接: model={}, api_format={}, error={}",
                req.model,
                req.api_format.as_str(),
                err
            );
            return Err(AppError::UpstreamNetwork(format!(
                "无法连接上游接口: {err}"
            )));
        }
        Err(_) => {
            log::warn!(
                "流式请求首次响应超时: timeout={}s, model={}, api_format={}",
                req.timeout_seconds,
                req.model,
                req.api_format.as_str()
            );
            return Err(AppError::Timeout(format!(
                "流式请求首次响应超时（{} 秒内未收到上游响应）",
                req.timeout_seconds
            )));
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let err_body = cancel.run(resp.text()).await?.unwrap_or_default();
        let err_msg = compact_error(&err_body, status);
        let status_code = status.as_u16();
        log::warn!(
            "上游流式接口返回异常: status={}, model={}, api_format={}",
            status_code,
            req.model,
            req.api_format.as_str()
        );
        return Err(AppError::UpstreamHttp {
            prefix: "接口请求异常",
            status: status_code,
            message: err_msg,
        });
    }

    let elapsed = start_time.elapsed();
    let first_chunk_timeout = if elapsed < first_response_timeout {
        first_response_timeout - elapsed
    } else {
        Duration::from_millis(100)
    };

    let first_chunk_res = cancel
        .run(tokio::time::timeout(first_chunk_timeout, resp.chunk()))
        .await?;
    let first_chunk = match first_chunk_res {
        Ok(Ok(Some(bytes))) => bytes,
        Ok(Ok(None)) => {
            return Err(AppError::UpstreamProtocol("上游返回了空流响应".to_string()));
        }
        Ok(Err(err)) => {
            return Err(AppError::UpstreamNetwork(format!(
                "读取上游流式首包数据失败: {err}"
            )));
        }
        Err(_) => {
            return Err(AppError::Timeout(format!(
                "流式请求首次响应超时（{} 秒内未收到模型首包响应）",
                req.timeout_seconds
            )));
        }
    };

    let first_chunk_at = Instant::now();
    let mut decoder = SseLineDecoder::new();
    let mut state = StreamParseState::default();
    let mut fallback_raw = Vec::new();
    let mut first_token_ms: Option<u64> = None;
    let mut thinking_tracker = StreamThinkingTracker::new(first_chunk_at);

    process_chunk(
        &first_chunk,
        protocol,
        mode,
        &mut decoder,
        &mut state,
        &mut fallback_raw,
    )?;
    if first_token_ms.is_none() && state.has_semantic_output {
        first_token_ms = Some(start_time.elapsed().as_millis() as u64);
    }
    thinking_tracker.record_chunk(
        first_chunk_at,
        state.has_reasoning,
        !state.text.trim().is_empty(),
    );

    observer.on_start(&state);
    observer.on_progress(&state, thinking_tracker.settled_thinking_ms());
    let mut last_progress_at = Instant::now();

    let duration_ms = loop {
        let chunk_res = cancel
            .run(tokio::time::timeout(
                Duration::from_secs(STREAM_CHUNK_IDLE_TIMEOUT_SECS),
                resp.chunk(),
            ))
            .await?;

        match chunk_res {
            Ok(Ok(Some(bytes))) => {
                process_chunk(
                    &bytes,
                    protocol,
                    mode,
                    &mut decoder,
                    &mut state,
                    &mut fallback_raw,
                )?;
                let chunk_at = Instant::now();
                if first_token_ms.is_none() && state.has_semantic_output {
                    first_token_ms = Some(start_time.elapsed().as_millis() as u64);
                }
                let just_got_text = thinking_tracker.record_chunk(
                    chunk_at,
                    state.has_reasoning,
                    !state.text.trim().is_empty(),
                );
                if just_got_text
                    || last_progress_at.elapsed() >= Duration::from_millis(PROGRESS_THROTTLE_MS)
                {
                    observer.on_progress(&state, thinking_tracker.settled_thinking_ms());
                    last_progress_at = Instant::now();
                }
            }
            Ok(Ok(None)) => break start_time.elapsed().as_millis() as u64,
            Ok(Err(err)) => {
                return Err(AppError::UpstreamNetwork(format!(
                    "读取上游流式响应数据中断: {err}"
                )));
            }
            Err(_) => {
                return Err(AppError::Timeout(format!(
                    "上游流式响应传输中断（{} 秒内未收到后续数据分片）",
                    STREAM_CHUNK_IDLE_TIMEOUT_SECS
                )));
            }
        }
    };

    if let Some(tail_data) = decoder.finish() {
        feed_sse_data_line(&tail_data, protocol, mode, &mut state)?;
    }
    let ended_at = Instant::now();
    if first_token_ms.is_none() && state.has_semantic_output {
        first_token_ms = Some(duration_ms);
    }
    thinking_tracker.record_chunk(
        ended_at,
        state.has_reasoning,
        !state.text.trim().is_empty(),
    );
    let thinking_ms = thinking_tracker.finalize(ended_at);
    observer.on_progress(&state, thinking_ms);

    if let Some(message) = &state.error_message {
        return Err(AppError::UpstreamProtocol(message.clone()));
    }
    protocol.validate_stream_finish(&state, mode)?;

    if !state.saw_sse_data && !fallback_raw.is_empty() {
        let body_text = String::from_utf8_lossy(&fallback_raw);
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&body_text) {
            let fallback = protocol.parse_non_streaming(&parsed, mode)?;
            if !fallback.text.is_empty() {
                return Ok(CompletionOutput {
                    text: fallback.text,
                    response_model: fallback.response_model,
                    usage: fallback.usage,
                    raw_status: status.as_u16(),
                    duration_ms,
                    first_token_ms,
                    thinking_ms: None,
                });
            }
        }
    }

    if state.text.is_empty() {
        return Err(AppError::UpstreamProtocol(
            "流式响应未包含有效文本内容".to_string(),
        ));
    }

    Ok(CompletionOutput {
        text: state.text,
        response_model: state.response_model,
        usage: state.usage,
        raw_status: status.as_u16(),
        duration_ms,
        first_token_ms,
        thinking_ms,
    })
}

fn process_chunk(
    chunk: &[u8],
    protocol: &dyn LlmProtocol,
    mode: ParseMode,
    decoder: &mut SseLineDecoder,
    state: &mut StreamParseState,
    fallback_raw: &mut Vec<u8>,
) -> AppResult<()> {
    if !state.saw_sse_data {
        fallback_raw.extend_from_slice(chunk);
    }
    for data in decoder.push_bytes(chunk) {
        feed_sse_data_line(&data, protocol, mode, state)?;
        if state.saw_sse_data && !fallback_raw.is_empty() {
            fallback_raw.clear();
        }
    }
    Ok(())
}

async fn execute_non_streaming(
    builder: reqwest::RequestBuilder,
    protocol: &dyn LlmProtocol,
    req: &LlmCompletionRequest,
    mode: ParseMode,
    start_time: Instant,
    cancel: &mut CancellationToken,
) -> AppResult<CompletionOutput> {
    let total_timeout = Duration::from_secs(req.timeout_seconds);
    let send_res = cancel
        .run(tokio::time::timeout(total_timeout, builder.send()))
        .await?;

    let resp = match send_res {
        Ok(Ok(r)) => r,
        Ok(Err(err)) if err.is_timeout() => {
            return Err(AppError::Timeout(format!(
                "同步请求超时（{} 秒内未收到上游响应）",
                req.timeout_seconds
            )));
        }
        Ok(Err(err)) => {
            return Err(AppError::UpstreamNetwork(format!(
                "无法连接上游接口: {err}"
            )));
        }
        Err(_) => {
            return Err(AppError::Timeout(format!(
                "同步请求超时（{} 秒内未收到上游响应）",
                req.timeout_seconds
            )));
        }
    };

    let status = resp.status();
    if !status.is_success() {
        let err_body = cancel.run(resp.text()).await?.unwrap_or_default();
        log::warn!(
            "上游非流式接口返回异常: status={}, model={}, api_format={}",
            status.as_u16(),
            req.model,
            req.api_format.as_str()
        );
        return Err(AppError::UpstreamHttp {
            prefix: "接口请求异常",
            status: status.as_u16(),
            message: compact_error(&err_body, status),
        });
    }

    let remaining = total_timeout.saturating_sub(start_time.elapsed());
    let text_res = cancel
        .run(tokio::time::timeout(remaining.max(Duration::from_millis(1)), resp.text()))
        .await?;
    let text = match text_res {
        Ok(Ok(t)) => t,
        Ok(Err(err)) => {
            return Err(AppError::UpstreamNetwork(format!(
                "读取上游响应失败: {err}"
            )));
        }
        Err(_) => {
            return Err(AppError::Timeout(format!(
                "同步请求超时（{} 秒内未收到上游响应）",
                req.timeout_seconds
            )));
        }
    };

    let duration_ms = start_time.elapsed().as_millis() as u64;
    let parsed_json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|err| AppError::UpstreamProtocol(format!("上游未返回有效 JSON 数据: {err}")))?;
    let state = protocol.parse_non_streaming(&parsed_json, mode)?;

    if mode == ParseMode::LenientChat && state.text.trim().is_empty() {
        log::warn!(
            "对话请求上游响应未包含有效文本内容: model={}, api_format={}",
            req.model,
            req.api_format.as_str()
        );
        return Err(AppError::UpstreamProtocol(
            "上游响应未包含有效文本内容".to_string(),
        ));
    }

    Ok(CompletionOutput {
        text: state.text,
        response_model: state.response_model,
        usage: state.usage,
        raw_status: status.as_u16(),
        duration_ms,
        first_token_ms: None,
        thinking_ms: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_thinking_tracker_first_chunk_with_text_returns_none() {
        let t0 = Instant::now();
        let mut tracker = StreamThinkingTracker::new(t0);
        assert!(tracker.record_chunk(t0, false, true));
        assert_eq!(tracker.settled_thinking_ms(), None);
        assert_eq!(tracker.finalize(t0 + Duration::from_millis(500)), None);
    }

    #[test]
    fn test_thinking_tracker_same_chunk_reasoning_and_text_returns_none() {
        let t0 = Instant::now();
        let mut tracker = StreamThinkingTracker::new(t0);
        assert!(tracker.record_chunk(t0, true, true));
        assert_eq!(tracker.settled_thinking_ms(), None);
        assert_eq!(tracker.finalize(t0 + Duration::from_millis(1200)), None);
    }

    #[test]
    fn test_thinking_tracker_empty_first_chunk_then_explicit_reasoning_then_text() {
        let t0 = Instant::now();
        let mut tracker = StreamThinkingTracker::new(t0);
        assert!(!tracker.record_chunk(t0, false, false));
        assert!(!tracker.record_chunk(t0 + Duration::from_millis(200), true, false));
        assert!(tracker.record_chunk(t0 + Duration::from_millis(2700), true, true));
        assert_eq!(tracker.settled_thinking_ms(), Some(2500));
        assert_eq!(tracker.finalize(t0 + Duration::from_millis(4000)), Some(2500));
    }

    #[test]
    fn test_thinking_tracker_explicit_short_reasoning_is_preserved() {
        let t0 = Instant::now();
        let mut tracker = StreamThinkingTracker::new(t0);
        assert!(!tracker.record_chunk(t0, true, false));
        assert!(tracker.record_chunk(t0 + Duration::from_millis(120), true, true));
        assert_eq!(tracker.settled_thinking_ms(), Some(120));
    }

    #[test]
    fn test_thinking_tracker_empty_first_chunk_fast_text_filtered_as_jitter() {
        let t0 = Instant::now();
        let mut tracker = StreamThinkingTracker::new(t0);
        assert!(!tracker.record_chunk(t0, false, false));
        assert!(tracker.record_chunk(t0 + Duration::from_millis(40), false, true));
        assert_eq!(tracker.settled_thinking_ms(), None);
        assert_eq!(tracker.finalize(t0 + Duration::from_millis(800)), None);
    }

    #[test]
    fn test_thinking_tracker_implicit_long_pause_retained() {
        let t0 = Instant::now();
        let mut tracker = StreamThinkingTracker::new(t0);
        assert!(!tracker.record_chunk(t0, false, false));
        assert!(tracker.record_chunk(t0 + Duration::from_millis(1600), false, true));
        assert_eq!(tracker.settled_thinking_ms(), Some(1600));
    }

    #[test]
    fn test_thinking_tracker_reasoning_only_without_text_finalizes_at_end() {
        let t0 = Instant::now();
        let mut tracker = StreamThinkingTracker::new(t0);
        assert!(!tracker.record_chunk(t0, true, false));
        assert_eq!(tracker.settled_thinking_ms(), None);
        assert_eq!(tracker.finalize(t0 + Duration::from_millis(900)), Some(900));
    }
}
