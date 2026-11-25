use tauri::{AppHandle, State};

use crate::services::probe::{ProbeRequest, ProbeResponse};
use crate::services::AppServices;

use super::events::TauriProbeStreamSink;

#[tauri::command]
pub async fn send_probe_request(
    app: AppHandle,
    services: State<'_, AppServices>,
    req: ProbeRequest,
) -> Result<ProbeResponse, String> {
    let mut sink = TauriProbeStreamSink::new(app, req.request_id.clone());
    services
        .probe
        .send(req, &mut sink)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub fn cancel_probe_request(services: State<'_, AppServices>, request_id: String) {
    services.probe.cancel(&request_id);
}
