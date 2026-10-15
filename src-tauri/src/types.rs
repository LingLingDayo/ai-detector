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
