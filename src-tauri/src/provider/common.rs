use serde_json::Value;

pub(crate) fn value_as_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_str().and_then(|s| s.trim().parse::<u64>().ok()))
}

pub(crate) fn object_value_as_u64(obj: &Value, keys: &[&str]) -> Option<u64> {
    for key in keys {
        if let Some(value) = obj.get(*key) {
            if let Some(parsed) = value_as_u64(value) {
                return Some(parsed);
            }
        }
    }
    None
}

pub(crate) fn non_empty_str(value: Option<&Value>) -> bool {
    value
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

pub(crate) fn has_non_empty_text_array(value: Option<&Value>) -> bool {
    let Some(parts) = value.and_then(|v| v.as_array()) else {
        return false;
    };
    parts.iter().any(|part| {
        if let Some(s) = part.as_str() {
            return !s.is_empty();
        }
        non_empty_str(part.get("text"))
            || non_empty_str(part.get("summary"))
            || non_empty_str(part.get("data"))
    })
}

pub(crate) fn extract_error_message(value: &Value) -> Option<String> {
    value
        .pointer("/error/message")
        .and_then(|message| message.as_str())
        .or_else(|| value.get("error").and_then(|error| error.as_str()))
        .map(|message| message.trim().to_string())
        .filter(|message| !message.is_empty())
}

pub(crate) fn extract_content_blocks_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    let mut text = String::new();
    if let Some(parts) = content.as_array() {
        for part in parts {
            if let Some(part_text) = part.as_str() {
                text.push_str(part_text);
                continue;
            }
            let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if part_type == "thinking" || part_type == "redacted_thinking" || part_type == "input_text"
            {
                continue;
            }
            if let Some(part_text) = part.get("text").and_then(|t| t.as_str()) {
                text.push_str(part_text);
            }
        }
    }
    text
}
