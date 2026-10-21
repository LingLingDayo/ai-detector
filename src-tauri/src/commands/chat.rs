use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::Emitter;

use crate::parser::{parse_chat_non_streaming_json, parse_chat_streaming_body, scan_chat_stream, ChatParseState};
use crate::types::{
    ChatRequest, ChatResponse, ChatStreamProgressPayload, ChatStreamStartPayload,
};
use crate::utils::{
    compact_error, is_adaptive_thinking_required, is_mimo_thinking_switch_model, normalize_url,
};

use super::probe::DEFAULT_USER_AGENT;

const MAX_OUTPUT_TOKENS: u64 = 8192;

static CANCELED_CHAT_REQUESTS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn canceled_requests() -> &'static Mutex<HashSet<String>> {
    CANCELED_CHAT_REQUESTS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn mark_chat_canceled(request_id: &str) {
    if let Ok(mut requests) = canceled_requests().lock() {
        requests.insert(request_id.to_string());
    }
}

fn take_chat_canceled(request_id: &str) -> bool {
    canceled_requests()
        .lock()
        .map(|mut requests| requests.remove(request_id))
        .unwrap_or(false)
}

fn is_chat_canceled(request_id: &str) -> bool {
    canceled_requests()
        .lock()
        .map(|requests| requests.contains(request_id))
        .unwrap_or(false)
}

#[tauri::command]
pub fn cancel_chat_request(request_id: String) {
    mark_chat_canceled(&request_id);
}

fn anthropic_budget(effort: &str) -> u64 {
    match effort {
        "minimal" => 1024,
        "low" => 2048,
        "medium" => 4096,
        "high" => 8192,
        "xhigh" => 16384,
        "max" => 32768,
        _ => 8192,
    }
}

fn build_chat_body(req: &ChatRequest, is_stream: bool) -> Value {
    if req.api_format == "anthropic" {
        let messages: Vec<Value> = req
            .messages
            .iter()
            .map(|message| {
                let mut parts: Vec<Value> = message
                    .images
                    .iter()
                    .map(|image| {
                        json!({
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": image.mime_type,
                                "data": image.data
                            }
                        })
                    })
                    .collect();
                if !message.content.trim().is_empty() {
                    parts.push(json!({
                        "type": "text",
                        "text": message.content
                    }));
                }
                let content = if message.images.is_empty() {
                    json!(message.content)
                } else {
                    json!(parts)
                };
                json!({ "role": message.role, "content": content })
            })
            .collect();

        let mut body = json!({
            "model": req.model.trim(),
            "max_tokens": MAX_OUTPUT_TOKENS,
            "messages": messages
        });
        if is_stream {
            body["stream"] = json!(true);
        }
        if let Some(effort) = req.reasoning_effort.as_deref() {
            let effort = effort.trim();
            if !effort.is_empty() && effort != "none" {
                if is_adaptive_thinking_required(&req.model) {
                    body["thinking"] = json!({ "type": "adaptive" });
                    body["output_config"] = json!({ "effort": effort });
                    body["max_tokens"] = json!(16384);
                } else {
                    let budget = anthropic_budget(effort);
                    body["thinking"] = json!({
                        "type": "enabled",
                        "budget_tokens": budget
                    });
                    body["max_tokens"] = json!((budget + 2048).max(MAX_OUTPUT_TOKENS));
                }
            }
        }
        return body;
    }

    if req.api_format == "responses" || req.api_format == "openai_responses" {
        let input: Vec<Value> = req
            .messages
            .iter()
            .map(|message| {
                if message.images.is_empty() {
                    return json!({
                        "type": "message",
                        "role": message.role,
                        "content": message.content
                    });
                }
                let mut parts: Vec<Value> = Vec::new();
                if !message.content.trim().is_empty() {
                    parts.push(json!({
                        "type": "input_text",
                        "text": message.content
                    }));
                }
                for image in &message.images {
                    parts.push(json!({
                        "type": "input_image",
                        "image_url": format!(
                            "data:{};base64,{}",
                            image.mime_type, image.data
                        )
                    }));
                }
                json!({
                    "type": "message",
                    "role": message.role,
                    "content": parts
                })
            })
            .collect();

        let mut body = json!({
            "model": req.model.trim(),
            "input": input,
            "max_output_tokens": MAX_OUTPUT_TOKENS
        });
        if is_stream {
            body["stream"] = json!(true);
        }
        if let Some(effort) = req.reasoning_effort.as_deref() {
            let effort = effort.trim();
            if !effort.is_empty() && effort != "none" {
                body["reasoning"] = json!({ "effort": effort });
            }
        }
        return body;
    }

    let messages: Vec<Value> = req
        .messages
        .iter()
        .map(|message| {
            let content = if message.images.is_empty() {
                json!(message.content)
            } else {
                let mut parts: Vec<Value> = Vec::new();
                if !message.content.trim().is_empty() {
                    parts.push(json!({
                        "type": "text",
                        "text": message.content
                    }));
                }
                for image in &message.images {
                    parts.push(json!({
                        "type": "image_url",
                        "image_url": {
                            "url": format!(
                                "data:{};base64,{}",
                                image.mime_type, image.data
                            )
                        }
                    }));
                }
                json!(parts)
            };
            json!({ "role": message.role, "content": content })
        })
        .collect();

    let normalized_model = req.model.trim().to_lowercase();
    let is_o_series = normalized_model.starts_with("o1")
        || normalized_model.starts_with("o3")
        || normalized_model.starts_with("o4");
    let is_thinking_switch = is_mimo_thinking_switch_model(&req.model);

    let mut body = json!({
        "model": req.model.trim(),
        "messages": messages
    });
    if is_o_series || is_thinking_switch {
        body["max_completion_tokens"] = json!(MAX_OUTPUT_TOKENS);
    } else {
        body["max_tokens"] = json!(MAX_OUTPUT_TOKENS);
    }
    if is_stream {
        body["stream"] = json!(true);
        body["stream_options"] = json!({ "include_usage": true });
    }

    let effort = req.reasoning_effort.as_deref().unwrap_or("").trim();
    if is_thinking_switch {
        body["thinking"] = json!({
            "type": if effort.is_empty() || effort == "none" { "disabled" } else { "enabled" }
        });
    } else if !effort.is_empty() && effort != "none" {
        if let Ok(numeric_effort) = effort.parse::<u64>() {
            body["max_completion_tokens"] = json!(numeric_effort);
            if let Some(object) = body.as_object_mut() {
                object.remove("max_tokens");
            }
        } else {
            body["reasoning_effort"] = json!(effort);
        }
    }
    body
}

fn inspect_stream(
    app: &tauri::AppHandle,
    request_id: &str,
    api_format: &str,
    raw_bytes: &[u8],
    last_text_len: &mut usize,
    last_model: &mut Option<String>,
) -> ChatParseState {
    let body_text = String::from_utf8_lossy(raw_bytes);
    let state = scan_chat_stream(&body_text, api_format);
    let model_changed =
        state.response_model.is_some() && state.response_model != *last_model;
    if state.text.len() > *last_text_len || model_changed {
        *last_text_len = state.text.len();
        if model_changed {
            *last_model = state.response_model.clone();
        }
        let _ = app.emit(
            "connection-stream-progress",
            ChatStreamProgressPayload {
                request_id: request_id.to_string(),
                text: state.text.clone(),
                response_model: state.response_model.clone(),
            },
        );
    }
    state
}

#[tauri::command]
pub async fn send_chat_request(
    app: tauri::AppHandle,
    req: ChatRequest,
) -> Result<ChatResponse, String> {
    let is_stream = req.stream.unwrap_or(true);
    let default_timeout = if is_stream { 90 } else { 240 };
    let timeout_sec = req.timeout_seconds.unwrap_or(default_timeout).max(5);

    let client = if is_stream {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?
    } else {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(timeout_sec))
            .build()
            .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?
    };

    let target_url = normalize_url(&req.base_url, &req.api_format);
    let body = build_chat_body(&req, is_stream);
    let start_time = Instant::now();
    let _ = take_chat_canceled(&req.request_id);

    let mut request_builder = client
        .post(&target_url)
        .header(reqwest::header::USER_AGENT, DEFAULT_USER_AGENT)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header(
            reqwest::header::ACCEPT,
            if is_stream {
                "text/event-stream, application/json"
            } else {
                "application/json"
            },
        );

    if req.api_format == "anthropic" {
        request_builder = request_builder
            .header("x-api-key", req.api_key.trim())
            .header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", req.api_key.trim()),
            )
            .header("anthropic-version", "2023-06-01");
    } else {
        request_builder = request_builder.header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", req.api_key.trim()),
        );
    }

    let mut resp = if is_stream {
        match tokio::time::timeout(
            Duration::from_secs(timeout_sec),
            request_builder.json(&body).send(),
        )
        .await
        {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => return Err(format!("无法连接上游接口: {}", error)),
            Err(_) => {
                return Err(format!(
                    "流式请求首次响应超时（{} 秒内未收到上游响应）",
                    timeout_sec
                ));
            }
        }
    } else {
        match request_builder.json(&body).send().await {
            Ok(response) => response,
            Err(error) if error.is_timeout() => {
                return Err(format!("同步请求超时（{} 秒内未收到上游响应）", timeout_sec));
            }
            Err(error) => return Err(format!("无法连接上游接口: {}", error)),
        }
    };

    if is_chat_canceled(&req.request_id) {
        let _ = take_chat_canceled(&req.request_id);
        return Err("请求已取消".to_string());
    }

    let status = resp.status();
    if !status.is_success() {
        let error_body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "接口请求异常 ({}): {}",
            status.as_u16(),
            compact_error(&error_body, status)
        ));
    }

    if is_stream {
        let first_chunk_res =
            tokio::time::timeout(Duration::from_secs(timeout_sec), resp.chunk()).await;
        let first_chunk = match first_chunk_res {
            Ok(Ok(Some(bytes))) => bytes,
            Ok(Ok(None)) => return Err("上游返回了空流响应".to_string()),
            Ok(Err(error)) => return Err(format!("读取上游流式首包数据失败: {}", error)),
            Err(_) => {
                return Err(format!(
                    "流式请求首次响应超时（{} 秒内未收到模型首包响应）",
                    timeout_sec
                ));
            }
        };

        let _ = app.emit(
            "connection-stream-start",
            ChatStreamStartPayload {
                request_id: req.request_id.clone(),
            },
        );

        let mut raw_bytes = Vec::new();
        raw_bytes.extend_from_slice(&first_chunk);

        let mut first_token_ms: Option<u64> = None;
        let mut last_progress_at = Instant::now();
        let mut last_text_len = 0usize;
        let mut last_model: Option<String> = None;

        let first_state = inspect_stream(
            &app,
            &req.request_id,
            &req.api_format,
            &raw_bytes,
            &mut last_text_len,
            &mut last_model,
        );
        if !first_state.text.is_empty() {
            first_token_ms = Some(start_time.elapsed().as_millis() as u64);
        }

        loop {
            if is_chat_canceled(&req.request_id) {
                let _ = take_chat_canceled(&req.request_id);
                return Err("请求已取消".to_string());
            }
            let chunk_res =
                tokio::time::timeout(Duration::from_secs(90), resp.chunk()).await;
            match chunk_res {
                Ok(Ok(Some(bytes))) => {
                    raw_bytes.extend_from_slice(&bytes);
                    let should_inspect = first_token_ms.is_none()
                        || last_progress_at.elapsed() >= Duration::from_millis(100);
                    if should_inspect {
                        let state = inspect_stream(
                            &app,
                            &req.request_id,
                            &req.api_format,
                            &raw_bytes,
                            &mut last_text_len,
                            &mut last_model,
                        );
                        if first_token_ms.is_none() && !state.text.is_empty() {
                            first_token_ms = Some(start_time.elapsed().as_millis() as u64);
                        }
                        last_progress_at = Instant::now();
                    }
                }
                Ok(Ok(None)) => break,
                Ok(Err(error)) => {
                    return Err(format!("读取上游流式响应数据中断: {}", error));
                }
                Err(_) => {
                    return Err(
                        "上游流式响应传输中断（90 秒内未收到后续数据分片）".to_string()
                    );
                }
            }
        }

        let final_state = inspect_stream(
            &app,
            &req.request_id,
            &req.api_format,
            &raw_bytes,
            &mut last_text_len,
            &mut last_model,
        );
        if first_token_ms.is_none() && !final_state.text.is_empty() {
            first_token_ms = Some(start_time.elapsed().as_millis() as u64);
        }

        let body_text = String::from_utf8_lossy(&raw_bytes);
        let parsed = parse_chat_streaming_body(&body_text, &req.api_format)?;
        let duration_ms = start_time.elapsed().as_millis() as u64;
        let _ = take_chat_canceled(&req.request_id);

        return Ok(ChatResponse {
            text: parsed.text,
            response_model: parsed.response_model,
            usage: parsed.usage,
            raw_status: status.as_u16(),
            duration_ms,
            first_token_ms,
        });
    }

    let text = resp
        .text()
        .await
        .map_err(|error| format!("读取上游响应失败: {}", error))?;
    let parsed_json: Value = serde_json::from_str(&text)
        .map_err(|error| format!("上游未返回有效 JSON 数据: {}", error))?;
    let state = parse_chat_non_streaming_json(&parsed_json, &req.api_format)?;
    if state.text.trim().is_empty() {
        return Err("上游响应未包含有效文本内容".to_string());
    }
    let _ = take_chat_canceled(&req.request_id);

    Ok(ChatResponse {
        text: state.text,
        response_model: state.response_model,
        usage: state.usage,
        raw_status: status.as_u16(),
        duration_ms: start_time.elapsed().as_millis() as u64,
        first_token_ms: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{ChatImagePayload, ChatMessagePayload};

    fn sample_request(api_format: &str) -> ChatRequest {
        ChatRequest {
            request_id: "test-request".to_string(),
            base_url: "https://api.example.com".to_string(),
            api_key: "sk-test".to_string(),
            model: "test-model".to_string(),
            messages: vec![
                ChatMessagePayload {
                    role: "user".to_string(),
                    content: "看看这张图".to_string(),
                    images: vec![ChatImagePayload {
                        mime_type: "image/png".to_string(),
                        data: "aGVsbG8=".to_string(),
                    }],
                },
                ChatMessagePayload {
                    role: "assistant".to_string(),
                    content: "收到".to_string(),
                    images: vec![],
                },
            ],
            api_format: api_format.to_string(),
            reasoning_effort: Some("high".to_string()),
            stream: Some(true),
            timeout_seconds: Some(90),
        }
    }

    #[test]
    fn test_build_chat_body_chat_completions_with_image() {
        let body = build_chat_body(&sample_request("chat_completions"), true);
        assert_eq!(body["stream"], true);
        assert_eq!(body["stream_options"]["include_usage"], true);
        assert_eq!(body["messages"][0]["content"][0]["type"], "text");
        assert_eq!(body["messages"][0]["content"][1]["type"], "image_url");
        assert_eq!(
            body["messages"][0]["content"][1]["image_url"]["url"],
            "data:image/png;base64,aGVsbG8="
        );
        assert_eq!(body["reasoning_effort"], "high");
    }

    #[test]
    fn test_build_chat_body_anthropic_and_responses_images() {
        let anthropic = build_chat_body(&sample_request("anthropic"), true);
        assert_eq!(anthropic["messages"][0]["content"][0]["type"], "image");
        assert_eq!(
            anthropic["messages"][0]["content"][0]["source"]["media_type"],
            "image/png"
        );
        assert_eq!(anthropic["thinking"]["type"], "enabled");

        let responses = build_chat_body(&sample_request("responses"), false);
        assert_eq!(responses["input"][0]["content"][1]["type"], "input_image");
        assert!(responses.get("stream").is_none());
        assert_eq!(responses["reasoning"]["effort"], "high");
    }

    #[test]
    fn test_cancel_flags() {
        let request_id = "cancel-test-request";
        mark_chat_canceled(request_id);
        assert!(is_chat_canceled(request_id));
        assert!(take_chat_canceled(request_id));
        assert!(!is_chat_canceled(request_id));
    }
}
