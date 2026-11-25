use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

use super::common::{
    extract_content_blocks_text, extract_error_message, non_empty_str, object_value_as_u64,
};
use super::types::{ApiFormat, ChatUsage, LlmCompletionRequest, ParseMode, StreamParseState};
use super::LlmProtocol;

pub struct AnthropicProtocol;

pub fn is_adaptive_thinking_required(model: &str) -> bool {
    let m = model.to_lowercase();
    if m.contains("claude")
        && (m.contains("-5")
            || m.contains(".5")
            || m.contains("-4-7")
            || m.contains("-4-8")
            || m.contains(".4.7")
            || m.contains(".4.8"))
    {
        return true;
    }
    false
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

fn extract_usage(value: &Value) -> ChatUsage {
    if !value.is_object() {
        return ChatUsage::default();
    }
    let Some(usage) = value
        .get("usage")
        .filter(|usage| usage.is_object())
        .or_else(|| value.pointer("/message/usage"))
        .or_else(|| value.pointer("/delta/usage"))
    else {
        return ChatUsage::default();
    };
    let input = object_value_as_u64(usage, &["input_tokens"]);
    let cache_read = object_value_as_u64(usage, &["cache_read_input_tokens"]);
    let cache_write = object_value_as_u64(usage, &["cache_creation_input_tokens"]);
    let has_input_parts = input.is_some() || cache_read.is_some() || cache_write.is_some();
    ChatUsage {
        input_tokens: if has_input_parts {
            Some(input.unwrap_or(0) + cache_read.unwrap_or(0) + cache_write.unwrap_or(0))
        } else {
            None
        },
        output_tokens: object_value_as_u64(usage, &["output_tokens"]),
        cached_tokens: cache_read,
        cache_write_tokens: cache_write,
    }
}

fn extract_response_model(value: &Value) -> Option<String> {
    value
        .pointer("/message/model")
        .or_else(|| value.get("model"))
        .and_then(|model| model.as_str())
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty())
}

fn extract_delta_text(val: &Value) -> Option<String> {
    if val.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
        let delta = val.get("delta")?;
        if delta.get("type").and_then(|t| t.as_str()) == Some("text_delta") {
            return delta
                .get("text")
                .and_then(|t| t.as_str())
                .map(|text| text.to_string());
        }
    }
    None
}

fn has_semantic_output(value: &Value) -> bool {
    if value.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
        let Some(delta) = value.get("delta") else {
            return false;
        };
        let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
        return match delta_type {
            "text_delta" => non_empty_str(delta.get("text")),
            "thinking_delta" => non_empty_str(delta.get("thinking")),
            "input_json_delta" => non_empty_str(delta.get("partial_json")),
            _ => false,
        };
    }
    false
}

fn check_stop_reason(reason: &str) -> AppResult<()> {
    if reason == "refusal" {
        return Err(AppError::UpstreamProtocol(
            "模型拒绝生成数值，本次回答无效".to_string(),
        ));
    }
    if reason == "max_tokens" {
        return Err(AppError::UpstreamProtocol(
            "回答因达到 max_tokens 上限被截断，本次回答无效".to_string(),
        ));
    }
    Ok(())
}

impl LlmProtocol for AnthropicProtocol {
    fn format(&self) -> ApiFormat {
        ApiFormat::Anthropic
    }

    fn apply_auth_headers(
        &self,
        builder: reqwest::RequestBuilder,
        api_key: &str,
    ) -> reqwest::RequestBuilder {
        let trimmed = api_key.trim();
        builder
            .header("x-api-key", trimmed)
            .header(reqwest::header::AUTHORIZATION, format!("Bearer {trimmed}"))
            .header("anthropic-version", "2023-06-01")
    }

    fn build_request_body(&self, req: &LlmCompletionRequest) -> Value {
        let messages: Vec<Value> = req
            .messages
            .iter()
            .map(|message| {
                if message.images.is_empty() {
                    return json!({ "role": message.role, "content": message.content });
                }
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
                json!({ "role": message.role, "content": parts })
            })
            .collect();

        let mut body = json!({
            "model": req.model.trim(),
            "max_tokens": req.max_output_tokens,
            "messages": messages
        });
        if req.stream {
            body["stream"] = json!(true);
        }
        if let Some(effort) = req.reasoning_effort.as_deref() {
            let trimmed = effort.trim();
            if !trimmed.is_empty() && trimmed != "none" {
                if is_adaptive_thinking_required(&req.model) {
                    body["thinking"] = json!({ "type": "adaptive" });
                    body["output_config"] = json!({ "effort": trimmed });
                    body["max_tokens"] = json!(req.adaptive_max_tokens);
                } else {
                    let budget = anthropic_budget(trimmed);
                    body["thinking"] = json!({
                        "type": "enabled",
                        "budget_tokens": budget
                    });
                    body["max_tokens"] = json!((budget + 2048).max(req.max_output_tokens));
                }
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

        if mode == ParseMode::StrictProbe
            && value.get("type").and_then(|t| t.as_str()) == Some("message_delta")
        {
            if let Some(stop_reason) = value
                .pointer("/delta/stop_reason")
                .and_then(|s| s.as_str())
            {
                check_stop_reason(stop_reason)?;
            }
        }

        if let Some(model) = extract_response_model(value) {
            state.response_model = Some(model);
        }
        let usage = extract_usage(value);
        if usage.has_any() {
            state.usage.merge(&usage);
        }
        if !state.has_semantic_output && has_semantic_output(value) {
            state.has_semantic_output = true;
        }
        if let Some(delta) = extract_delta_text(value) {
            if !delta.is_empty() {
                state.has_semantic_output = true;
            }
            state.text.push_str(&delta);
        }
        Ok(())
    }

    fn validate_stream_finish(&self, _state: &StreamParseState, _mode: ParseMode) -> AppResult<()> {
        Ok(())
    }

    fn parse_non_streaming(&self, value: &Value, mode: ParseMode) -> AppResult<StreamParseState> {
        if mode == ParseMode::StrictProbe {
            if let Some(stop_reason) = value.get("stop_reason").and_then(|s| s.as_str()) {
                check_stop_reason(stop_reason)?;
            }
            let mut full = String::new();
            if let Some(blocks) = value.get("content").and_then(|c| c.as_array()) {
                for block in blocks {
                    if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                        if let Some(t) = block.get("text").and_then(|s| s.as_str()) {
                            full.push_str(t);
                        }
                    }
                }
            }
            return Ok(StreamParseState {
                has_semantic_output: !full.is_empty(),
                text: full,
                response_model: extract_response_model(value),
                usage: extract_usage(value),
                finish_reason: None,
                error_message: None,
                saw_sse_data: false,
            });
        }

        if let Some(message) = extract_error_message(value) {
            return Err(AppError::UpstreamProtocol(message));
        }
        let text = value
            .get("content")
            .map(extract_content_blocks_text)
            .unwrap_or_default();
        Ok(StreamParseState {
            has_semantic_output: !text.is_empty(),
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

    #[test]
    fn test_build_anthropic_body_with_image_and_adaptive_thinking() {
        let req = LlmCompletionRequest {
            base_url: "https://api.anthropic.com".to_string(),
            api_key: "sk-ant".to_string(),
            model: "claude-sonnet-4-5".to_string(),
            api_format: ApiFormat::Anthropic,
            messages: vec![LlmMessage {
                role: "user".to_string(),
                content: "看图".to_string(),
                images: vec![LlmImage {
                    mime_type: "image/png".to_string(),
                    data: "aGVsbG8=".to_string(),
                }],
            }],
            reasoning_effort: Some("high".to_string()),
            stream: true,
            timeout_seconds: 90,
            user_agent: None,
            max_output_tokens: 8192,
            adaptive_max_tokens: 16384,
            include_usage_in_stream: true,
            responses_text_style: ResponsesTextStyle::PlainWhenNoImages,
        };
        let body = AnthropicProtocol.build_request_body(&req);
        assert_eq!(body["messages"][0]["content"][0]["type"], "image");
        assert_eq!(body["messages"][0]["content"][0]["source"]["media_type"], "image/png");
        assert_eq!(body["thinking"]["type"], "adaptive");
        assert_eq!(body["output_config"]["effort"], "high");
        assert_eq!(body["max_tokens"], 16384);
    }

    #[test]
    fn test_parse_non_streaming_anthropic() {
        let json = serde_json::json!({
            "content": [{ "type": "text", "text": "Hello Anthropic" }]
        });
        let state = AnthropicProtocol
            .parse_non_streaming(&json, ParseMode::StrictProbe)
            .unwrap();
        assert_eq!(state.text, "Hello Anthropic");
    }

    #[test]
    fn test_parse_non_streaming_anthropic_strict_rejects_refusal() {
        let json = serde_json::json!({
            "stop_reason": "refusal",
            "content": []
        });
        let err = AnthropicProtocol
            .parse_non_streaming(&json, ParseMode::StrictProbe)
            .unwrap_err();
        assert!(err.to_string().contains("拒绝"));
    }

    #[test]
    fn test_parse_streaming_progress_anthropic() {
        let sse = "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n";
        let state = scan_sse_str(sse, &AnthropicProtocol, ParseMode::StrictProbe);
        assert_eq!(state.text, "Hello");
    }

    #[test]
    fn test_parse_chat_streaming_anthropic_cache_usage() {
        let sse = concat!(
            "data: {\"type\":\"message_start\",\"message\":{\"model\":\"claude-sonnet-4-5\",\"usage\":{\"input_tokens\":100,\"cache_read_input_tokens\":800,\"cache_creation_input_tokens\":50,\"output_tokens\":1}}}\n\n",
            "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":20}}\n\n"
        );
        let state = parse_sse_str(sse, &AnthropicProtocol, ParseMode::LenientChat).unwrap();
        assert_eq!(state.text, "Hello");
        assert_eq!(state.usage.input_tokens, Some(950));
        assert_eq!(state.usage.cached_tokens, Some(800));
        assert_eq!(state.usage.cache_write_tokens, Some(50));
        assert_eq!(state.usage.output_tokens, Some(20));
    }

    #[test]
    fn test_scan_chat_stream_detects_anthropic_thinking() {
        let anthropic_thinking = concat!(
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}\n\n",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"step 1\"}}\n\n"
        );
        let state = scan_sse_str(anthropic_thinking, &AnthropicProtocol, ParseMode::LenientChat);
        assert!(state.has_semantic_output);
        assert!(state.text.is_empty());
    }
}
