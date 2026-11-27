use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ApiFormat {
    ChatCompletions,
    Responses,
    Anthropic,
}

impl ApiFormat {
    pub fn from_raw(raw: &str) -> Self {
        match raw.trim() {
            "anthropic" => Self::Anthropic,
            "responses" | "openai_responses" => Self::Responses,
            _ => Self::ChatCompletions,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ChatCompletions => "chat_completions",
            Self::Responses => "responses",
            Self::Anthropic => "anthropic",
        }
    }
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

#[derive(Debug, Clone)]
pub struct LlmImage {
    pub mime_type: String,
    pub data: String,
}

#[derive(Debug, Clone)]
pub struct LlmMessage {
    pub role: String,
    pub content: String,
    pub images: Vec<LlmImage>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParseMode {
    StrictProbe,
    LenientChat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResponsesTextStyle {
    /// Probe 请求：始终使用 `[{"type": "input_text", "text": ...}]`
    StructuredParts,
    /// Chat 请求：无图片时直接传字符串 `content`，有图片时再组装 parts 数组
    PlainWhenNoImages,
}

#[derive(Debug, Clone)]
pub struct LlmCompletionRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub api_format: ApiFormat,
    pub messages: Vec<LlmMessage>,
    pub reasoning_effort: Option<String>,
    pub stream: bool,
    pub timeout_seconds: u64,
    pub user_agent: Option<String>,
    pub max_output_tokens: u64,
    pub adaptive_max_tokens: u64,
    pub include_usage_in_stream: bool,
    pub responses_text_style: ResponsesTextStyle,
}

#[derive(Debug, Default, Clone)]
pub struct StreamParseState {
    pub text: String,
    pub response_model: Option<String>,
    pub usage: ChatUsage,
    pub finish_reason: Option<String>,
    pub error_message: Option<String>,
    pub saw_sse_data: bool,
    pub has_semantic_output: bool,
    pub has_reasoning: bool,
}

#[derive(Debug, Clone)]
pub struct CompletionOutput {
    pub text: String,
    pub response_model: Option<String>,
    pub usage: ChatUsage,
    pub raw_status: u16,
    pub duration_ms: u64,
    pub first_token_ms: Option<u64>,
    pub thinking_ms: Option<u64>,
}
