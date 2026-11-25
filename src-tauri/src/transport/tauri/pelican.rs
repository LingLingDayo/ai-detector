use tauri::{ipc::Channel, AppHandle, Manager, State, WebviewWindow};

use crate::infra::fs::{display_download_path, parse_custom_download_dir};
use crate::platform::pelican_capture::{
    cancel_capture, capture_frames, policy::ensure_main_window, CaptureFrame, CaptureRegistry,
};
use crate::services::AppServices;

#[tauri::command]
pub async fn capture_pelican_frames(
    app: AppHandle,
    window: WebviewWindow,
    registry: State<'_, CaptureRegistry>,
    request_id: String,
    html: String,
    duration_ms: u64,
    on_frame: Channel<CaptureFrame>,
) -> Result<usize, String> {
    capture_frames(
        &registry,
        &app,
        &window,
        request_id,
        html,
        duration_ms,
        on_frame,
    )
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub fn cancel_pelican_capture(
    window: WebviewWindow,
    registry: State<'_, CaptureRegistry>,
    request_id: String,
) -> Result<(), String> {
    cancel_capture(&registry, &window, &request_id).map_err(Into::into)
}

#[tauri::command]
pub async fn pick_download_directory(
    app: AppHandle,
    window: WebviewWindow,
    current_dir: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    ensure_main_window(window.label()).map_err(String::from)?;
    let initial_dir = parse_custom_download_dir(current_dir.as_deref())
        .ok()
        .flatten()
        .filter(|path| path.is_dir())
        .or_else(|| app.path().download_dir().ok());
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut builder = app
        .dialog()
        .file()
        .set_title("选择文件下载目录")
        .set_parent(&window);
    if let Some(dir) = initial_dir {
        builder = builder.set_directory(dir);
    }
    builder.pick_folder(move |folder| {
        let _ = sender.send(folder.and_then(|file_path| file_path.into_path().ok()));
    });
    let selected = receiver
        .await
        .map_err(|_| "等待文件夹选择结果失败".to_string())?;
    Ok(selected.map(|path| display_download_path(&path)))
}

#[tauri::command]
pub async fn save_pelican_download(
    app: AppHandle,
    services: State<'_, AppServices>,
    file_name: String,
    data: Vec<u8>,
    download_dir: Option<String>,
) -> Result<String, String> {
    let default_dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("无法获取系统下载目录: {error}"))?;
    let target_dir = services
        .download
        .resolve_directory(download_dir.as_deref(), default_dir)
        .map_err(String::from)?;
    let download = services.download.clone();
    tauri::async_runtime::spawn_blocking(move || download.save_file(&target_dir, &file_name, &data))
        .await
        .map_err(|error| format!("保存下载文件任务失败: {error}"))?
        .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_command_returns_frame_count_metadata() {
        fn assert_count_result<'a, Command, ResultFuture>(_command: Command)
        where
            Command: FnOnce(
                AppHandle,
                WebviewWindow,
                State<'a, CaptureRegistry>,
                String,
                String,
                u64,
                Channel<CaptureFrame>,
            ) -> ResultFuture,
            ResultFuture: std::future::Future<Output = Result<usize, String>> + Send + 'a,
        {
        }
        assert_count_result(capture_pelican_frames);
    }
}
