use std::time::Duration;

use crate::error::{AppError, AppResult};

pub const DEFAULT_USER_AGENT: &str =
    "Codex Desktop/0.171.0-alpha.13 (Windows 10.0.26300; x86_64) unknown (Codex Desktop; 26.1117.41037)";

pub const MODEL_FETCH_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// 共享底层连接池的 HTTP 客户端；不在 Client 级别设置总超时，以免中断长流式响应。
#[derive(Clone)]
pub struct HttpClient {
    inner: reqwest::Client,
}

impl HttpClient {
    pub fn new() -> AppResult<Self> {
        let inner = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AppError::Internal(format!("构建 HTTP 客户端失败: {}", e)))?;
        Ok(Self { inner })
    }

    pub fn get(&self, url: &str) -> reqwest::RequestBuilder {
        self.inner.get(url)
    }

    pub fn post(&self, url: &str) -> reqwest::RequestBuilder {
        self.inner.post(url)
    }

    pub fn inner(&self) -> &reqwest::Client {
        &self.inner
    }
}

/// 解析最终生效的 User-Agent；自定义值空白、含非 ASCII 或非法 HTTP 头字符时回退到指定默认标识
pub fn resolve_user_agent_with_fallback<'a>(
    custom: Option<&'a str>,
    fallback: &'a str,
) -> &'a str {
    if let Some(raw) = custom {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            if trimmed.is_ascii() && reqwest::header::HeaderValue::from_str(trimmed).is_ok() {
                return trimmed;
            }
            log::warn!("自定义 User-Agent 包含非 ASCII 或非法 HTTP 头字符，已回退默认标识");
        }
    }
    fallback
}

/// 解析探测与对话请求生效的 User-Agent，缺省回退至 DEFAULT_USER_AGENT
pub fn resolve_user_agent(custom: Option<&str>) -> &str {
    resolve_user_agent_with_fallback(custom, DEFAULT_USER_AGENT)
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
    fn test_resolve_user_agent() {
        assert_eq!(resolve_user_agent(None), DEFAULT_USER_AGENT);
        assert_eq!(resolve_user_agent(Some("")), DEFAULT_USER_AGENT);
        assert_eq!(resolve_user_agent(Some("   \t  ")), DEFAULT_USER_AGENT);
        assert_eq!(
            resolve_user_agent(Some("  claude-cli/2.1.76 (external, cli)  ")),
            "claude-cli/2.1.76 (external, cli)"
        );
        assert_eq!(
            resolve_user_agent(Some("invalid\nheader")),
            DEFAULT_USER_AGENT
        );
        assert_eq!(
            resolve_user_agent(Some("中文非法标识")),
            DEFAULT_USER_AGENT
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
