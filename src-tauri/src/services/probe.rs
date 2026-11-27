use std::sync::Arc;

use crate::error::{AppError, AppResult};
use crate::infra::cancel::{CancellationRegistry, CancellationScope, CancellationToken};
use crate::infra::http::HttpClient;
use crate::provider::stream_runner::{execute_completion, CompletionStreamObserver};
use crate::provider::types::{
    ApiFormat, LlmCompletionRequest, LlmMessage, ParseMode, ResponsesTextStyle, StreamParseState,
};

#[derive(Debug, serde::Deserialize, Clone)]
pub struct ProbeRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub prompt: String,
    #[serde(default = "default_api_format")]
    pub api_format: String,
    pub reasoning_effort: Option<String>,
    pub stream: Option<bool>,
    pub timeout_seconds: Option<u64>,
    /// 用于让前端区分并发或已取消请求残留的流式事件；旧调用方可不传
    #[serde(default)]
    pub request_id: Option<String>,
    /// 客户端请求标识（User-Agent）；未传或为空白时使用默认标识
    #[serde(default)]
    pub user_agent: Option<String>,
}

pub fn default_api_format() -> String {
    "chat_completions".to_string()
}

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone, PartialEq, Eq)]
pub struct ProbeResponse {
    pub text: String,
    pub raw_status: u16,
    pub duration_ms: u64,
    #[serde(default)]
    pub thinking_ms: Option<u64>,
}

pub trait ProbeStreamSink: Send {
    fn on_start(&mut self, has_text: bool, has_reasoning: bool);
    fn on_progress(&mut self, text: &str, thinking_ms: Option<u64>);
}

pub struct NoopProbeStreamSink;

impl ProbeStreamSink for NoopProbeStreamSink {
    fn on_start(&mut self, _has_text: bool, _has_reasoning: bool) {}
    fn on_progress(&mut self, _text: &str, _thinking_ms: Option<u64>) {}
}

struct ProbeObserverAdapter<'a> {
    sink: &'a mut dyn ProbeStreamSink,
    last_len: usize,
    last_thinking_ms: Option<u64>,
}

impl CompletionStreamObserver for ProbeObserverAdapter<'_> {
    fn on_start(&mut self, state: &StreamParseState) {
        self.sink
            .on_start(!state.text.trim().is_empty(), state.has_reasoning);
    }

    fn on_progress(&mut self, state: &StreamParseState, thinking_ms: Option<u64>) {
        let thinking_changed = thinking_ms != self.last_thinking_ms;
        if state.text.len() > self.last_len || thinking_changed {
            self.last_len = state.text.len();
            self.last_thinking_ms = thinking_ms;
            self.sink.on_progress(&state.text, thinking_ms);
        }
    }
}

#[derive(Clone)]
pub struct ProbeService {
    http: HttpClient,
    cancellations: CancellationRegistry,
}

impl ProbeService {
    pub fn new(http: HttpClient, cancellations: CancellationRegistry) -> Self {
        Self {
            http,
            cancellations,
        }
    }

    pub async fn send(
        &self,
        req: ProbeRequest,
        sink: &mut dyn ProbeStreamSink,
    ) -> AppResult<ProbeResponse> {
        let is_stream = req.stream.unwrap_or(true);
        let default_timeout = if is_stream { 90 } else { 240 };
        let timeout_seconds = req.timeout_seconds.unwrap_or(default_timeout).max(5);

        let guard = req
            .request_id
            .as_deref()
            .map(|id| self.cancellations.register(CancellationScope::Probe, id));
        let mut token = guard
            .as_ref()
            .map(|g| g.token())
            .unwrap_or_else(CancellationToken::never);

        let completion_req = LlmCompletionRequest {
            base_url: req.base_url,
            api_key: req.api_key,
            model: req.model,
            api_format: ApiFormat::from_raw(&req.api_format),
            messages: vec![LlmMessage {
                role: "user".to_string(),
                content: req.prompt,
                images: Vec::new(),
            }],
            reasoning_effort: req.reasoning_effort,
            stream: is_stream,
            timeout_seconds,
            user_agent: req.user_agent,
            max_output_tokens: 65536,
            adaptive_max_tokens: 65536,
            include_usage_in_stream: false,
            responses_text_style: ResponsesTextStyle::StructuredParts,
        };

        let mut observer = ProbeObserverAdapter {
            sink,
            last_len: 0,
            last_thinking_ms: None,
        };
        let output = execute_completion(
            &self.http,
            &completion_req,
            ParseMode::StrictProbe,
            &mut token,
            &mut observer,
        )
        .await?;

        Ok(ProbeResponse {
            text: output.text,
            raw_status: output.raw_status,
            duration_ms: output.duration_ms,
            thinking_ms: output.thinking_ms,
        })
    }

    pub fn cancel(&self, request_id: &str) {
        let _ = self.cancellations.cancel(CancellationScope::Probe, request_id);
    }
}

#[allow(dead_code)]
fn _assert_probe_service_sync(_s: &Arc<ProbeService>) {}
#[allow(dead_code)]
fn _assert_err_send_sync(_e: &AppError) {}
