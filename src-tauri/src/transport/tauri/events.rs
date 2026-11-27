use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::services::chat::ChatStreamSink;
use crate::services::probe::ProbeStreamSink;

pub const PELICAN_STREAM_START: &str = "pelican-stream-start";
pub const PELICAN_STREAM_PROGRESS: &str = "pelican-stream-progress";
pub const CONNECTION_STREAM_START: &str = "connection-stream-start";
pub const CONNECTION_STREAM_PROGRESS: &str = "connection-stream-progress";
pub const DIAGNOSTICS_LOG: &str = "diagnostics://log";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeStreamStartPayload {
    pub request_id: Option<String>,
    pub has_text: bool,
    pub has_reasoning: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeStreamProgressPayload {
    pub request_id: Option<String>,
    pub text: String,
    pub thinking_ms: Option<u64>,
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

pub struct TauriProbeStreamSink {
    app: AppHandle,
    request_id: Option<String>,
}

impl TauriProbeStreamSink {
    pub fn new(app: AppHandle, request_id: Option<String>) -> Self {
        Self { app, request_id }
    }
}

impl ProbeStreamSink for TauriProbeStreamSink {
    fn on_start(&mut self, has_text: bool, has_reasoning: bool) {
        let _ = self.app.emit(
            PELICAN_STREAM_START,
            ProbeStreamStartPayload {
                request_id: self.request_id.clone(),
                has_text,
                has_reasoning,
            },
        );
    }

    fn on_progress(&mut self, text: &str, thinking_ms: Option<u64>) {
        let _ = self.app.emit(
            PELICAN_STREAM_PROGRESS,
            ProbeStreamProgressPayload {
                request_id: self.request_id.clone(),
                text: text.to_string(),
                thinking_ms,
            },
        );
    }
}

pub struct TauriChatStreamSink {
    app: AppHandle,
    request_id: String,
}

impl TauriChatStreamSink {
    pub fn new(app: AppHandle, request_id: String) -> Self {
        Self { app, request_id }
    }
}

impl ChatStreamSink for TauriChatStreamSink {
    fn on_start(&mut self) {
        let _ = self.app.emit(
            CONNECTION_STREAM_START,
            ChatStreamStartPayload {
                request_id: self.request_id.clone(),
            },
        );
    }

    fn on_progress(&mut self, text: &str, response_model: Option<&str>) {
        let _ = self.app.emit(
            CONNECTION_STREAM_PROGRESS,
            ChatStreamProgressPayload {
                request_id: self.request_id.clone(),
                text: text.to_string(),
                response_model: response_model.map(|s| s.to_string()),
            },
        );
    }
}
