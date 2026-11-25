pub mod policy;
pub mod registry;
#[cfg(target_os = "windows")]
pub mod windows_webview2;

use tauri::{ipc::Channel, AppHandle, WebviewWindow};

use crate::error::AppResult;
#[cfg(not(target_os = "windows"))]
use crate::error::AppError;

pub use policy::CaptureFrame;
pub use registry::CaptureRegistry;

pub async fn capture_frames(
    registry: &CaptureRegistry,
    app: &AppHandle,
    window: &WebviewWindow,
    request_id: String,
    html: String,
    duration_ms: u64,
    on_frame: Channel<CaptureFrame>,
) -> AppResult<usize> {
    policy::ensure_main_window(window.label())?;
    policy::validate_render_html(&html)?;
    let frame_limit = policy::capture_frame_limit(duration_ms)?;
    let guard = registry.begin(&request_id)?;
    guard.state.ensure_running()?;

    #[cfg(target_os = "windows")]
    {
        windows_webview2::capture_frames_windows(
            app,
            &request_id,
            html,
            duration_ms,
            frame_limit,
            &guard.state,
            &on_frame,
        )
        .await
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, frame_limit, on_frame);
        Err(AppError::Unsupported(
            "当前平台暂不支持原生 GIF 采集".to_string(),
        ))
    }
}

pub fn cancel_capture(
    registry: &CaptureRegistry,
    window: &WebviewWindow,
    request_id: &str,
) -> AppResult<()> {
    policy::ensure_main_window(window.label())?;
    registry.cancel(request_id)
}
