use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex};

static RECORDING: Mutex<Option<(String, Arc<AtomicBool>)>> = Mutex::new(None);

#[tauri::command]
pub fn stop_pelican_recording(request_id: String) {
    if let Ok(recording) = RECORDING.lock() {
        if let Some((id, canceled)) = recording.as_ref() {
            if id == &request_id { canceled.store(true, Ordering::SeqCst); }
        }
    }
}

/// Subscribe to compositor frames rather than serializing one screenshot per IPC request.
#[tauri::command]
pub async fn record_pelican_frames(
    window: tauri::WebviewWindow,
    request_id: String,
    duration_ms: u64,
    on_progress: tauri::ipc::Channel<f64>,
) -> Result<Vec<serde_json::Value>, String> {
    #[cfg(windows)]
    {
        let canceled = Arc::new(AtomicBool::new(false));
        {
            let mut recording = RECORDING.lock().map_err(|e| e.to_string())?;
            if recording.is_some() { return Err("已有动画正在录制".to_string()); }
            *recording = Some((request_id, canceled.clone()));
        }
        let result = record_windows(window, duration_ms.clamp(100, 10_000), on_progress, canceled).await;
        if let Ok(mut recording) = RECORDING.lock() { *recording = None; }
        result
    }
    #[cfg(not(windows))]
    {
        let _ = (window, request_id, duration_ms, on_progress);
        Err("GIF 导出目前支持 Windows 桌面版".to_string())
    }
}

#[cfg(windows)]
async fn record_windows(
    window: tauri::WebviewWindow,
    duration_ms: u64,
    on_progress: tauri::ipc::Channel<f64>,
    canceled: Arc<AtomicBool>,
) -> Result<Vec<serde_json::Value>, String> {
    use std::time::Duration;
    use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, DevToolsProtocolEventReceivedEventHandler};
    use windows::core::{w, HSTRING, PWSTR};

    let (setup_tx, setup_rx) = tokio::sync::oneshot::channel();
    let (started_tx, mut started_rx) = tokio::sync::mpsc::unbounded_channel();
    let frames = Arc::new(Mutex::new(Vec::new()));
    let captured = frames.clone();
    window.with_webview(move |webview| {
        let setup = || -> windows::core::Result<i64> {
            unsafe {
                let core = webview.controller().CoreWebView2()?;
                let receiver = core.GetDevToolsProtocolEventReceiver(w!("Page.screencastFrame"))?;
                let ack_core = core.clone();
                let failed_tx = started_tx.clone();
                let mut last_progress = 0.0;
                let handler = DevToolsProtocolEventReceivedEventHandler::create(Box::new(move |_, args| {
                    if let Some(args) = args {
                        let mut raw = PWSTR::null();
                        args.ParameterObjectAsJson(&mut raw)?;
                        let text = webview2_com::CoTaskMemPWSTR::from(raw).to_string();
                        match serde_json::from_str::<serde_json::Value>(&text) {
                            Ok(frame) => {
                                // Encoding must never stall the compositor.
                                let ack = HSTRING::from(serde_json::json!({"sessionId": frame["sessionId"]}).to_string());
                                ack_core.CallDevToolsProtocolMethod(w!("Page.screencastFrameAck"), &ack,
                                    &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(()))))?;
                                let timestamp = frame["metadata"]["timestamp"].as_f64().unwrap_or(0.0);
                                if timestamp - last_progress >= 0.1 {
                                    last_progress = timestamp;
                                    let _ = on_progress.send(timestamp);
                                }
                                if let Ok(mut frames) = captured.lock() { frames.push(frame); }
                            }
                            Err(error) => { let _ = failed_tx.send(Err(format!("解析录制画面失败: {error}"))); }
                        }
                    }
                    Ok(())
                }));
                let mut token = 0;
                receiver.add_DevToolsProtocolEventReceived(&handler, &mut token)?;
                let started = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |status, _| {
                    let _ = started_tx.send(status.map_err(|e| format!("启动动画录制失败: {e}")));
                    Ok(())
                }));
                if let Err(error) = core.CallDevToolsProtocolMethod(w!("Page.startScreencast"),
                    w!(r#"{"format":"png","everyNthFrame":1}"#), &started) {
                    let _ = receiver.remove_DevToolsProtocolEventReceived(token);
                    return Err(error);
                }
                Ok(token)
            }
        };
        let _ = setup_tx.send(setup().map_err(|e| format!("无法访问录制窗口: {e}")));
    }).map_err(|e| e.to_string())?;
    let token = setup_rx.await.map_err(|e| e.to_string())??;

    let result = crate::cancellation::await_cancellable(async {
        tokio::time::timeout(Duration::from_secs(5), started_rx.recv()).await
            .map_err(|_| "启动动画录制超时".to_string())?
            .ok_or_else(|| "录制已中断".to_string())??;
        tokio::time::sleep(Duration::from_millis(duration_ms)).await;
        if let Ok(Err(error)) = started_rx.try_recv() { return Err(error); }
        Ok(())
    }, || canceled.load(Ordering::SeqCst)).await;

    let (stopped_tx, stopped_rx) = tokio::sync::oneshot::channel();
    window.with_webview(move |webview| {
        let stop = || -> windows::core::Result<()> {
            unsafe {
                let core = webview.controller().CoreWebView2()?;
                core.GetDevToolsProtocolEventReceiver(w!("Page.screencastFrame"))?
                    .remove_DevToolsProtocolEventReceived(token)?;
                core.CallDevToolsProtocolMethod(w!("Page.stopScreencast"), w!("{}"),
                    &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(()))))?;
            }
            Ok(())
        };
        let _ = stopped_tx.send(stop().map_err(|e| e.to_string()));
    }).map_err(|e| e.to_string())?;
    stopped_rx.await.map_err(|e| e.to_string())??;
    result?;
    let captured = std::mem::take(&mut *frames.lock().map_err(|e| e.to_string())?);
    Ok(captured)
}
