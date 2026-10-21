use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Clone)]
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
}

pub fn default_api_format() -> String {
    "chat_completions".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct ProbeResponse {
    pub text: String,
    pub raw_status: u16,
    pub duration_ms: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChatImagePayload {
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChatMessagePayload {
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub images: Vec<ChatImagePayload>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChatRequest {
    pub request_id: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub messages: Vec<ChatMessagePayload>,
    #[serde(default = "default_api_format")]
    pub api_format: String,
    pub reasoning_effort: Option<String>,
    pub stream: Option<bool>,
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatUsage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write_tokens: Option<u64>,
}

impl ChatUsage {
    pub fn has_any(&self) -> bool {
        self.input_tokens.is_some()
            || self.output_tokens.is_some()
            || self.cached_tokens.is_some()
            || self.cache_write_tokens.is_some()
    }

    pub fn merge(&mut self, other: &ChatUsage) {
        if other.input_tokens.is_some() {
            self.input_tokens = other.input_tokens;
        }
        if other.output_tokens.is_some() {
            self.output_tokens = other.output_tokens;
        }
        if other.cached_tokens.is_some() {
            self.cached_tokens = other.cached_tokens;
        }
        if other.cache_write_tokens.is_some() {
            self.cache_write_tokens = other.cache_write_tokens;
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub text: String,
    pub response_model: Option<String>,
    pub usage: ChatUsage,
    pub raw_status: u16,
    pub duration_ms: u64,
    pub first_token_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamStartPayload {
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStreamProgressPayload {
    pub request_id: String,
    pub text: String,
    pub response_model: Option<String>,
}
