use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::infra::cancel::{CancellationRegistry, CancellationScope};
use crate::infra::http::HttpClient;
use crate::provider::stream_runner::{execute_completion, CompletionStreamObserver};
pub use crate::provider::types::ChatUsage;
use crate::provider::types::{
    ApiFormat, LlmCompletionRequest, LlmImage, LlmMessage, ParseMode, ResponsesTextStyle,
    StreamParseState,
};

use super::probe::default_api_format;

const MAX_OUTPUT_TOKENS: u64 = 8192;
const ADAPTIVE_MAX_TOKENS: u64 = 16384;

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
    /// 客户端请求标识（User-Agent）；未传或为空白时使用默认标识
    #[serde(default)]
    pub user_agent: Option<String>,
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

pub trait ChatStreamSink: Send {
    fn on_start(&mut self);
    fn on_progress(&mut self, text: &str, response_model: Option<&str>);
}

pub struct NoopChatStreamSink;

impl ChatStreamSink for NoopChatStreamSink {
    fn on_start(&mut self) {}
    fn on_progress(&mut self, _text: &str, _response_model: Option<&str>) {}
}

struct ChatObserverAdapter<'a> {
    sink: &'a mut dyn ChatStreamSink,
    last_text_len: usize,
    last_model: Option<String>,
}

impl CompletionStreamObserver for ChatObserverAdapter<'_> {
    fn on_start(&mut self) {
        self.sink.on_start();
    }

    fn on_progress(&mut self, state: &StreamParseState) {
        let model_changed =
            state.response_model.is_some() && state.response_model != self.last_model;
        if state.text.len() > self.last_text_len || model_changed {
            self.last_text_len = state.text.len();
            if model_changed {
                self.last_model = state.response_model.clone();
            }
            self.sink
                .on_progress(&state.text, state.response_model.as_deref());
        }
    }
}

#[derive(Clone)]
pub struct ChatService {
    http: HttpClient,
    cancellations: CancellationRegistry,
}

impl ChatService {
    pub fn new(http: HttpClient, cancellations: CancellationRegistry) -> Self {
        Self {
            http,
            cancellations,
        }
    }

    pub async fn send(
        &self,
        req: ChatRequest,
        sink: &mut dyn ChatStreamSink,
    ) -> AppResult<ChatResponse> {
        let is_stream = req.stream.unwrap_or(true);
        let default_timeout = if is_stream { 90 } else { 240 };
        let timeout_seconds = req.timeout_seconds.unwrap_or(default_timeout).max(5);

        let guard = self
            .cancellations
            .register(CancellationScope::Chat, &req.request_id);
        let mut token = guard.token();

        let messages = req
            .messages
            .into_iter()
            .map(|msg| LlmMessage {
                role: msg.role,
                content: msg.content,
                images: msg
                    .images
                    .into_iter()
                    .map(|img| LlmImage {
                        mime_type: img.mime_type,
                        data: img.data,
                    })
                    .collect(),
            })
            .collect();

        let completion_req = LlmCompletionRequest {
            base_url: req.base_url,
            api_key: req.api_key,
            model: req.model,
            api_format: ApiFormat::from_raw(&req.api_format),
            messages,
            reasoning_effort: req.reasoning_effort,
            stream: is_stream,
            timeout_seconds,
            user_agent: req.user_agent,
            max_output_tokens: MAX_OUTPUT_TOKENS,
            adaptive_max_tokens: ADAPTIVE_MAX_TOKENS,
            include_usage_in_stream: true,
            responses_text_style: ResponsesTextStyle::PlainWhenNoImages,
        };

        let mut observer = ChatObserverAdapter {
            sink,
            last_text_len: 0,
            last_model: None,
        };
        let output = execute_completion(
            &self.http,
            &completion_req,
            ParseMode::LenientChat,
            &mut token,
            &mut observer,
        )
        .await?;

        Ok(ChatResponse {
            text: output.text,
            response_model: output.response_model,
            usage: output.usage,
            raw_status: output.raw_status,
            duration_ms: output.duration_ms,
            first_token_ms: output.first_token_ms,
        })
    }

    pub fn cancel(&self, request_id: &str) {
        let _ = self.cancellations.cancel(CancellationScope::Chat, request_id);
    }
}
