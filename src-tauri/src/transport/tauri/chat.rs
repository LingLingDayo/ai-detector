use tauri::{AppHandle, State};

use crate::services::chat::{ChatRequest, ChatResponse};
use crate::services::AppServices;

use super::events::TauriChatStreamSink;

#[tauri::command]
pub async fn send_chat_request(
    app: AppHandle,
    services: State<'_, AppServices>,
    req: ChatRequest,
) -> Result<ChatResponse, String> {
    let mut sink = TauriChatStreamSink::new(app, req.request_id.clone());
    services.chat.send(req, &mut sink).await.map_err(Into::into)
}

#[tauri::command]
pub fn cancel_chat_request(services: State<'_, AppServices>, request_id: String) {
    services.chat.cancel(&request_id);
}
