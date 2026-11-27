use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

use super::common::{
    extract_content_blocks_text, extract_error_message, has_non_empty_text_array, non_empty_str,
    object_value_as_u64,
};
use super::types::{ApiFormat, ChatUsage, LlmCompletionRequest, ParseMode, StreamParseState};
use super::LlmProtocol;

pub struct OpenAiChatProtocol;

/// MiMo V2.6 仅支持 thinking.type 开关与 max_completion_tokens，不支持 reasoning_effort
pub fn is_mimo_thinking_switch_model(model: &str) -> bool {
    let m = model.trim().to_lowercase();
    let base = m.rsplit('/').next().unwrap_or(&m);
    base.starts_with("mimo-v2.6-pro") || base.starts_with("mimo-v2.6-flash")
}

fn extract_usage(value: &Value) -> ChatUsage {
    if !value.is_object() {
        return ChatUsage::default();
    }
    let Some(usage) = value
        .get("usage")
        .filter(|usage| usage.is_object())
        .or_else(|| value.get("usageMetadata"))
    else {
        return ChatUsage::default();
    };
    let details = usage
        .get("prompt_tokens_details")
        .or_else(|| usage.get("input_tokens_details"));
    ChatUsage {
        input_tokens: object_value_as_u64(usage, &["prompt_tokens", "input_tokens"]),
        output_tokens: object_value_as_u64(usage, &["completion_tokens", "output_tokens"]),
        cached_tokens: details
            .and_then(|details| object_value_as_u64(details, &["cached_tokens", "cache_read_tokens"]))
            .or_else(|| object_value_as_u64(usage, &["cached_tokens", "prompt_cache_hit_tokens"])),
        cache_write_tokens: object_value_as_u64(
            usage,
            &["cache_creation_input_tokens", "prompt_cache_miss_tokens"],
        ),
    }
}

fn extract_response_model(value: &Value) -> Option<String> {
    value
        .get("model")
        .or_else(|| value.pointer("/response/model"))
        .and_then(|model| model.as_str())
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty())
}

fn extract_delta_text(val: &Value) -> Option<String> {
    let choice = val.get("choices").and_then(|c| c.as_array())?.get(0)?;
    let delta = choice.get("delta")?;
    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
        return Some(content.to_string());
    }
    if let Some(parts) = delta.get("content").and_then(|c| c.as_array()) {
        let mut text = String::new();
        for part in parts {
            if let Some(t) = part.get("text").and_then(|s| s.as_str()) {
                text.push_str(t);
            }
        }
        if !text.is_empty() {
            return Some(text);
        }
    }
    None
}

fn has_reasoning_output(value: &Value) -> bool {
    let Some(choice) = value
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|c| c.get(0))
    else {
        return false;
    };
    if let Some(delta) = choice.get("delta") {
        if non_empty_str(delta.get("reasoning_content"))
            || non_empty_str(delta.get("reasoning"))
            || non_empty_str(delta.get("thinking"))
            || has_non_empty_text_array(delta.get("reasoning_details"))
        {
            return true;
        }
    }
    if let Some(message) = choice.get("message") {
        if non_empty_str(message.get("reasoning_content"))
            || non_empty_str(message.get("reasoning"))
            || non_empty_str(message.get("thinking"))
            || has_non_empty_text_array(message.get("reasoning_details"))
        {
            return true;
        }
    }
    false
}

fn has_semantic_output(value: &Value) -> bool {
    let Some(choice) = value
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|c| c.get(0))
    else {
        return false;
    };
    if let Some(delta) = choice.get("delta") {
        if non_empty_str(delta.get("content"))
            || has_non_empty_text_array(delta.get("content"))
            || non_empty_str(delta.get("reasoning_content"))
            || non_empty_str(delta.get("reasoning"))
            || non_empty_str(delta.get("thinking"))
            || has_non_empty_text_array(delta.get("reasoning_details"))
        {
            return true;
        }
        if delta
            .get("tool_calls")
            .and_then(|t| t.as_array())
            .map(|arr| !arr.is_empty())
            .unwrap_or(false)
        {
            return true;
        }
    }
    if let Some(message) = choice.get("message") {
        if non_empty_str(message.get("content"))
            || has_non_empty_text_array(message.get("content"))
            || non_empty_str(message.get("reasoning_content"))
            || non_empty_str(message.get("reasoning"))
        {
            return true;
        }
    }
    false
}

fn check_finish_reason(reason: &str) -> AppResult<()> {
    if reason == "length" {
        return Err(AppError::UpstreamProtocol(
            "回答被长度截断（finish_reason: length），本次回答无效".to_string(),
        ));
    }
    if reason == "content_filter" {
        return Err(AppError::UpstreamProtocol(
            "回答触发内容安全拦截（content_filter），本次回答无效".to_string(),
        ));
    }
    Ok(())
}

impl LlmProtocol for OpenAiChatProtocol {
    fn format(&self) -> ApiFormat {
        ApiFormat::ChatCompletions
    }

    fn apply_auth_headers(
        &self,
        builder: reqwest::RequestBuilder,
        api_key: &str,
    ) -> reqwest::RequestBuilder {
        builder.header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", api_key.trim()),
        )
    }

    fn build_request_body(&self, req: &LlmCompletionRequest) -> Value {
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
            body["max_completion_tokens"] = json!(req.max_output_tokens);
        } else {
            body["max_tokens"] = json!(req.max_output_tokens);
        }
        if req.stream {
            body["stream"] = json!(true);
            if req.include_usage_in_stream {
                body["stream_options"] = json!({ "include_usage": true });
            }
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

    fn apply_stream_event(
        &self,
        value: &Value,
        state: &mut StreamParseState,
        mode: ParseMode,
    ) -> AppResult<()> {
        if let Some(message) = extract_error_message(value) {
            if mode == ParseMode::StrictProbe {
                return Err(AppError::UpstreamProtocol(message));
            }
            if state.error_message.is_none() {
                state.error_message = Some(message);
            }
            return Ok(());
        }

        if let Some(model) = extract_response_model(value) {
            state.response_model = Some(model);
        }
        let usage = extract_usage(value);
        if usage.has_any() {
            state.usage.merge(&usage);
        }
        if let Some(reason) = value
            .pointer("/choices/0/finish_reason")
            .and_then(|r| r.as_str())
        {
            state.finish_reason = Some(reason.to_string());
        }
        if !state.has_semantic_output && has_semantic_output(value) {
            state.has_semantic_output = true;
        }
        if !state.has_reasoning && has_reasoning_output(value) {
            state.has_reasoning = true;
        }
        if let Some(delta) = extract_delta_text(value) {
            if !delta.is_empty() {
                state.has_semantic_output = true;
            }
            state.text.push_str(&delta);
            return Ok(());
        }

        if mode == ParseMode::LenientChat && state.text.is_empty() {
            if let Some(text) = value
                .pointer("/choices/0/message/content")
                .and_then(|content| content.as_str())
            {
                if !text.is_empty() {
                    state.has_semantic_output = true;
                }
                state.text = text.to_string();
            }
        }
        Ok(())
    }

    fn validate_stream_finish(&self, state: &StreamParseState, mode: ParseMode) -> AppResult<()> {
        if mode == ParseMode::StrictProbe {
            if let Some(reason) = state.finish_reason.as_deref() {
                check_finish_reason(reason)?;
            }
        }
        Ok(())
    }

    fn parse_non_streaming(&self, value: &Value, mode: ParseMode) -> AppResult<StreamParseState> {
        if mode == ParseMode::StrictProbe {
            let choice = value
                .get("choices")
                .and_then(|c| c.get(0))
                .ok_or_else(|| AppError::UpstreamProtocol("响应中缺少 choices 数据".to_string()))?;

            if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str()) {
                check_finish_reason(reason)?;
            }

            let message = choice
                .get("message")
                .ok_or_else(|| AppError::UpstreamProtocol("响应中缺少 message 数据".to_string()))?;

            let content_val = message
                .get("content")
                .ok_or_else(|| AppError::UpstreamProtocol("响应中缺少 content 内容".to_string()))?;

            let text = if let Some(s) = content_val.as_str() {
                s.to_string()
            } else if let Some(arr) = content_val.as_array() {
                let mut combined = String::new();
                for item in arr {
                    if let Some(t) = item.get("text").and_then(|s| s.as_str()) {
                        combined.push_str(t);
                    }
                }
                combined
            } else {
                content_val.to_string()
            };

            return Ok(StreamParseState {
                has_semantic_output: !text.is_empty(),
                has_reasoning: false,
                text,
                response_model: extract_response_model(value),
                usage: extract_usage(value),
                finish_reason: choice
                    .get("finish_reason")
                    .and_then(|r| r.as_str())
                    .map(|s| s.to_string()),
                error_message: None,
                saw_sse_data: false,
            });
        }

        if let Some(message) = extract_error_message(value) {
            return Err(AppError::UpstreamProtocol(message));
        }
        let text = value
            .pointer("/choices/0/message/content")
            .map(extract_content_blocks_text)
            .or_else(|| value.get("content").map(extract_content_blocks_text))
            .unwrap_or_default();
        Ok(StreamParseState {
            has_semantic_output: !text.is_empty(),
            has_reasoning: false,
            text,
            response_model: extract_response_model(value),
            usage: extract_usage(value),
            finish_reason: None,
            error_message: None,
            saw_sse_data: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::sse::{parse_sse_str, scan_sse_str};
    use crate::provider::types::{LlmImage, LlmMessage, ResponsesTextStyle};

    fn sample_request(model: &str, stream: bool) -> LlmCompletionRequest {
        LlmCompletionRequest {
            base_url: "https://api.example.com".to_string(),
            api_key: "sk-test".to_string(),
            model: model.to_string(),
            api_format: ApiFormat::ChatCompletions,
            messages: vec![LlmMessage {
                role: "user".to_string(),
                content: "看看这张图".to_string(),
                images: vec![LlmImage {
                    mime_type: "image/png".to_string(),
                    data: "aGVsbG8=".to_string(),
                }],
            }],
            reasoning_effort: Some("high".to_string()),
            stream,
            timeout_seconds: 90,
            user_agent: None,
            max_output_tokens: 8192,
            adaptive_max_tokens: 16384,
            include_usage_in_stream: true,
            responses_text_style: ResponsesTextStyle::PlainWhenNoImages,
        }
    }

    #[test]
    fn test_build_request_body_with_image_and_mimo_switch() {
        let protocol = OpenAiChatProtocol;
        let body = protocol.build_request_body(&sample_request("test-model", true));
        assert_eq!(body["stream"], true);
        assert_eq!(body["stream_options"]["include_usage"], true);
        assert_eq!(body["messages"][0]["content"][0]["type"], "text");
        assert_eq!(body["messages"][0]["content"][1]["type"], "image_url");
        assert_eq!(
            body["messages"][0]["content"][1]["image_url"]["url"],
            "data:image/png;base64,aGVsbG8="
        );
        assert_eq!(body["reasoning_effort"], "high");

        let mimo = protocol.build_request_body(&sample_request("xiaomi/mimo-v2.6-pro", false));
        assert_eq!(mimo["max_completion_tokens"], 8192);
        assert!(mimo.get("max_tokens").is_none());
        assert_eq!(mimo["thinking"]["type"], "enabled");
    }

    #[test]
    fn test_parse_non_streaming_chat_completions() {
        let json = serde_json::json!({
            "choices": [{ "message": { "role": "assistant", "content": "42" } }]
        });
        let state = OpenAiChatProtocol
            .parse_non_streaming(&json, ParseMode::StrictProbe)
            .unwrap();
        assert_eq!(state.text, "42");
    }

    #[test]
    fn test_parse_non_streaming_strict_rejects_length_truncation() {
        let json = serde_json::json!({
            "choices": [{ "finish_reason": "length", "message": { "content": "partial" } }]
        });
        let err = OpenAiChatProtocol
            .parse_non_streaming(&json, ParseMode::StrictProbe)
            .unwrap_err();
        assert!(err.to_string().contains("finish_reason: length"));
    }

    #[test]
    fn test_parse_streaming_body_openai() {
        let sse = "data: {\"choices\": [{\"delta\": {\"content\": \"Hello\"}}]}\n\ndata: {\"choices\": [{\"delta\": {\"content\": \" World\"}}]}\n\ndata: [DONE]\n\n";
        let state = parse_sse_str(sse, &OpenAiChatProtocol, ParseMode::StrictProbe).unwrap();
        assert_eq!(state.text, "Hello World");
    }

    #[test]
    fn test_parse_chat_non_streaming_with_model_and_usage() {
        let json = serde_json::json!({
            "model": "relay/gpt-4o",
            "choices": [{ "message": { "role": "assistant", "content": "你好" } }],
            "usage": {
                "prompt_tokens": 120,
                "completion_tokens": 8,
                "prompt_tokens_details": { "cached_tokens": 64 }
            }
        });
        let state = OpenAiChatProtocol
            .parse_non_streaming(&json, ParseMode::LenientChat)
            .unwrap();
        assert_eq!(state.text, "你好");
        assert_eq!(state.response_model.as_deref(), Some("relay/gpt-4o"));
        assert_eq!(state.usage.input_tokens, Some(120));
        assert_eq!(state.usage.output_tokens, Some(8));
        assert_eq!(state.usage.cached_tokens, Some(64));
    }

    #[test]
    fn test_parse_chat_streaming_chat_completions() {
        let sse = concat!(
            "data: {\"model\":\"relay/gpt-4o\",\"choices\":[{\"delta\":{\"content\":\"你\"}}]}\n\n",
            "data: {\"model\":\"relay/gpt-4o\",\"choices\":[{\"delta\":{\"content\":\"好\"}}]}\n\n",
            "data: {\"model\":\"relay/gpt-4o\",\"choices\":[],\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":2,\"prompt_cache_hit_tokens\":80}}\n\n",
            "data: [DONE]\n\n"
        );
        let state = parse_sse_str(sse, &OpenAiChatProtocol, ParseMode::LenientChat).unwrap();
        assert_eq!(state.text, "你好");
        assert_eq!(state.response_model.as_deref(), Some("relay/gpt-4o"));
        assert_eq!(state.usage.input_tokens, Some(100));
        assert_eq!(state.usage.output_tokens, Some(2));
        assert_eq!(state.usage.cached_tokens, Some(80));
    }

    #[test]
    fn test_scan_chat_stream_detects_reasoning_semantic_output() {
        let empty_role = "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\",\"content\":\"\"}}]}\n\n";
        let state_empty = scan_sse_str(empty_role, &OpenAiChatProtocol, ParseMode::LenientChat);
        assert!(!state_empty.has_semantic_output);
        assert!(!state_empty.has_reasoning);
        assert!(state_empty.text.is_empty());

        let pure_text = "data: {\"choices\":[{\"delta\":{\"content\":\"<svg>\"}}]}\n\n";
        let state_text = scan_sse_str(pure_text, &OpenAiChatProtocol, ParseMode::StrictProbe);
        assert!(state_text.has_semantic_output);
        assert!(!state_text.has_reasoning);

        let reasoning_sse = "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"think...\"}}]}\n\n";
        let state_reasoning =
            scan_sse_str(reasoning_sse, &OpenAiChatProtocol, ParseMode::LenientChat);
        assert!(state_reasoning.has_semantic_output);
        assert!(state_reasoning.has_reasoning);
        assert!(state_reasoning.text.is_empty());

        let reasoning_alt = "data: {\"choices\":[{\"delta\":{\"reasoning\":\"step\"}}]}\n\n";
        assert!(scan_sse_str(reasoning_alt, &OpenAiChatProtocol, ParseMode::StrictProbe).has_reasoning);

        let thinking_alt = "data: {\"choices\":[{\"delta\":{\"thinking\":\"step\"}}]}\n\n";
        assert!(scan_sse_str(thinking_alt, &OpenAiChatProtocol, ParseMode::StrictProbe).has_reasoning);

        let details_alt = "data: {\"choices\":[{\"delta\":{\"reasoning_details\":[{\"text\":\"step\"}]}}]}\n\n";
        assert!(scan_sse_str(details_alt, &OpenAiChatProtocol, ParseMode::StrictProbe).has_reasoning);
    }
}
