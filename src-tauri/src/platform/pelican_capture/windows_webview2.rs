use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{ipc::Channel, AppHandle, Manager, WebviewWindow};

use crate::error::{AppError, AppResult};

use super::policy::{
    capture_frame_interval_ms, completed_frame_count, next_capture_instant, parse_capture_frame,
    sanitize_render_label, screenshot_parameters, CaptureFrame, FRAME_TIMEOUT_MS,
    GIF_CAPTURE_HEIGHT, GIF_CAPTURE_WIDTH, RENDER_READY_POLL_MS, RENDER_READY_TIMEOUT_MS,
};
use super::registry::{wait_capture_result, CaptureState};

struct RenderWindowGuard(WebviewWindow);

impl Drop for RenderWindowGuard {
    fn drop(&mut self) {
        let _ = self.0.destroy();
    }
}

async fn call_cdp_method(
    window: &WebviewWindow,
    method: &'static str,
    parameters: String,
    state: &Arc<CaptureState>,
    deadline: Instant,
) -> AppResult<String> {
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
                    .map_err(|error| AppError::Platform(format!("获取离屏渲染 WebView2 失败: {error}")))?;
                let callback_sender = sender.clone();
                let callback = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                    move |status, response| {
                        let result = status
                            .map(|_| response)
                            .map_err(|error| AppError::Platform(format!("执行渲染指令失败: {error}")));
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
                .map_err(|error| AppError::Platform(format!("发起渲染指令失败: {error}")))
            })();
            if let Err(error) = result {
                let _ = sender.try_send(Err(error));
            }
        })
        .map_err(|error| AppError::Platform(format!("调度离屏渲染窗口失败: {error}")))?;
    wait_capture_result(&mut receiver, state, deadline).await
}

unsafe fn make_window_invisible_offscreen(hwnd: *mut std::ffi::c_void) {
    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_TRANSPARENT: isize = 0x0000_0020;
    const WS_EX_TOOLWINDOW: isize = 0x0000_0080;
    const WS_EX_APPWINDOW: isize = 0x0004_0000;
    const WS_EX_LAYERED: isize = 0x0008_0000;
    const WS_EX_NOACTIVATE: isize = 0x0800_0000;
    const LWA_ALPHA: u32 = 0x0000_0002;
    const HWND_BOTTOM: *mut std::ffi::c_void = 1 as *mut std::ffi::c_void;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_SHOWWINDOW: u32 = 0x0040;

    #[link(name = "user32")]
    extern "system" {
        fn GetWindowLongPtrW(hwnd: *mut std::ffi::c_void, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: *mut std::ffi::c_void, index: i32, new_long: isize) -> isize;
        fn SetLayeredWindowAttributes(
            hwnd: *mut std::ffi::c_void,
            cr_key: u32,
            b_alpha: u8,
            dw_flags: u32,
        ) -> i32;
        fn SetWindowPos(
            hwnd: *mut std::ffi::c_void,
            hwnd_insert_after: *mut std::ffi::c_void,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
    }

    // 先设置为工具窗+不抢焦点+点击穿透+全透明，再移至屏幕外并置为可合成状态，确保用户全程无感。
    let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    let next_style = (ex_style & !WS_EX_APPWINDOW)
        | WS_EX_TOOLWINDOW
        | WS_EX_NOACTIVATE
        | WS_EX_TRANSPARENT
        | WS_EX_LAYERED;
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next_style);
    SetLayeredWindowAttributes(hwnd, 0, 0, LWA_ALPHA);
    SetWindowPos(
        hwnd,
        HWND_BOTTOM,
        -20000,
        -20000,
        0,
        0,
        SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
    );
}

async fn navigate_render_html(window: &WebviewWindow, html: String) -> AppResult<()> {
    use webview2_com::CoTaskMemPWSTR;

    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |webview| {
            let result = (|| {
                let controller = webview.controller();
                unsafe { controller.SetIsVisible(true) }.map_err(|error| {
                    AppError::Platform(format!("激活离屏渲染控制器失败: {error}"))
                })?;
                let core = unsafe { controller.CoreWebView2() }.map_err(|error| {
                    AppError::Platform(format!("获取离屏渲染 WebView2 失败: {error}"))
                })?;
                let content = CoTaskMemPWSTR::from(html.as_str());
                unsafe { core.NavigateToString(*content.as_ref().as_pcwstr()) }.map_err(
                    |error| AppError::Platform(format!("载入图形渲染内容失败: {error}")),
                )
            })();
            let _ = sender.send(result);
        })
        .map_err(|error| AppError::Platform(format!("调度离屏渲染载入失败: {error}")))?;
    receiver
        .await
        .map_err(|_| AppError::Platform("离屏渲染载入状态异常中断".to_string()))?
}

async fn wait_render_ready(
    window: &WebviewWindow,
    state: &Arc<CaptureState>,
    deadline: Instant,
) -> AppResult<()> {
    let evaluate_params =
        r#"{"expression":"window.__PELICAN_RENDER_READY === true","returnByValue":true}"#
            .to_string();
    loop {
        state.ensure_running()?;
        if Instant::now() >= deadline {
            return Err(AppError::Timeout("离屏渲染页面就绪超时".to_string()));
        }
        let response = call_cdp_method(
            window,
            "Runtime.evaluate",
            evaluate_params.clone(),
            state,
            deadline,
        )
        .await?;
        if super::policy::is_render_ready_response(&response) {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(RENDER_READY_POLL_MS)).await;
    }
}

async fn capture_png(
    window: &WebviewWindow,
    state: &Arc<CaptureState>,
    task_deadline: Instant,
) -> AppResult<String> {
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

pub async fn capture_frames_windows(
    app: &AppHandle,
    request_id: &str,
    html: String,
    duration_ms: u64,
    frame_limit: usize,
    state: &Arc<CaptureState>,
    on_frame: &Channel<CaptureFrame>,
) -> AppResult<usize> {
    let renderer_data_dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| AppError::Platform(format!("获取离屏渲染缓存目录失败: {error}")))?
        .join("pelican-gif-renderer");
    let label = format!("pelican-gif-render-{}", sanitize_render_label(request_id));
    let about_blank = tauri::WebviewUrl::External(
        "about:blank"
            .parse()
            .map_err(|_| AppError::Platform("离屏渲染初始地址无效".to_string()))?,
    );
    // 先以隐藏态创建避免首帧闪窗，再通过 Win32 设为全透明+无焦点+屏幕外合成，确保导出全程无感。
    let render_window = tauri::WebviewWindowBuilder::new(app, label, about_blank)
        .title("Pelican GIF Renderer")
        .inner_size(GIF_CAPTURE_WIDTH, GIF_CAPTURE_HEIGHT)
        .decorations(false)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .data_directory(renderer_data_dir)
        .additional_browser_args(
            "--disable-features=CalculateNativeWinOcclusion --disable-background-timer-throttling --disable-renderer-backgrounding",
        )
        .build()
        .map_err(|error| AppError::Platform(format!("创建离屏渲染窗口失败: {error}")))?;
    let _render_guard = RenderWindowGuard(render_window.clone());
    let hwnd = render_window
        .hwnd()
        .map_err(|error| AppError::Platform(format!("获取离屏渲染窗口句柄失败: {error}")))?;
    unsafe { make_window_invisible_offscreen(hwnd.0 as *mut std::ffi::c_void) };

    navigate_render_html(&render_window, html).await?;
    let ready_deadline = Instant::now() + Duration::from_millis(RENDER_READY_TIMEOUT_MS);
    wait_render_ready(&render_window, state, ready_deadline).await?;

    let started = Instant::now();
    let interval_ms = capture_frame_interval_ms(duration_ms);
    let recording_end = started + Duration::from_millis(duration_ms);
    let task_deadline = recording_end + Duration::from_millis(FRAME_TIMEOUT_MS);
    let mut next_frame = started;
    let mut frame_count = 0;
    for _ in 0..frame_limit {
        tokio::time::sleep_until(next_frame.into()).await;
        state.ensure_running()?;
        if Instant::now() >= recording_end {
            break;
        }
        let timestamp_ms = started.elapsed().as_secs_f64() * 1000.0;
        let data = capture_png(&render_window, state, task_deadline).await?;
        state.ensure_running()?;
        on_frame
            .send(CaptureFrame { data, timestamp_ms })
            .map_err(|error| AppError::Platform(format!("发送 GIF 帧失败: {error}")))?;
        frame_count += 1;
        // 慢截图跳过错过的采样点，避免补帧突发和超出目标帧率。
        next_frame = next_capture_instant(started, Instant::now(), recording_end, interval_ms);
    }
    state.ensure_running()?;
    completed_frame_count(frame_count)
}
