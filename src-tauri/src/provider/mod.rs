use serde_json::Value;

use crate::error::AppResult;

pub mod anthropic;
pub mod common;
pub mod models_parser;
pub mod openai_chat;
pub mod openai_responses;
pub mod sse;
pub mod stream_runner;
pub mod types;
pub mod url;

use types::{ApiFormat, LlmCompletionRequest, ParseMode, StreamParseState};

pub trait LlmProtocol: Send + Sync {
    fn format(&self) -> ApiFormat;

    fn apply_auth_headers(
        &self,
        builder: reqwest::RequestBuilder,
        api_key: &str,
    ) -> reqwest::RequestBuilder;

    fn build_request_body(&self, req: &LlmCompletionRequest) -> Value;

    fn apply_stream_event(
        &self,
        value: &Value,
        state: &mut StreamParseState,
        mode: ParseMode,
    ) -> AppResult<()>;

    fn validate_stream_finish(&self, state: &StreamParseState, mode: ParseMode) -> AppResult<()>;

    fn parse_non_streaming(&self, value: &Value, mode: ParseMode) -> AppResult<StreamParseState>;
}

static OPENAI_CHAT_PROTOCOL: openai_chat::OpenAiChatProtocol = openai_chat::OpenAiChatProtocol;
static OPENAI_RESPONSES_PROTOCOL: openai_responses::OpenAiResponsesProtocol =
    openai_responses::OpenAiResponsesProtocol;
static ANTHROPIC_PROTOCOL: anthropic::AnthropicProtocol = anthropic::AnthropicProtocol;

pub fn protocol_for(format: ApiFormat) -> &'static dyn LlmProtocol {
    match format {
        ApiFormat::ChatCompletions => &OPENAI_CHAT_PROTOCOL,
        ApiFormat::Responses => &OPENAI_RESPONSES_PROTOCOL,
        ApiFormat::Anthropic => &ANTHROPIC_PROTOCOL,
    }
}
