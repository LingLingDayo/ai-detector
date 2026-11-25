use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    crate::platform::system::open_external_url(&url).map_err(Into::into)
}

#[tauri::command]
pub fn open_devtools(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "未找到名为 main 的主窗口，无法打开 DevTools".to_string())?;
    window.open_devtools();
    Ok(())
}
