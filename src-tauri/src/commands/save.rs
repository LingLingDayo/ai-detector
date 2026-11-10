#[tauri::command]
pub async fn save_pelican_file(
    window: tauri::WebviewWindow,
    file_name: String,
    extension: String,
    data: Vec<u8>,
) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        let name = match extension.as_str() {
            "gif" => "GIF 动图",
            "svg" => "SVG 图像",
            "html" => "HTML 页面",
            _ => return Err("不支持的导出文件类型".to_string()),
        };
        let selected = rfd::AsyncFileDialog::new()
            .set_parent(&window)
            .set_title("保存鹈鹕测试结果")
            .set_file_name(&file_name)
            .add_filter(name, &[&extension])
            .save_file()
            .await;
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.path().to_path_buf();
        let saved_path = path.to_string_lossy().into_owned();
        tauri::async_runtime::spawn_blocking(move || std::fs::write(path, data))
            .await.map_err(|e| format!("保存任务失败: {e}"))?
            .map_err(|e| format!("保存文件失败: {e}"))?;
        Ok(Some(saved_path))
    }
    #[cfg(not(windows))]
    {
        let _ = (window, file_name, extension, data);
        Err("原生另存为目前支持 Windows 桌面版".to_string())
    }
}
