use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
#[cfg(any(target_os = "windows", test))]
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
#[cfg(any(target_os = "windows", test))]
use serde_json::json;
use tauri::{ipc::Channel, AppHandle, Manager, WebviewWindow};

const FRAME_INTERVAL_MS: u64 = 50;
#[cfg(target_os = "windows")]
const FRAME_TIMEOUT_MS: u64 = 2000;
#[cfg(target_os = "windows")]
const RENDER_READY_TIMEOUT_MS: u64 = 8000;
#[cfg(target_os = "windows")]
const RENDER_READY_POLL_MS: u64 = 25;
#[cfg(target_os = "windows")]
const GIF_CAPTURE_WIDTH: f64 = 640.0;
#[cfg(target_os = "windows")]
const GIF_CAPTURE_HEIGHT: f64 = 480.0;
const MAX_RENDER_HTML_BYTES: usize = 2 * 1024 * 1024;
const MAX_CAPTURE_DURATION_MS: u64 = 5000;
const MAX_CAPTURE_FRAMES: usize = 100;
#[cfg(any(target_os = "windows", test))]
const MAX_FRAME_DATA_BYTES: usize = 16 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES: usize = 20 * 1024 * 1024;
const MAX_FILE_COLLISIONS: usize = 1000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFrame {
    pub data: String,
    pub timestamp_ms: f64,
}

fn sanitize_download_name(file_name: &str) -> Result<String, String> {
    if file_name.len() > 512 {
        return Err("下载文件名过长".to_string());
    }
    let (stem, extension) = file_name
        .trim()
        .rsplit_once('.')
        .ok_or_else(|| "下载文件仅支持 GIF、SVG 或 HTML 格式".to_string())?;
    let extension = extension.to_ascii_lowercase();
    if !matches!(extension.as_str(), "gif" | "svg" | "html") {
        return Err("下载文件仅支持 GIF、SVG 或 HTML 格式".to_string());
    }
    let stem: String = stem
        .chars()
        .map(|character| {
            if character.is_control() || "<>:\"/\\|?*".contains(character) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let mut stem: String = stem.trim_matches([' ', '.']).chars().take(100).collect();
    if stem.is_empty() {
        return Err("下载文件名不能为空".to_string());
    }
    let device_name = stem
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end()
        .to_ascii_uppercase();
    let port_digit = device_name
        .strip_prefix("COM")
        .or_else(|| device_name.strip_prefix("LPT"));
    let reserved_port = port_digit.is_some_and(|digit| {
        digit.chars().count() == 1
            && digit
                .chars()
                .any(|digit| matches!(digit, '1'..='9' | '¹' | '²' | '³'))
    });
    if matches!(device_name.as_str(), "CON" | "PRN" | "AUX" | "NUL") || reserved_port {
        stem.insert(0, '_');
    }
    Ok(format!("{stem}.{extension}"))
}

fn capture_frame_limit(duration_ms: u64) -> Result<usize, String> {
    if duration_ms == 0 || duration_ms > MAX_CAPTURE_DURATION_MS {
        return Err("GIF 采集时长必须大于 0 且不超过 5 秒".to_string());
    }
    Ok(
        (((duration_ms + FRAME_INTERVAL_MS - 1) / FRAME_INTERVAL_MS) as usize)
            .min(MAX_CAPTURE_FRAMES),
    )
}

#[cfg(any(target_os = "windows", test))]
fn screenshot_parameters() -> String {
    // 仅截取当前可见视口合成层，不传 clip 以避免 Chromium 临时覆盖视口参数引发页面层闪烁。
    json!({
        "format": "png",
        "fromSurface": true,
        "captureBeyondViewport": false,
    })
    .to_string()
}

#[cfg(any(target_os = "windows", test))]
fn parse_capture_frame(response: &str) -> Result<String, String> {
    #[derive(Deserialize)]
    struct ScreenshotResponse {
        data: String,
    }
    if response.len() > MAX_FRAME_DATA_BYTES + 1024 {
        return Err("作品截图响应超出大小限制".to_string());
    }
    let response: ScreenshotResponse =
        serde_json::from_str(response).map_err(|error| format!("作品截图响应解析失败: {error}"))?;
    if response.data.is_empty() || response.data.len() > MAX_FRAME_DATA_BYTES {
        return Err("作品截图为空或超出大小限制".to_string());
    }
    Ok(response.data)
}

fn write_download_file(
    download_dir: &Path,
    file_name: &str,
    data: &[u8],
) -> Result<PathBuf, String> {
    let file_name = sanitize_download_name(file_name)?;
    if data.is_empty() || data.len() > MAX_DOWNLOAD_BYTES {
        return Err("下载文件不能为空且不能超过 20 MiB".to_string());
    }
    if !download_dir.is_absolute() {
        return Err("系统下载目录不是绝对路径".to_string());
    }
    fs::create_dir_all(download_dir).map_err(|error| format!("创建系统下载目录失败: {error}"))?;
    let download_dir = download_dir
        .canonicalize()
        .map_err(|error| format!("读取系统下载目录失败: {error}"))?;
    let (stem, extension) = file_name.rsplit_once('.').unwrap();
    for collision in 0..MAX_FILE_COLLISIONS {
        let name = if collision == 0 {
            file_name.clone()
        } else {
            format!("{stem} ({collision}).{extension}")
        };
        let path = download_dir.join(name);
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(data)
                    .and_then(|_| file.sync_all())
                    .map_err(|error| {
                        format!(
                            "写入下载文件失败（未完成文件保留于 {}）: {error}",
                            display_download_path(&path)
                        )
                    })?;
                return Ok(path);
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("创建下载文件失败: {error}")),
        }
    }
    Err("下载目录中同名文件过多，请修改作品名称后重试".to_string())
}

#[derive(Default)]
struct CaptureRegistry {
    active: Mutex<Option<Arc<CaptureState>>>,
}

struct CaptureState {
    request_id: String,
    canceled: AtomicBool,
}

struct CaptureGuard<'a> {
    registry: &'a CaptureRegistry,
    state: Arc<CaptureState>,
}

static CAPTURE_REGISTRY: OnceLock<CaptureRegistry> = OnceLock::new();

fn capture_registry() -> &'static CaptureRegistry {
    CAPTURE_REGISTRY.get_or_init(CaptureRegistry::default)
}

impl CaptureRegistry {
    fn begin(&self, request_id: &str) -> Result<CaptureGuard<'_>, String> {
        if request_id.trim().is_empty() || request_id.len() > 128 {
            return Err("GIF 采集请求标识无效".to_string());
        }
        let mut active = self
            .active
            .lock()
            .map_err(|_| "GIF 采集状态不可用".to_string())?;
        if active.is_some() {
            return Err("已有 GIF 采集正在进行".to_string());
        }
        let state = Arc::new(CaptureState {
            request_id: request_id.to_string(),
            canceled: AtomicBool::new(false),
        });
        *active = Some(state.clone());
        Ok(CaptureGuard {
            registry: self,
            state,
        })
    }

    fn cancel(&self, request_id: &str) -> Result<(), String> {
        let active = self
            .active
            .lock()
            .map_err(|_| "GIF 采集状态不可用".to_string())?;
        if let Some(state) = active
            .as_ref()
            .filter(|state| state.request_id == request_id)
        {
            state.canceled.store(true, Ordering::Release);
        }
        Ok(())
    }
}

impl CaptureState {
    fn ensure_running(&self) -> Result<(), String> {
        if self.canceled.load(Ordering::Acquire) {
            Err("GIF 采集已取消".to_string())
        } else {
            Ok(())
        }
    }
}

impl Drop for CaptureGuard<'_> {
    fn drop(&mut self) {
        self.state.canceled.store(true, Ordering::Release);
        let mut active = self
            .registry
            .active
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if active
            .as_ref()
            .is_some_and(|state| Arc::ptr_eq(state, &self.state))
        {
            *active = None;
        }
    }
}

fn ensure_main_window(label: &str) -> Result<(), String> {
    if label == "main" {
        Ok(())
    } else {
        Err("GIF 采集仅允许由主窗口调用".to_string())
    }
}

#[cfg(any(target_os = "windows", test))]
async fn wait_capture_result(
    receiver: &mut tokio::sync::mpsc::Receiver<Result<String, String>>,
    state: &CaptureState,
    deadline: Instant,
) -> Result<String, String> {
    loop {
        state.ensure_running()?;
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err("作品截图等待超时".to_string());
        }
        let timeout = remaining.min(Duration::from_millis(FRAME_INTERVAL_MS));
        match tokio::time::timeout(timeout, receiver.recv()).await {
            Ok(Some(result)) => {
                state.ensure_running()?;
                if Instant::now() >= deadline {
                    return Err("作品截图等待超时".to_string());
                }
                return result;
            }
            Ok(None) => return Err("作品截图回调已中断".to_string()),
            Err(_) => continue,
        }
    }
}

fn validate_render_html(html: &str) -> Result<(), String> {
    if html.trim().is_empty() || html.len() > MAX_RENDER_HTML_BYTES {
        return Err("待渲染图形内容为空或超出大小限制".to_string());
    }
    Ok(())
}

fn sanitize_render_label(request_id: &str) -> String {
    request_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(48)
        .collect()
}

#[cfg(any(target_os = "windows", test))]
fn is_render_ready_response(response: &str) -> bool {
    #[derive(Deserialize)]
    struct EvaluateValue {
        value: Option<bool>,
    }
    #[derive(Deserialize)]
    struct EvaluateResponse {
        result: Option<EvaluateValue>,
    }
    serde_json::from_str::<EvaluateResponse>(response)
        .ok()
        .and_then(|parsed| parsed.result)
        .and_then(|result| result.value)
        == Some(true)
}

#[cfg(target_os = "windows")]
struct RenderWindowGuard(WebviewWindow);

#[cfg(target_os = "windows")]
impl Drop for RenderWindowGuard {
    fn drop(&mut self) {
        let _ = self.0.destroy();
    }
}

#[cfg(target_os = "windows")]
async fn call_cdp_method(
    window: &WebviewWindow,
    method: &'static str,
    parameters: String,
    state: &Arc<CaptureState>,
    deadline: Instant,
) -> Result<String, String> {
    use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};

    let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
    let callback_state = state.clone();
    window
        .with_webview(move |webview| {
            if sender.is_closed()
                || callback_state.ensure_running().is_err()
                || Instant::now() >= deadline
            {
                return;
            }
            let result = (|| {
                let core = unsafe { webview.controller().CoreWebView2() }
                    .map_err(|error| format!("获取离屏渲染 WebView2 失败: {error}"))?;
                let callback_sender = sender.clone();
                let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |status, response| {
                        let result = status
                            .map(|_| response)
                            .map_err(|error| format!("执行渲染指令失败: {error}"));
                        let _ = callback_sender.try_send(result);
                        Ok(())
                    },
                ));
                let method = CoTaskMemPWSTR::from(method);
                let parameters = CoTaskMemPWSTR::from(parameters.as_str());
                unsafe {
                    core.CallDevToolsProtocolMethod(
                        *method.as_ref().as_pcwstr(),
                        *parameters.as_ref().as_pcwstr(),
                        &callback,
                    )
                }
                .map_err(|error| format!("发起渲染指令失败: {error}"))
            })();
            if let Err(error) = result {
                let _ = sender.try_send(Err(error));
            }
        })
        .map_err(|error| format!("调度离屏渲染窗口失败: {error}"))?;
    wait_capture_result(&mut receiver, state, deadline).await
}

#[cfg(target_os = "windows")]
async fn navigate_render_html(window: &WebviewWindow, html: String) -> Result<(), String> {
    use webview2_com::CoTaskMemPWSTR;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            let result = (|| {
                let core = unsafe { webview.controller().CoreWebView2() }
                    .map_err(|error| format!("获取离屏渲染 WebView2 失败: {error}"))?;
                let content = CoTaskMemPWSTR::from(html.as_str());
                unsafe { core.NavigateToString(*content.as_ref().as_pcwstr()) }
                    .map_err(|error| format!("载入图形渲染内容失败: {error}"))
            })();
            let _ = sender.send(result);
        })
        .map_err(|error| format!("调度离屏渲染载入失败: {error}"))?;
    receiver
        .await
        .map_err(|_| "离屏渲染载入状态异常中断".to_string())?
}

#[cfg(target_os = "windows")]
async fn wait_render_ready(
    window: &WebviewWindow,
    state: &Arc<CaptureState>,
    deadline: Instant,
) -> Result<(), String> {
    let evaluate_params =
        r#"{"expression":"window.__PELICAN_RENDER_READY === true","returnByValue":true}"#
            .to_string();
    loop {
        state.ensure_running()?;
        if Instant::now() >= deadline {
            return Err("离屏渲染页面就绪超时".to_string());
        }
        let response = call_cdp_method(
            window,
            "Runtime.evaluate",
            evaluate_params.clone(),
            state,
            deadline,
        )
        .await?;
        if is_render_ready_response(&response) {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(RENDER_READY_POLL_MS)).await;
    }
}

#[cfg(target_os = "windows")]
async fn capture_png(
    window: &WebviewWindow,
    state: &Arc<CaptureState>,
    task_deadline: Instant,
) -> Result<String, String> {
    let deadline = task_deadline.min(Instant::now() + Duration::from_millis(FRAME_TIMEOUT_MS));
    let response = call_cdp_method(
        window,
        "Page.captureScreenshot",
        screenshot_parameters(),
        state,
        deadline,
    )
    .await?;
    parse_capture_frame(&response)
}

#[tauri::command]
pub async fn capture_pelican_frames(
    app: AppHandle,
    window: WebviewWindow,
    request_id: String,
    html: String,
    duration_ms: u64,
    on_frame: Channel<CaptureFrame>,
) -> Result<usize, String> {
    ensure_main_window(window.label())?;
    validate_render_html(&html)?;
    let frame_limit = capture_frame_limit(duration_ms)?;
    let guard = capture_registry().begin(&request_id)?;
    guard.state.ensure_running()?;

    #[cfg(target_os = "windows")]
    {
        let renderer_data_dir = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("获取离屏渲染缓存目录失败: {error}"))?
            .join("pelican-gif-renderer");
        let label = format!("pelican-gif-render-{}", sanitize_render_label(&request_id));
        let about_blank = tauri::WebviewUrl::External(
            "about:blank"
                .parse()
                .map_err(|_| "离屏渲染初始地址无效".to_string())?,
        );
        // 使用独立的离屏窗口并禁用原生遮挡与后台节流，确保导出过程不受主窗口尺寸、滚动或弹窗影响。
        let render_window = tauri::WebviewWindowBuilder::new(&app, label, about_blank)
            .title("Pelican GIF Renderer")
            .inner_size(GIF_CAPTURE_WIDTH, GIF_CAPTURE_HEIGHT)
            .position(-20000.0, -20000.0)
            .decorations(false)
            .shadow(false)
            .resizable(false)
            .skip_taskbar(true)
            .focused(false)
            .visible(true)
            .data_directory(renderer_data_dir)
            .additional_browser_args(
                "--disable-features=CalculateNativeWinOcclusion --disable-background-timer-throttling --disable-renderer-backgrounding",
            )
            .build()
            .map_err(|error| format!("创建离屏渲染窗口失败: {error}"))?;
        let _render_guard = RenderWindowGuard(render_window.clone());

        navigate_render_html(&render_window, html).await?;
        let ready_deadline = Instant::now() + Duration::from_millis(RENDER_READY_TIMEOUT_MS);
        wait_render_ready(&render_window, &guard.state, ready_deadline).await?;

        let started = Instant::now();
        let recording_end = started + Duration::from_millis(duration_ms);
        let task_deadline = recording_end + Duration::from_millis(FRAME_TIMEOUT_MS);
        let mut next_frame = started;
        let mut frame_count = 0;
        for _ in 0..frame_limit {
            tokio::time::sleep_until(next_frame.into()).await;
            guard.state.ensure_running()?;
            if Instant::now() >= recording_end {
                break;
            }
            let timestamp_ms = started.elapsed().as_secs_f64() * 1000.0;
            let data = capture_png(&render_window, &guard.state, task_deadline).await?;
            guard.state.ensure_running()?;
            on_frame
                .send(CaptureFrame { data, timestamp_ms })
                .map_err(|error| format!("发送 GIF 帧失败: {error}"))?;
            frame_count += 1;
            // 慢截图跳过错过的采样点，避免补帧突发和超出目标帧率。
            next_frame = next_capture_instant(started, Instant::now(), recording_end);
        }
        guard.state.ensure_running()?;
        completed_frame_count(frame_count)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, guard, frame_limit, on_frame);
        Err("当前平台暂不支持原生 GIF 采集".to_string())
    }
}

#[tauri::command]
pub fn cancel_pelican_capture(window: WebviewWindow, request_id: String) -> Result<(), String> {
    ensure_main_window(window.label())?;
    capture_registry().cancel(&request_id)
}

fn parse_custom_download_dir(custom_dir: Option<&str>) -> Result<Option<PathBuf>, String> {
    let Some(raw) = custom_dir else {
        return Ok(None);
    };
    let trimmed = raw.trim();
    let unquoted = trimmed
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(trimmed)
        .trim();
    if unquoted.is_empty() {
        return Ok(None);
    }
    if unquoted.len() > 512 || unquoted.contains('\0') {
        return Err("自定义下载目录路径无效".to_string());
    }
    let path = PathBuf::from(unquoted);
    if !path.is_absolute() {
        return Err("自定义下载目录必须是绝对路径".to_string());
    }
    Ok(Some(path))
}

#[tauri::command]
pub async fn pick_download_directory(
    app: AppHandle,
    window: WebviewWindow,
    current_dir: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    ensure_main_window(window.label())?;
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
    file_name: String,
    data: Vec<u8>,
    download_dir: Option<String>,
) -> Result<String, String> {
    let download_dir = match parse_custom_download_dir(download_dir.as_deref())? {
        Some(custom) => custom,
        None => app
            .path()
            .download_dir()
            .map_err(|error| format!("无法获取系统下载目录: {error}"))?,
    };
    tauri::async_runtime::spawn_blocking(move || {
        write_download_file(&download_dir, &file_name, &data)
    })
    .await
    .map_err(|error| format!("保存下载文件任务失败: {error}"))?
    .map(|path| display_download_path(&path))
}

fn display_download_path(path: &Path) -> String {
    let text = path.to_string_lossy();
    if let Some(path) = text.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{path}");
    }
    if let Some(path) = text.strip_prefix(r"\\?\") {
        let bytes = path.as_bytes();
        if bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && bytes[2] == b'\\'
        {
            return path.to_string();
        }
    }
    text.into_owned()
}

#[cfg(any(target_os = "windows", test))]
fn next_capture_instant(started: Instant, now: Instant, recording_end: Instant) -> Instant {
    let tick = now.saturating_duration_since(started).as_millis() as u64 / FRAME_INTERVAL_MS + 1;
    (started + Duration::from_millis(tick * FRAME_INTERVAL_MS)).min(recording_end)
}

fn completed_frame_count(frame_count: usize) -> Result<usize, String> {
    if frame_count == 0 || frame_count > MAX_CAPTURE_FRAMES {
        return Err("采集作品帧数量无效，请重试".to_string());
    }
    Ok(frame_count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_download_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../.temp/pelican-export-tests")
            .join(format!("{name}-{}-{unique}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn test_sanitize_preserves_chinese_and_removes_windows_invalid_characters() {
        assert_eq!(
            sanitize_download_name("  鹈鹕/骑车:2026?.GIF ").unwrap(),
            "鹈鹕_骑车_2026_.gif"
        );
    }

    #[test]
    fn test_sanitize_avoids_windows_reserved_names() {
        assert_eq!(sanitize_download_name("CON.gif").unwrap(), "_CON.gif");
        assert_eq!(sanitize_download_name("lpt1.svg").unwrap(), "_lpt1.svg");
    }

    #[test]
    fn test_sanitize_rejects_unsupported_or_empty_names() {
        for name in [
            "",
            "   ",
            ".gif",
            "pelican.exe",
            "pelican.gif.exe",
            "pelican",
        ] {
            assert!(sanitize_download_name(name).is_err(), "{name}");
        }
    }

    #[test]
    fn test_sanitize_keeps_paths_inside_download_directory() {
        let name = sanitize_download_name("..\\..\\骑车.gif").unwrap();
        assert!(!name.contains(['/', '\\', ':']));
        assert!(!name.starts_with('.'));
        assert!(!name.ends_with(['.', ' ']));
    }

    #[test]
    fn test_capture_duration_has_twenty_fps_and_one_hundred_frame_limit() {
        assert_eq!(capture_frame_limit(1).unwrap(), 1);
        assert_eq!(capture_frame_limit(50).unwrap(), 1);
        assert_eq!(capture_frame_limit(51).unwrap(), 2);
        assert_eq!(capture_frame_limit(5000).unwrap(), 100);
        assert!(capture_frame_limit(0).is_err());
        assert!(capture_frame_limit(5001).is_err());
        assert!(capture_frame_limit(u64::MAX).is_err());
    }

    #[test]
    fn test_screenshot_parameters_captures_surface_without_clip() {
        let parameters: serde_json::Value =
            serde_json::from_str(&screenshot_parameters()).unwrap();
        assert_eq!(parameters["format"], "png");
        assert_eq!(parameters["fromSurface"], true);
        assert_eq!(parameters["captureBeyondViewport"], false);
        assert!(parameters.get("clip").is_none());
    }

    #[test]
    fn test_capture_frame_is_camel_case_for_worker_channel() {
        let frame = serde_json::to_value(CaptureFrame {
            data: "png-base64".to_string(),
            timestamp_ms: 12.5,
        })
        .unwrap();
        assert_eq!(frame["timestampMs"], 12.5);
        assert!(frame.get("timestamp_ms").is_none());
    }

    #[test]
    fn test_parse_capture_frame_returns_clipped_png_data() {
        assert_eq!(
            parse_capture_frame(r#"{"data":"png-base64"}"#).unwrap(),
            "png-base64"
        );
    }

    #[test]
    fn test_parse_capture_frame_rejects_empty_and_missing_images() {
        for response in ["{}", r#"{"data":""}"#, "not-json"] {
            assert!(parse_capture_frame(response).is_err());
        }
    }

    #[test]
    fn test_download_writes_real_chinese_named_file() {
        let directory = test_download_dir("chinese");
        let path = write_download_file(&directory, "鹈鹕骑车.gif", b"GIF89a").unwrap();
        assert!(path.is_absolute());
        assert_eq!(path.file_name().unwrap(), "鹈鹕骑车.gif");
        assert_eq!(fs::read(path).unwrap(), b"GIF89a");
    }

    #[test]
    fn test_download_collision_preserves_original_and_appends_counter() {
        let directory = test_download_dir("collision");
        let original = directory.join("鹈鹕骑车.gif");
        fs::write(&original, b"original").unwrap();
        let path = write_download_file(&directory, "鹈鹕骑车.gif", b"new").unwrap();
        assert_eq!(path.file_name().unwrap(), "鹈鹕骑车 (1).gif");
        assert_eq!(fs::read(original).unwrap(), b"original");
        assert_eq!(fs::read(path).unwrap(), b"new");
    }

    #[test]
    fn test_download_rejects_invalid_payload_without_creating_file() {
        let directory = test_download_dir("invalid");
        assert!(write_download_file(&directory, "pelican.gif", b"").is_err());
        assert!(write_download_file(&directory, "pelican.exe", b"payload").is_err());
        assert!(
            write_download_file(&directory, "pelican.gif", &vec![0; 20 * 1024 * 1024 + 1]).is_err()
        );
        assert_eq!(fs::read_dir(directory).unwrap().count(), 0);
    }

    #[test]
    fn test_download_reports_real_filesystem_failure() {
        let directory = test_download_dir("failure");
        let blocked = directory.join("not-a-directory");
        fs::write(&blocked, b"retained").unwrap();
        assert!(write_download_file(&blocked, "pelican.gif", b"GIF89a").is_err());
        assert_eq!(fs::read(blocked).unwrap(), b"retained");
    }

    #[test]
    fn test_capture_registry_rejects_concurrent_capture_and_releases_on_drop() {
        let registry = CaptureRegistry::default();
        let first = registry.begin("first").unwrap();
        assert!(registry.begin("second").is_err());
        let old_state = first.state.clone();
        drop(first);
        assert!(old_state.ensure_running().is_err());
        assert!(registry.begin("second").is_ok());
    }

    #[test]
    fn test_capture_registry_only_cancels_matching_request() {
        let registry = CaptureRegistry::default();
        let first = registry.begin("first").unwrap();
        registry.cancel("unrelated").unwrap();
        assert!(first.state.ensure_running().is_ok());
        registry.cancel("first").unwrap();
        assert!(first.state.ensure_running().unwrap_err().contains("取消"));
        drop(first);
        assert!(registry
            .begin("first")
            .unwrap()
            .state
            .ensure_running()
            .is_ok());
    }

    #[test]
    fn test_capture_registry_rejects_empty_request_ids() {
        let registry = CaptureRegistry::default();
        assert!(registry.begin("").is_err());
        assert!(registry.begin("   ").is_err());
        assert!(registry.begin(&"x".repeat(129)).is_err());
        assert!(registry.begin("valid").is_ok());
    }

    #[test]
    fn test_capture_commands_only_allow_main_window() {
        assert!(ensure_main_window("main").is_ok());
        assert!(ensure_main_window("preview").is_err());
        assert!(ensure_main_window("").is_err());
    }

    #[test]
    fn test_capture_wait_delivers_ready_callback_immediately() {
        let state = CaptureState {
            request_id: "ready".to_string(),
            canceled: AtomicBool::new(false),
        };
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
        sender.try_send(Ok("clipped-png".to_string())).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        assert_eq!(
            runtime
                .block_on(wait_capture_result(
                    &mut receiver,
                    &state,
                    Instant::now() + Duration::from_millis(50)
                ))
                .unwrap(),
            "clipped-png"
        );
    }

    #[test]
    fn test_capture_wait_is_bounded_by_deadline() {
        let state = CaptureState {
            request_id: "timeout".to_string(),
            canceled: AtomicBool::new(false),
        };
        let (_sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        let started = Instant::now();
        let error = runtime
            .block_on(wait_capture_result(
                &mut receiver,
                &state,
                started + Duration::from_millis(30),
            ))
            .unwrap_err();
        assert!(error.contains("超时"), "{error}");
        assert!(started.elapsed() >= Duration::from_millis(30));
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn test_capture_wait_rejects_canceled_or_closed_callbacks() {
        let state = CaptureState {
            request_id: "cancel".to_string(),
            canceled: AtomicBool::new(true),
        };
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        assert!(runtime
            .block_on(wait_capture_result(
                &mut receiver,
                &state,
                Instant::now() + Duration::from_secs(2)
            ))
            .unwrap_err()
            .contains("取消"));
        state.canceled.store(false, Ordering::Relaxed);
        drop(sender);
        assert!(runtime
            .block_on(wait_capture_result(
                &mut receiver,
                &state,
                Instant::now() + Duration::from_secs(2)
            ))
            .unwrap_err()
            .contains("中断"));
    }

    #[test]
    fn test_display_download_path_normalizes_extended_drive_prefix() {
        assert_eq!(
            display_download_path(Path::new(r"\\?\C:\Users\测试\Downloads\鹈鹕.gif")),
            r"C:\Users\测试\Downloads\鹈鹕.gif"
        );
    }

    #[test]
    fn test_display_download_path_normalizes_extended_unc_prefix() {
        assert_eq!(
            display_download_path(Path::new(r"\\?\UNC\server\share\鹈鹕.gif")),
            r"\\server\share\鹈鹕.gif"
        );
        assert_eq!(
            display_download_path(Path::new(r"D:\下载\鹈鹕.gif")),
            r"D:\下载\鹈鹕.gif"
        );
    }

    #[test]
    fn test_next_capture_instant_skips_missed_ticks_without_exceeding_duration() {
        let started = Instant::now();
        let end = started + Duration::from_secs(5);
        assert_eq!(
            next_capture_instant(started, started + Duration::from_millis(121), end),
            started + Duration::from_millis(150)
        );
        assert_eq!(
            next_capture_instant(started, started + Duration::from_millis(6990), end),
            end
        );
    }

    #[test]
    fn test_sanitize_avoids_windows_superscript_reserved_port_names() {
        assert_eq!(sanitize_download_name("COM¹.gif").unwrap(), "_COM¹.gif");
        assert_eq!(sanitize_download_name("LPT².svg").unwrap(), "_LPT².svg");
        assert_eq!(sanitize_download_name("COM³.html").unwrap(), "_COM³.html");
    }

    #[test]
    fn test_download_concurrent_writes_never_overwrite_existing_content() {
        let directory = test_download_dir("concurrent");
        let tasks: Vec<_> = (0..8u8)
            .map(|value| {
                let directory = directory.clone();
                std::thread::spawn(move || {
                    let path = write_download_file(&directory, "鹈鹕.gif", &[value]).unwrap();
                    assert_eq!(fs::read(&path).unwrap(), [value]);
                    path
                })
            })
            .collect();
        let paths: std::collections::HashSet<_> =
            tasks.into_iter().map(|task| task.join().unwrap()).collect();
        assert_eq!(paths.len(), 8);
        assert_eq!(fs::read_dir(directory).unwrap().count(), 8);
    }

    #[test]
    fn test_capture_wait_observes_cancellation_while_com_callback_is_pending() {
        let state = Arc::new(CaptureState {
            request_id: "pending".to_string(),
            canceled: AtomicBool::new(false),
        });
        let (_sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let cancel_state = state.clone();
        let cancel = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(10));
            cancel_state.canceled.store(true, Ordering::Release);
        });
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        let started = Instant::now();
        let error = runtime
            .block_on(wait_capture_result(
                &mut receiver,
                &state,
                started + Duration::from_secs(2),
            ))
            .unwrap_err();
        cancel.join().unwrap();
        assert!(error.contains("取消"), "{error}");
        assert!(started.elapsed() < Duration::from_millis(500));
    }

    #[test]
    fn test_completed_capture_reports_actual_sent_frame_count() {
        assert_eq!(completed_frame_count(1).unwrap(), 1);
        assert_eq!(completed_frame_count(37).unwrap(), 37);
        assert_eq!(completed_frame_count(100).unwrap(), 100);
    }

    #[test]
    fn test_completed_capture_rejects_empty_or_excess_frames() {
        assert!(completed_frame_count(0).is_err());
        assert!(completed_frame_count(101).is_err());
    }

    #[test]
    fn test_capture_command_returns_frame_count_metadata() {
        fn assert_count_result<Command, ResultFuture>(_command: Command)
        where
            Command: FnOnce(
                AppHandle,
                WebviewWindow,
                String,
                String,
                u64,
                Channel<CaptureFrame>,
            ) -> ResultFuture,
            ResultFuture: std::future::Future<Output = Result<usize, String>> + Send,
        {
        }
        assert_count_result(capture_pelican_frames);
    }

    #[test]
    fn test_render_html_validation_and_ready_response_parsing() {
        assert!(validate_render_html("").is_err());
        assert!(validate_render_html("   ").is_err());
        assert!(validate_render_html("<!DOCTYPE html><html></html>").is_ok());
        assert!(validate_render_html(&"a".repeat(MAX_RENDER_HTML_BYTES + 1)).is_err());
        assert_eq!(sanitize_render_label("abc-123_XYZ!@#"), "abc-123_XYZ");
        assert!(is_render_ready_response(r#"{"result":{"type":"boolean","value":true}}"#));
        assert!(!is_render_ready_response(r#"{"result":{"type":"boolean","value":false}}"#));
        assert!(!is_render_ready_response("invalid"));
    }

    #[test]
    fn test_parse_custom_download_dir_handles_empty_quoted_and_relative_paths() {
        assert_eq!(parse_custom_download_dir(None).unwrap(), None);
        assert_eq!(parse_custom_download_dir(Some("   ")).unwrap(), None);
        assert_eq!(parse_custom_download_dir(Some(" \"\" ")).unwrap(), None);
        assert_eq!(
            parse_custom_download_dir(Some(r#"  "C:\Users\测试\Pelican"  "#)).unwrap(),
            Some(PathBuf::from(r"C:\Users\测试\Pelican"))
        );
        assert!(parse_custom_download_dir(Some("relative\\dir")).is_err());
        assert!(parse_custom_download_dir(Some("C:\\bad\0path")).is_err());
    }
}
