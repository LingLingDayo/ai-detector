pub fn extract_models_from_json(json_val: &serde_json::Value) -> Vec<String> {
    let mut models = Vec::new();

    fn extract_item(item: &serde_json::Value, list: &mut Vec<String>) {
        if let Some(s) = item.as_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                list.push(trimmed.to_string());
            }
            return;
        }
        if let Some(obj) = item.as_object() {
            for key in &["id", "model", "name", "model_name", "value"] {
                if let Some(val) = obj.get(*key).and_then(|v| v.as_str()) {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        list.push(trimmed.to_string());
                        return;
                    }
                }
            }
        }
    }

    if let Some(arr) = json_val.as_array() {
        for item in arr {
            extract_item(item, &mut models);
        }
    } else if let Some(obj) = json_val.as_object() {
        let mut found = false;
        for key in &["data", "models", "model_list", "items", "result", "list"] {
            if let Some(arr) = obj.get(*key).and_then(|v| v.as_array()) {
                for item in arr {
                    extract_item(item, &mut models);
                }
                found = true;
                break;
            }
        }

        if !found {
            for parent in &["data", "result"] {
                if let Some(parent_obj) = obj.get(*parent).and_then(|v| v.as_object()) {
                    for child in &["data", "models", "items", "list"] {
                        if let Some(arr) = parent_obj.get(*child).and_then(|v| v.as_array()) {
                            for item in arr {
                                extract_item(item, &mut models);
                            }
                            found = true;
                            break;
                        }
                    }
                    if found {
                        break;
                    }
                }
            }
        }

        if !found {
            for key in &["models", "data"] {
                if let Some(sub_obj) = obj.get(*key).and_then(|v| v.as_object()) {
                    for k in sub_obj.keys() {
                        let trimmed = k.trim();
                        if !trimmed.is_empty() {
                            models.push(trimmed.to_string());
                        }
                    }
                    if !models.is_empty() {
                        break;
                    }
                }
            }
        }
    }

    models.sort();
    models.dedup();
    models
}

pub fn parse_non_streaming_json(parsed: &serde_json::Value, api_format: &str) -> Result<String, String> {
    if api_format == "anthropic" {
        if let Some(stop_reason) = parsed.get("stop_reason").and_then(|s| s.as_str()) {
            if stop_reason == "refusal" {
                return Err("模型拒绝生成数值，本次回答无效".to_string());
            }
            if stop_reason == "max_tokens" {
                return Err("回答因达到 max_tokens 上限被截断，本次回答无效".to_string());
            }
        }
        let mut full = String::new();
        if let Some(blocks) = parsed.get("content").and_then(|c| c.as_array()) {
            for block in blocks {
                if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                    if let Some(t) = block.get("text").and_then(|s| s.as_str()) {
                        full.push_str(t);
                    }
                }
            }
        }
        Ok(full)
    } else if api_format == "responses" || api_format == "openai_responses" {
        if let Some(output_text) = parsed.get("output_text").and_then(|o| o.as_str()) {
            Ok(output_text.trim().to_string())
        } else if let Some(outputs) = parsed.get("output").and_then(|o| o.as_array()) {
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
                } else if let Some(parts) = item.get("content").and_then(|c| c.as_array()) {
                    for part in parts {
                        let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if part_type == "input_text" || part_type == "thinking" {
                            continue;
                        }
                        if let Some(t) = part.get("text").and_then(|s| s.as_str()) {
                            full.push_str(t);
                        }
                    }
                }
            }
            if full.is_empty() {
                Ok(parsed
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c0| c0.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string())
            } else {
                Ok(full)
            }
        } else if let Some(content_val) = parsed.get("content") {
            if let Some(s) = content_val.as_str() {
                Ok(s.to_string())
            } else if let Some(arr) = content_val.as_array() {
                let mut full = String::new();
                for part in arr {
                    if let Some(s) = part.as_str() {
                        full.push_str(s);
                    } else if let Some(t) = part.get("text").and_then(|s| s.as_str()) {
                        full.push_str(t);
                    }
                }
                Ok(full)
            } else {
                Ok(content_val.to_string())
            }
        } else if let Some(choice_content) = parsed
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|s| s.as_str())
        {
            Ok(choice_content.to_string())
        } else {
            Err("无法从上游 responses 响应中解析出文本内容".to_string())
        }
    } else {
        let choice = parsed
            .get("choices")
            .and_then(|c| c.get(0))
            .ok_or_else(|| "响应中缺少 choices 数据".to_string())?;

        if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str()) {
            if reason == "length" {
                return Err("回答被长度截断（finish_reason: length），本次回答无效".to_string());
            }
            if reason == "content_filter" {
                return Err("回答触发内容安全拦截（content_filter），本次回答无效".to_string());
            }
        }

        let message = choice
            .get("message")
            .ok_or_else(|| "响应中缺少 message 数据".to_string())?;

        let content_val = message
            .get("content")
            .ok_or_else(|| "响应中缺少 content 内容".to_string())?;

        if let Some(s) = content_val.as_str() {
            Ok(s.to_string())
        } else if let Some(arr) = content_val.as_array() {
            let mut combined = String::new();
            for item in arr {
                if let Some(t) = item.get("text").and_then(|s| s.as_str()) {
                    combined.push_str(t);
                }
            }
            Ok(combined)
        } else {
            Ok(content_val.to_string())
        }
    }
}

fn extract_stream_delta_text(val: &serde_json::Value, api_format: &str) -> Option<String> {
    if api_format == "anthropic" {
        if val.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
            let delta = val.get("delta")?;
            if delta.get("type").and_then(|t| t.as_str()) == Some("text_delta") {
                return delta
                    .get("text")
                    .and_then(|t| t.as_str())
                    .map(|text| text.to_string());
            }
        }
        return None;
    }

    if api_format == "responses" || api_format == "openai_responses" {
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
        if let Some(delta) = val.get("delta").and_then(|d| d.as_str()) {
            return Some(delta.to_string());
        }
        if let Some(output_text) = val.get("output_text").and_then(|o| o.as_str()) {
            return Some(output_text.to_string());
        }
        if let Some(text) = val.get("text").and_then(|t| t.as_str()) {
            return Some(text.to_string());
        }
        return val
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|c| c.get(0))
            .and_then(|c| c.get("delta"))
            .and_then(|d| d.get("content"))
            .and_then(|c| c.as_str())
            .map(|text| text.to_string());
    }

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

fn extract_stream_finish_reason(val: &serde_json::Value) -> Option<String> {
    val.get("choices")
        .and_then(|c| c.as_array())
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("finish_reason"))
        .and_then(|r| r.as_str())
        .map(|reason| reason.to_string())
}

/// 流式输出过程中提取当前累计文本，用于前端实时展示；不校验错误与结束原因。
pub fn parse_streaming_progress(body: &str, api_format: &str) -> String {
    let mut content_accum = String::new();

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(':') {
            continue;
        }

        let Some(data_str) = trimmed.strip_prefix("data:") else {
            continue;
        };
        let data_str = data_str.trim();
        if data_str.is_empty() || data_str == "[DONE]" {
            continue;
        }

        if let Ok(val) = serde_json::from_str::<serde_json::Value>(data_str) {
            if val.get("error").is_some() {
                continue;
            }
            if let Some(text) = extract_stream_delta_text(&val, api_format) {
                content_accum.push_str(&text);
            }
        }
    }

    content_accum
}

pub fn parse_streaming_body(body: &str, api_format: &str) -> Result<String, String> {
    let mut content_accum = String::new();
    let mut finish_reason: Option<String> = None;
    let mut found_sse_data = false;

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(':') {
            continue;
        }

        if let Some(data_str) = trimmed.strip_prefix("data:") {
            let data_str = data_str.trim();
            if data_str == "[DONE]" {
                continue;
            }
            found_sse_data = true;

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(data_str) {
                if let Some(err) = val.get("error") {
                    let msg = err
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("上游返回错误");
                    return Err(msg.to_string());
                }

                if api_format == "anthropic" {
                    if val.get("type").and_then(|t| t.as_str()) == Some("message_delta") {
                        if let Some(stop_reason) = val
                            .get("delta")
                            .and_then(|d| d.get("stop_reason"))
                            .and_then(|s| s.as_str())
                        {
                            if stop_reason == "refusal" {
                                return Err("模型拒绝生成数值，本次回答无效".to_string());
                            }
                            if stop_reason == "max_tokens" {
                                return Err("回答因达到 max_tokens 上限被截断，本次回答无效".to_string());
                            }
                        }
                    }
                } else if let Some(reason) = extract_stream_finish_reason(&val) {
                    finish_reason = Some(reason);
                }

                if let Some(text) = extract_stream_delta_text(&val, api_format) {
                    content_accum.push_str(&text);
                }
            }
        }
    }

    if let Some(reason) = finish_reason {
        if reason == "length" {
            return Err("回答被长度截断（finish_reason: length），本次回答无效".to_string());
        }
        if reason == "content_filter" {
            return Err("回答触发内容安全拦截（content_filter），本次回答无效".to_string());
        }
    }

    if !found_sse_data || content_accum.is_empty() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
            return parse_non_streaming_json(&parsed, api_format);
        }
    }

    if content_accum.is_empty() {
        return Err("流式响应未包含有效文本内容".to_string());
    }

    Ok(content_accum)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_models() {
        let json = serde_json::json!({
            "data": [
                {"id": "gpt-4o"},
                {"id": "claude-3-5-sonnet"}
            ]
        });
        let models = extract_models_from_json(&json);
        assert_eq!(models, vec!["claude-3-5-sonnet", "gpt-4o"]);
    }

    #[test]
    fn test_parse_non_streaming_chat_completions() {
        let json = serde_json::json!({
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "42"
                    }
                }
            ]
        });
        let result = parse_non_streaming_json(&json, "chat_completions").unwrap();
        assert_eq!(result, "42");
    }

    #[test]
    fn test_parse_non_streaming_anthropic() {
        let json = serde_json::json!({
            "content": [
                {
                    "type": "text",
                    "text": "Hello Anthropic"
                }
            ]
        });
        let result = parse_non_streaming_json(&json, "anthropic").unwrap();
        assert_eq!(result, "Hello Anthropic");
    }

    #[test]
    fn test_parse_streaming_body_openai() {
        let sse = "data: {\"choices\": [{\"delta\": {\"content\": \"Hello\"}}]}\n\ndata: {\"choices\": [{\"delta\": {\"content\": \" World\"}}]}\n\ndata: [DONE]\n\n";
        let result = parse_streaming_body(sse, "chat_completions").unwrap();
        assert_eq!(result, "Hello World");
    }

    #[test]
    fn test_parse_streaming_progress_ignores_partial_lines() {
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"<svg\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\">\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"cont"
        );
        assert_eq!(parse_streaming_progress(sse, "chat_completions"), "<svg>");
    }

    #[test]
    fn test_parse_streaming_progress_anthropic() {
        let sse = "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello\"}}\n\n";
        assert_eq!(parse_streaming_progress(sse, "anthropic"), "Hello");
    }
}
