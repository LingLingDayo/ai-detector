use serde_json::{json, Value};

use crate::error::{AppError, AppResult};

use super::common::{
    extract_content_blocks_text, extract_error_message, non_empty_str, object_value_as_u64,
};
use super::types::{
    ApiFormat, ChatUsage, LlmCompletionRequest, ParseMode, ResponsesTextStyle, StreamParseState,
};
use super::LlmProtocol;

pub struct OpenAiResponsesProtocol;

fn extract_usage(value: &Value) -> ChatUsage {
    if !value.is_object() {
        return ChatUsage::default();
    }
    let Some(usage) = value
        .get("usage")
        .filter(|usage| usage.is_object())
        .or_else(|| value.pointer("/response/usage"))
    else {
        return ChatUsage::default();
    };
    let details = usage
        .get("input_tokens_details")
        .or_else(|| usage.get("prompt_tokens_details"));
    ChatUsage {
        input_tokens: object_value_as_u64(usage, &["input_tokens", "prompt_tokens"]),
        output_tokens: object_value_as_u64(usage, &["output_tokens", "completion_tokens"]),
        cached_tokens: details.and_then(|details| {
            object_value_as_u64(details, &["cached_tokens", "cache_read_tokens"])
        }),
        cache_write_tokens: object_value_as_u64(usage, &["cache_creation_input_tokens"]),
    }
}

fn extract_response_model(value: &Value) -> Option<String> {
    value
        .pointer("/response/model")
        .or_else(|| value.get("model"))
        .and_then(|model| model.as_str())
        .map(|model| model.trim().to_string())
        .filter(|model| !model.is_empty())
}

fn extract_delta_text(val: &Value) -> Option<String> {
    let val_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if val_type == "response.output_text.delta" {
        if let Some(delta) = val.get("delta").and_then(|d| d.as_str()) {
            return Some(delta.to_string());
        }
        if let Some(delta) = val
            .get("delta")
            .and_then(|d| d.get("text"))
            .and_then(|t| t.as_str())
        {
            return Some(delta.to_string());
        }
        return None;
    }
    // done/completed 事件包含完整文本，不能再次累加
    if val_type.starts_with("response.") {
        return None;
    }
    if let Some(delta) = val.get("delta").and_then(|d| d.as_str()) {
        return Some(delta.to_string());
    }
    if let Some(output_text) = val.get("output_text").and_then(|o| o.as_str()) {
        return Some(output_text.to_string());
    }
    if let Some(text) = val.get("text").and_then(|t| t.as_str()) {
        return Some(text.to_string());
    }
    val.get("choices")
        .and_then(|c| c.as_array())
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("delta"))
        .and_then(|d| d.get("content"))
        .and_then(|c| c.as_str())
        .map(|text| text.to_string())
}

fn has_reasoning_output(value: &Value) -> bool {
    let val_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if matches!(
        val_type,
        "response.reasoning_summary_text.delta"
            | "response.reasoning_text.delta"
            | "response.reasoning.delta"
            | "response.reasoning_summary.delta"
    ) {
        return non_empty_str(value.get("delta"))
            || non_empty_str(value.pointer("/delta/text"))
            || non_empty_str(value.get("text"));
    }
    if val_type == "response.output_item.added" {
        return value.pointer("/item/type").and_then(|t| t.as_str()) == Some("reasoning");
    }
    val_type == "response.reasoning_summary_part.added"
}

fn has_semantic_output(value: &Value) -> bool {
    let val_type = value.get("type").and_then(|t| t.as_str()).unwrap_or("");
    if matches!(
        val_type,
        "response.output_text.delta"
            | "response.reasoning_summary_text.delta"
            | "response.reasoning_text.delta"
            | "response.reasoning.delta"
            | "response.reasoning_summary.delta"
            | "response.function_call_arguments.delta"
    ) {
        return non_empty_str(value.get("delta"))
            || non_empty_str(value.pointer("/delta/text"))
            || non_empty_str(value.get("text"));
    }
    if val_type == "response.output_text.done" {
        return non_empty_str(value.get("text"));
    }
    if val_type.starts_with("response.") {
        return false;
    }
    if non_empty_str(value.get("delta"))
        || non_empty_str(value.get("output_text"))
        || non_empty_str(value.get("text"))
    {
        return true;
    }
    value
        .pointer("/choices/0/delta/content")
        .and_then(|v| v.as_str())
        .is_some_and(|s| !s.is_empty())
}

impl LlmProtocol for OpenAiResponsesProtocol {
    fn format(&self) -> ApiFormat {
        ApiFormat::Responses
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
        let input: Vec<Value> = req
            .messages
            .iter()
            .map(|message| {
                if message.images.is_empty()
                    && req.responses_text_style == ResponsesTextStyle::PlainWhenNoImages
                {
                    return json!({
                        "type": "message",
                        "role": message.role,
                        "content": message.content
                    });
                }
                let mut parts: Vec<Value> = Vec::new();
                if req.responses_text_style == ResponsesTextStyle::StructuredParts
                    || !message.content.trim().is_empty()
                {
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
            "max_output_tokens": req.max_output_tokens
        });
        if req.stream {
            body["stream"] = json!(true);
        }
        if let Some(effort) = req.reasoning_effort.as_deref() {
            let trimmed = effort.trim();
            if !trimmed.is_empty() && trimmed != "none" {
                body["reasoning"] = json!({ "effort": trimmed });
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

        if state.text.is_empty()
            && value.get("type").and_then(|t| t.as_str()) == Some("response.output_text.done")
        {
            if let Some(text) = value.get("text").and_then(|t| t.as_str()) {
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
            }
        }
        Ok(())
    }

    fn parse_non_streaming(&self, value: &Value, mode: ParseMode) -> AppResult<StreamParseState> {
        if mode == ParseMode::LenientChat {
            if let Some(message) = extract_error_message(value) {
                return Err(AppError::UpstreamProtocol(message));
            }
        }

        let text = if let Some(output_text) = value.get("output_text").and_then(|o| o.as_str()) {
            if mode == ParseMode::StrictProbe {
                output_text.trim().to_string()
            } else if !output_text.is_empty() {
                output_text.to_string()
            } else {
                extract_from_outputs_or_fallback(value)
            }
        } else {
            let extracted = extract_from_outputs_or_fallback(value);
            if mode == ParseMode::StrictProbe
                && extracted.is_empty()
                && value.get("output").is_none()
                && value.get("content").is_none()
                && value.pointer("/choices/0/message/content").is_none()
            {
                return Err(AppError::UpstreamProtocol(
                    "无法从上游 responses 响应中解析出文本内容".to_string(),
                ));
            }
            extracted
        };

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

fn extract_from_outputs_or_fallback(value: &Value) -> String {
    if let Some(outputs) = value.get("output").and_then(|o| o.as_array()) {
        let mut full = String::new();
        for item in outputs {
            let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if item_type == "reasoning"
                || item_type == "compaction_summary"
                || item_type == "function_call"
            {
                continue;
            }
            if let Some(t) = item.get("text").and_then(|s| s.as_str()) {
                full.push_str(t);
            } else if let Some(content) = item.get("content") {
                full.push_str(&extract_content_blocks_text(content));
            }
        }
        if !full.is_empty() {
            return full;
        }
        return value
            .pointer("/choices/0/message/content")
            .map(extract_content_blocks_text)
            .unwrap_or_default();
    }
    if let Some(content) = value.get("content") {
        return extract_content_blocks_text(content);
    }
    value
        .pointer("/choices/0/message/content")
        .map(extract_content_blocks_text)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::sse::{parse_sse_str, scan_sse_str};
    use crate::provider::types::{LlmImage, LlmMessage};

    #[test]
    fn test_build_responses_body_images() {
        let req = LlmCompletionRequest {
            base_url: "https://api.example.com".to_string(),
            api_key: "sk-test".to_string(),
            model: "gpt-5.1".to_string(),
            api_format: ApiFormat::Responses,
            messages: vec![LlmMessage {
                role: "user".to_string(),
                content: "看图".to_string(),
                images: vec![LlmImage {
                    mime_type: "image/png".to_string(),
                    data: "aGVsbG8=".to_string(),
                }],
            }],
            reasoning_effort: Some("high".to_string()),
            stream: false,
            timeout_seconds: 90,
            user_agent: None,
            max_output_tokens: 8192,
            adaptive_max_tokens: 16384,
            include_usage_in_stream: true,
            responses_text_style: ResponsesTextStyle::PlainWhenNoImages,
        };
        let responses = OpenAiResponsesProtocol.build_request_body(&req);
        assert_eq!(responses["input"][0]["content"][1]["type"], "input_image");
        assert!(responses.get("stream").is_none());
        assert_eq!(responses["reasoning"]["effort"], "high");
    }

    #[test]
    fn test_parse_streaming_body_responses_done_only() {
        let sse = "data: {\"type\":\"response.output_text.done\",\"text\":\"Hello\"}\n\n";
        assert_eq!(
            parse_sse_str(sse, &OpenAiResponsesProtocol, ParseMode::StrictProbe)
                .unwrap()
                .text,
            "Hello"
        );
        assert_eq!(
            scan_sse_str(sse, &OpenAiResponsesProtocol, ParseMode::StrictProbe).text,
            "Hello"
        );
    }

    #[test]
    fn test_parse_chat_streaming_responses_without_duplicate_done_text() {
        let sse = concat!(
            "data: {\"type\":\"response.created\",\"response\":{\"model\":\"gpt-5.1\"}}\n\n",
            "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hi\"}\n\n",
            "data: {\"type\":\"response.output_text.done\",\"text\":\"Hi\"}\n\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"model\":\"gpt-5.1\",\"usage\":{\"input_tokens\":50,\"output_tokens\":2,\"input_tokens_details\":{\"cached_tokens\":40}}}}\n\n"
        );
        let state =
            parse_sse_str(sse, &OpenAiResponsesProtocol, ParseMode::LenientChat).unwrap();
        assert_eq!(state.text, "Hi");
        assert_eq!(state.response_model.as_deref(), Some("gpt-5.1"));
        assert_eq!(state.usage.input_tokens, Some(50));
        assert_eq!(state.usage.cached_tokens, Some(40));
    }

    #[test]
    fn test_scan_chat_stream_detects_responses_reasoning() {
        let created = "data: {\"type\":\"response.created\",\"response\":{\"model\":\"gpt-5.1\"}}\n\n";
        let state_created = scan_sse_str(created, &OpenAiResponsesProtocol, ParseMode::StrictProbe);
        assert!(!state_created.has_reasoning);

        let text_only = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"<svg>\"}\n\n";
        let state_text = scan_sse_str(text_only, &OpenAiResponsesProtocol, ParseMode::StrictProbe);
        assert!(!state_text.has_reasoning);

        let responses_reasoning =
            "data: {\"type\":\"response.reasoning_summary_text.delta\",\"delta\":\"thinking\"}\n\n";
        let state = scan_sse_str(
            responses_reasoning,
            &OpenAiResponsesProtocol,
            ParseMode::LenientChat,
        );
        assert!(state.has_semantic_output);
        assert!(state.has_reasoning);
        assert!(state.text.is_empty());

        let item_added = "data: {\"type\":\"response.output_item.added\",\"item\":{\"type\":\"reasoning\"}}\n\n";
        assert!(scan_sse_str(item_added, &OpenAiResponsesProtocol, ParseMode::StrictProbe).has_reasoning);

        let summary_added = "data: {\"type\":\"response.reasoning_summary_part.added\"}\n\n";
        assert!(scan_sse_str(summary_added, &OpenAiResponsesProtocol, ParseMode::StrictProbe).has_reasoning);
    }
}
