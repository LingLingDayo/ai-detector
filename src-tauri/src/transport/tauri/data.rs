use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::platform::pelican_capture::policy::ensure_main_window;
use crate::services::AppServices;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedDataFile {
    pub file_name: String,
    pub path: String,
    pub data: Vec<u8>,
}

#[tauri::command]
pub async fn save_data_export(
    app: AppHandle,
    window: WebviewWindow,
    services: State<'_, AppServices>,
    default_file_name: String,
    filter_name: String,
    extensions: Vec<String>,
    data: Vec<u8>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    ensure_main_window(window.label()).map_err(String::from)?;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut builder = app
        .dialog()
        .file()
        .set_title("导出数据")
        .set_file_name(&default_file_name)
        .set_parent(&window);

    let ext_refs: Vec<&str> = extensions
        .iter()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    if !ext_refs.is_empty() {
        builder = builder.add_filter(&filter_name, &ext_refs);
    }
    if let Ok(download_dir) = app.path().download_dir() {
        builder = builder.set_directory(download_dir);
    }

    builder.save_file(move |file_path| {
        let _ = sender.send(file_path.and_then(|fp| fp.into_path().ok()));
    });

    let selected = receiver
        .await
        .map_err(|_| "等待保存路径选择结果失败".to_string())?;
    let Some(target_path) = selected else {
        return Ok(None);
    };

    let data_transfer = services.data_transfer.clone();
    let saved_path = tauri::async_runtime::spawn_blocking(move || {
        data_transfer.save_export_file(&target_path, &data)
    })
    .await
    .map_err(|error| format!("保存导出文件任务失败: {error}"))?
    .map_err(String::from)?;

    Ok(Some(saved_path))
}

#[tauri::command]
pub async fn pick_data_import_file(
    app: AppHandle,
    window: WebviewWindow,
    services: State<'_, AppServices>,
) -> Result<Option<PickedDataFile>, String> {
    use tauri_plugin_dialog::DialogExt;

    ensure_main_window(window.label()).map_err(String::from)?;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    let mut builder = app
        .dialog()
        .file()
        .set_title("选择要导入的数据文件")
        .add_filter("AI Detector 数据文件", &["json", "zip", "aidata"])
        .add_filter("JSON 文件", &["json"])
        .add_filter("ZIP 压缩包", &["zip"])
        .add_filter("加密数据文件", &["aidata"])
        .set_parent(&window);

    if let Ok(download_dir) = app.path().download_dir() {
        builder = builder.set_directory(download_dir);
    }

    builder.pick_file(move |file_path| {
        let _ = sender.send(file_path.and_then(|fp| fp.into_path().ok()));
    });

    let selected = receiver
        .await
        .map_err(|_| "等待导入文件选择结果失败".to_string())?;
    let Some(target_path) = selected else {
        return Ok(None);
    };

    let data_transfer = services.data_transfer.clone();
    let (file_name, path, data) =
        tauri::async_runtime::spawn_blocking(move || data_transfer.read_import_file(&target_path))
            .await
            .map_err(|error| format!("读取导入文件任务失败: {error}"))?
            .map_err(String::from)?;

    Ok(Some(PickedDataFile {
        file_name,
        path,
        data,
    }))
}
