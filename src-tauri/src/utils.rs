pub fn normalize_url(base_url: &str, api_format: &str) -> String {
    let raw = base_url.trim().trim_end_matches('/');
    let trimmed = if raw.is_empty() {
        if api_format == "anthropic" {
            "https://api.anthropic.com"
        } else {
            "https://api.openai.com"
        }
    } else {
        raw
    };

    if api_format == "anthropic" {
        if trimmed.ends_with("/messages") {
            trimmed.to_string()
        } else if trimmed.ends_with("/v1") {
            format!("{}/messages", trimmed)
        } else {
            format!("{}/v1/messages", trimmed)
        }
    } else if api_format == "responses" || api_format == "openai_responses" {
        if trimmed.ends_with("/responses") {
            trimmed.to_string()
        } else if trimmed.ends_with("/v1") {
            format!("{}/responses", trimmed)
        } else {
            format!("{}/v1/responses", trimmed)
        }
    } else {
        if trimmed.ends_with("/chat/completions") {
            trimmed.to_string()
        } else if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }
}

pub fn is_waf_block(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("cloudflare")
        || lower.contains("just a moment")
        || lower.contains("cf-ray")
        || lower.contains("access denied")
        || lower.contains("attention required")
}

pub fn compact_error(body: &str, status: reqwest::StatusCode) -> String {
    let trimmed = body.trim();
    if is_waf_block(trimmed) {
        return "请求被网关拦截（疑似 Cloudflare/WAF 阻断）。请检查 Base URL 是否正确。".to_string();
    }
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(err_obj) = val.get("error") {
            if let Some(msg) = err_obj.get("message").and_then(|m| m.as_str()) {
                return msg.to_string();
            }
            return err_obj.to_string();
        }
        if let Some(msg) = val.get("message").and_then(|m| m.as_str()) {
            return msg.to_string();
        }
    }
    if trimmed.starts_with('<') {
        return format!("HTTP 状态码 {}，返回了 HTML 页面", status.as_u16());
    }
    if trimmed.is_empty() {
        format!("HTTP 状态码 {}", status.as_u16())
    } else {
        trimmed.chars().take(300).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_url_chat_completions() {
        assert_eq!(
            normalize_url("", "chat_completions"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_url("https://api.example.com", "chat_completions"),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_url("https://api.example.com/v1", "chat_completions"),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_url("https://api.example.com/v1/chat/completions", "chat_completions"),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn test_normalize_url_anthropic() {
        assert_eq!(
            normalize_url("", "anthropic"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            normalize_url("https://api.example.com", "anthropic"),
            "https://api.example.com/v1/messages"
        );
        assert_eq!(
            normalize_url("https://api.example.com/v1", "anthropic"),
            "https://api.example.com/v1/messages"
        );
        assert_eq!(
            normalize_url("https://api.example.com/messages", "anthropic"),
            "https://api.example.com/messages"
        );
    }

    #[test]
    fn test_normalize_url_responses() {
        assert_eq!(
            normalize_url("https://api.example.com", "responses"),
            "https://api.example.com/v1/responses"
        );
        assert_eq!(
            normalize_url("https://api.example.com/v1", "openai_responses"),
            "https://api.example.com/v1/responses"
        );
    }

    #[test]
    fn test_is_waf_block() {
        assert!(is_waf_block("Error: Cloudflare Ray ID: 123456"));
        assert!(is_waf_block("<title>Just a moment...</title>"));
        assert!(is_waf_block("403 Access Denied"));
        assert!(!is_waf_block("Internal Server Error"));
    }

    #[test]
    fn test_compact_error() {
        assert_eq!(
            compact_error(
                r#"{"error": {"message": "Invalid API key"}}"#,
                reqwest::StatusCode::UNAUTHORIZED
            ),
            "Invalid API key"
        );
        assert_eq!(
            compact_error(
                r#"{"message": "Quota exceeded"}"#,
                reqwest::StatusCode::TOO_MANY_REQUESTS
            ),
            "Quota exceeded"
        );
        assert_eq!(
            compact_error("<html><body>Bad Gateway</body></html>", reqwest::StatusCode::BAD_GATEWAY),
            "HTTP 状态码 502，返回了 HTML 页面"
        );
    }
}
