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
const MAX_CAPTURE_DURATION_MS: u64 = 5000;
const MAX_CAPTURE_FRAMES: usize = 100;
const MAX_CAPTURE_WIDTH: f64 = 640.0;
const MAX_CAPTURE_HEIGHT: f64 = 480.0;
const PIXEL_BOUNDARY_EPSILON: f64 = 0.000001;
#[cfg(any(target_os = "windows", test))]
const MAX_FRAME_DATA_BYTES: usize = 2 * 1024 * 1024;
const MAX_DOWNLOAD_BYTES: usize = 20 * 1024 * 1024;
const MAX_FILE_COLLISIONS: usize = 1000;

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureClip {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

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

fn validate_capture_clip(clip: &CaptureClip) -> Result<(), String> {
    if [clip.x, clip.y, clip.width, clip.height, clip.scale]
        .iter()
        .any(|value| !value.is_finite())
        || clip.x < 0.0
        || clip.y < 0.0
        || clip.width <= 0.0
        || clip.height <= 0.0
        || clip.scale <= 0.0
        || clip.scale > 1.0
        || !(clip.x + clip.width).is_finite()
        || !(clip.y + clip.height).is_finite()
    {
        return Err("作品裁剪区域或缩放参数无效".to_string());
    }
    let width = clip.width * clip.scale;
    let height = clip.height * clip.scale;
    if width < 1.0
        || height < 1.0
        || width > MAX_CAPTURE_WIDTH + PIXEL_BOUNDARY_EPSILON
        || height > MAX_CAPTURE_HEIGHT + PIXEL_BOUNDARY_EPSILON
    {
        return Err("GIF 帧尺寸必须介于 1×1 和 640×480 之间".to_string());
    }
    Ok(())
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
fn screenshot_parameters(clip: &CaptureClip, device_scale: f64) -> Result<String, String> {
    validate_capture_clip(clip)?;
    if !device_scale.is_finite() || device_scale <= 0.0 {
        return Err("主窗口屏幕缩放比例无效".to_string());
    }
    Ok(json!({
        "format": "png",
        "fromSurface": true,
        "captureBeyondViewport": false,
        "clip": {
            "x": clip.x,
            "y": clip.y,
            "width": clip.width,
            "height": clip.height,
            "scale": clip.scale.min(MAX_CAPTURE_WIDTH / clip.width).min(MAX_CAPTURE_HEIGHT / clip.height) / device_scale,
        },
    })
    .to_string())
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

#[cfg(target_os = "windows")]
async fn capture_png(
    window: &WebviewWindow,
    clip: CaptureClip,
    state: Arc<CaptureState>,
    task_deadline: Instant,
) -> Result<String, String> {
    use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};

    let deadline = task_deadline.min(Instant::now() + Duration::from_millis(FRAME_TIMEOUT_MS));
    let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
    let callback_state = state.clone();
    let main_window = window.clone();
    window
        .with_webview(move |webview| {
            if sender.is_closed()
                || callback_state.ensure_running().is_err()
                || Instant::now() >= deadline
            {
                return;
            }
            let result = (|| {
                let device_scale = main_window
                    .scale_factor()
                    .map_err(|error| format!("读取主窗口缩放比例失败: {error}"))?;
                let parameters = screenshot_parameters(&clip, device_scale)?;
                let core = unsafe { webview.controller().CoreWebView2() }
                    .map_err(|error| format!("获取主窗口 WebView2 失败: {error}"))?;
                let callback_sender = sender.clone();
                let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |status, response| {
                        let result = status
                            .map(|_| response)
                            .map_err(|error| format!("采集作品截图失败: {error}"));
                        let _ = callback_sender.try_send(result);
                        Ok(())
                    },
                ));
                let method = CoTaskMemPWSTR::from("Page.captureScreenshot");
                let parameters = CoTaskMemPWSTR::from(parameters.as_str());
                // WebView2 的 COM 操作必须留在 Tauri 调度的 UI 线程，且仅申请作品裁剪区域。
                unsafe {
                    core.CallDevToolsProtocolMethod(
                        *method.as_ref().as_pcwstr(),
                        *parameters.as_ref().as_pcwstr(),
                        &callback,
                    )
                }
                .map_err(|error| format!("发起作品截图失败: {error}"))
            })();
            if let Err(error) = result {
                let _ = sender.try_send(Err(error));
            }
        })
        .map_err(|error| format!("调度主窗口截图失败: {error}"))?;
    let response = wait_capture_result(&mut receiver, &state, deadline).await?;
    parse_capture_frame(&response)
}

#[tauri::command]
pub async fn capture_pelican_frames(
    window: WebviewWindow,
    request_id: String,
    clip: CaptureClip,
    duration_ms: u64,
    on_frame: Channel<CaptureFrame>,
) -> Result<usize, String> {
    ensure_main_window(window.label())?;
    validate_capture_clip(&clip)?;
    let frame_limit = capture_frame_limit(duration_ms)?;
    let guard = capture_registry().begin(&request_id)?;
    guard.state.ensure_running()?;

    #[cfg(target_os = "windows")]
    {
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
            let data = capture_png(&window, clip, guard.state.clone(), task_deadline).await?;
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
        let _ = (guard, frame_limit, on_frame);
        Err("当前平台暂不支持原生 GIF 采集".to_string())
    }
}

#[tauri::command]
pub fn cancel_pelican_capture(window: WebviewWindow, request_id: String) -> Result<(), String> {
    ensure_main_window(window.label())?;
    capture_registry().cancel(&request_id)
}

#[tauri::command]
pub async fn save_pelican_download(
    app: AppHandle,
    file_name: String,
    data: Vec<u8>,
) -> Result<String, String> {
    let download_dir = app
        .path()
        .download_dir()
        .map_err(|error| format!("无法获取系统下载目录: {error}"))?;
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

    fn valid_clip() -> CaptureClip {
        CaptureClip {
            x: 120.0,
            y: 900.0,
            width: 800.0,
            height: 600.0,
            scale: 0.8,
        }
    }

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
    fn test_capture_clip_accepts_scaled_output_at_limit() {
        assert!(validate_capture_clip(&valid_clip()).is_ok());
    }

    #[test]
    fn test_capture_clip_rejects_nonfinite_negative_and_oversized_values() {
        let base = valid_clip();
        for clip in [
            CaptureClip {
                x: f64::NAN,
                ..base
            },
            CaptureClip { y: -1.0, ..base },
            CaptureClip {
                width: f64::INFINITY,
                ..base
            },
            CaptureClip { width: 0.0, ..base },
            CaptureClip { scale: 0.0, ..base },
            CaptureClip { scale: 1.1, ..base },
            CaptureClip {
                width: 801.0,
                ..base
            },
            CaptureClip {
                height: 601.0,
                ..base
            },
            CaptureClip { width: 0.1, ..base },
        ] {
            assert!(validate_capture_clip(&clip).is_err(), "{clip:?}");
        }
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
    fn test_screenshot_parameters_only_capture_absolute_clip_at_device_scale() {
        let parameters: serde_json::Value =
            serde_json::from_str(&screenshot_parameters(&valid_clip(), 2.0).unwrap()).unwrap();
        assert_eq!(parameters["format"], "png");
        assert_eq!(parameters["fromSurface"], true);
        assert_eq!(parameters["captureBeyondViewport"], false);
        assert_eq!(parameters["clip"]["x"], 120.0);
        assert_eq!(parameters["clip"]["y"], 900.0);
        assert_eq!(parameters["clip"]["width"], 800.0);
        assert_eq!(parameters["clip"]["height"], 600.0);
        assert_eq!(parameters["clip"]["scale"], 0.4);
        assert!(screenshot_parameters(&valid_clip(), 0.0).is_err());
        assert!(screenshot_parameters(&valid_clip(), f64::NAN).is_err());
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
    fn test_capture_clip_allows_only_floating_point_noise_at_pixel_limit() {
        let clip = CaptureClip {
            width: 800.0000000001,
            height: 600.0000000001,
            ..valid_clip()
        };
        assert!(validate_capture_clip(&clip).is_ok());
        assert!(validate_capture_clip(&CaptureClip {
            width: 800.001,
            ..clip
        })
        .is_err());
        let parameters: serde_json::Value =
            serde_json::from_str(&screenshot_parameters(&clip, 1.0).unwrap()).unwrap();
        let scale = parameters["clip"]["scale"].as_f64().unwrap();
        assert!(clip.width * scale <= MAX_CAPTURE_WIDTH);
        assert!(clip.height * scale <= MAX_CAPTURE_HEIGHT);
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
                WebviewWindow,
                String,
                CaptureClip,
                u64,
                Channel<CaptureFrame>,
            ) -> ResultFuture,
            ResultFuture: std::future::Future<Output = Result<usize, String>> + Send,
        {
        }
        assert_count_result(capture_pelican_frames);
    }
}
