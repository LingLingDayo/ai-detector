use tauri::State;

use crate::services::models::ModelsListRequest;
use crate::services::AppServices;

#[tauri::command]
pub async fn fetch_models_list(
    services: State<'_, AppServices>,
    base_url: String,
    api_key: String,
    api_format: String,
    user_agent: Option<String>,
) -> Result<Vec<String>, String> {
    services
        .models
        .fetch_list(ModelsListRequest {
            base_url,
            api_key,
            api_format,
            user_agent,
        })
        .await
        .map_err(Into::into)
}
