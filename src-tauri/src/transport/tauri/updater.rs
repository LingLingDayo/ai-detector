#[cfg(not(debug_assertions))]
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::platform::updater::{detect_install_kind, portable, InstallKind};

#[derive(Default)]
pub struct UpdaterState {
    pending: tokio::sync::Mutex<Option<Update>>,
    pending_kind: tokio::sync::Mutex<Option<InstallKind>>,
    installing: AtomicBool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevUpdateOverride {
    pub endpoint: Option<String>,
    pub install_kind: Option<InstallKind>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallUpdateResult {
    pub dry_run: bool,
    pub saved_path: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInstallInfo {
    pub kind: InstallKind,
    pub can_auto_install: bool,
    pub current_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: String,
    pub pub_date: Option<String>,
    pub download_url: String,
    pub install_kind: InstallKind,
    pub can_auto_install: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgressPayload {
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[cfg(any(debug_assertions, test))]
pub(crate) fn parse_dev_install_kind(raw: &str) -> Option<InstallKind> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "nsis" => Some(InstallKind::Nsis),
        "msi" => Some(InstallKind::Msi),
        "portable" => Some(InstallKind::Portable),
        "dev" => Some(InstallKind::Dev),
        _ => None,
    }
}

#[cfg(debug_assertions)]
fn resolve_check_runtime(dev_override: Option<DevUpdateOverride>) -> (InstallKind, Option<String>) {
    let endpoint = dev_override
        .as_ref()
        .and_then(|o| o.endpoint.as_deref())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .or_else(|| {
            std::env::var("AI_DETECTOR_DEV_UPDATE_ENDPOINT")
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        });

    let kind = dev_override
        .as_ref()
        .and_then(|o| o.install_kind)
        .or_else(|| {
            std::env::var("AI_DETECTOR_DEV_INSTALL_KIND")
                .ok()
                .and_then(|s| parse_dev_install_kind(&s))
        })
        .unwrap_or_else(detect_install_kind);

    (kind, endpoint)
}

#[cfg(not(debug_assertions))]
fn resolve_check_runtime(_dev_override: Option<DevUpdateOverride>) -> (InstallKind, Option<String>) {
    (detect_install_kind(), None)
}

#[tauri::command]
pub fn get_app_install_info(app: AppHandle) -> AppInstallInfo {
    let kind = detect_install_kind();
    AppInstallInfo {
        kind,
        can_auto_install: kind.can_auto_install(),
        current_version: app.package_info().version.to_string(),
    }
}

#[tauri::command]
pub async fn check_app_update(
    app: AppHandle,
    state: State<'_, UpdaterState>,
    dev_override: Option<DevUpdateOverride>,
) -> Result<Option<AppUpdateInfo>, String> {
    let (kind, custom_endpoint) = resolve_check_runtime(dev_override);
    let mut builder = app.updater_builder().timeout(Duration::from_secs(20));
    if let Some(raw_endpoint) = custom_endpoint {
        let url = tauri::Url::parse(&raw_endpoint)
            .map_err(|e| format!("本地更新源地址无效: {e}"))?;
        builder = builder
            .endpoints(vec![url])
            .map_err(|e| format!("配置本地更新源失败: {e}"))?;
    }
    if let Some(target) = kind.updater_target() {
        builder = builder.target(target);
    }

    let updater = builder
        .build()
        .map_err(|e| format!("检查更新失败: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("检查更新失败: {e}"))?;

    let mut guard = state.pending.lock().await;
    let mut kind_guard = state.pending_kind.lock().await;
    let Some(update) = update else {
        *guard = None;
        *kind_guard = None;
        return Ok(None);
    };

    let notes = update
        .body
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("暂无更新说明")
        .to_string();

    let pub_date = update
        .raw_json
        .get("pub_date")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let info = AppUpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes,
        pub_date,
        download_url: update.download_url.to_string(),
        install_kind: kind,
        can_auto_install: kind.can_auto_install(),
    };

    *guard = Some(update);
    *kind_guard = Some(kind);
    Ok(Some(info))
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    state: State<'_, UpdaterState>,
    on_progress: Channel<UpdateProgressPayload>,
) -> Result<InstallUpdateResult, String> {
    let kind = state
        .pending_kind
        .lock()
        .await
        .unwrap_or_else(detect_install_kind);
    if !kind.can_auto_install() {
        return Err("当前运行环境不支持自动安装，请前往发布页手动下载".to_string());
    }

    if state
        .installing
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("更新正在进行中，请勿重复操作".to_string());
    }

    struct InstallingReset<'a>(&'a AtomicBool);
    impl Drop for InstallingReset<'_> {
        fn drop(&mut self) {
            self.0.store(false, Ordering::SeqCst);
        }
    }
    let _reset_guard = InstallingReset(&state.installing);

    let update = {
        let mut guard = state.pending.lock().await;
        guard.take()
    }
    .ok_or_else(|| "未找到待安装的更新信息，请重新检查更新".to_string())?;

    let downloaded = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let last_reported = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let total_size = Arc::new(std::sync::atomic::AtomicU64::new(0));

    let dl_counter = Arc::clone(&downloaded);
    let last_counter = Arc::clone(&last_reported);
    let total_counter = Arc::clone(&total_size);
    let progress_channel = on_progress.clone();

    let finish_dl = Arc::clone(&downloaded);
    let finish_total = Arc::clone(&total_size);
    let finish_channel = on_progress.clone();

    let bytes = match update
        .download(
            move |chunk_length, content_length| {
                let current = dl_counter.fetch_add(chunk_length as u64, Ordering::SeqCst)
                    + chunk_length as u64;
                if let Some(total) = content_length {
                    total_counter.store(total, Ordering::SeqCst);
                }
                let prev = last_counter.load(Ordering::SeqCst);
                if current.saturating_sub(prev) >= 256 * 1024 {
                    last_counter.store(current, Ordering::SeqCst);
                    let _ = progress_channel.send(UpdateProgressPayload {
                        downloaded: current,
                        total: content_length,
                    });
                }
            },
            move || {
                let current = finish_dl.load(Ordering::SeqCst);
                let total_raw = finish_total.load(Ordering::SeqCst);
                let _ = finish_channel.send(UpdateProgressPayload {
                    downloaded: current,
                    total: if total_raw > 0 { Some(total_raw) } else { None },
                });
            },
        )
        .await
    {
        Ok(bytes) => bytes,
        Err(err) => {
            let mut guard = state.pending.lock().await;
            *guard = Some(update);
            return Err(format!("下载更新失败: {err}"));
        }
    };

    #[cfg(debug_assertions)]
    {
        let _ = &app;
        let version = update.version.clone();
        // 放回 pending，方便开发态反复点击测试进度条而不必重新拉取
        {
            let mut guard = state.pending.lock().await;
            *guard = Some(update);
        }

        let dev_dir = if std::path::Path::new(".temp").is_dir() {
            std::path::PathBuf::from(".temp").join("dev-update-downloaded")
        } else {
            std::env::temp_dir().join("ai-detector-dev-update")
        };
        std::fs::create_dir_all(&dev_dir)
            .map_err(|e| format!("创建开发演练输出目录失败: {e}"))?;

        if kind == InstallKind::Portable {
            let mock_exe = dev_dir.join("AI-Detector-dev-mock.exe");
            std::fs::write(&mock_exe, b"dev-mock-old-binary")
                .map_err(|e| format!("写入便携版模拟程序失败: {e}"))?;
            portable::replace_executable(&mock_exe, &bytes).map_err(|e| e.to_string())?;
            portable::cleanup_leftovers(&mock_exe);
            return Ok(InstallUpdateResult {
                dry_run: true,
                saved_path: Some(mock_exe.to_string_lossy().into_owned()),
                message: Some(format!(
                    "开发演练完成：已通过签名校验并完成便携版副本替换（{} 字节）",
                    bytes.len()
                )),
            });
        }

        let saved = dev_dir.join(format!("dev-installer-{version}.bin"));
        std::fs::write(&saved, &bytes).map_err(|e| format!("保存演练安装包失败: {e}"))?;
        return Ok(InstallUpdateResult {
            dry_run: true,
            saved_path: Some(saved.to_string_lossy().into_owned()),
            message: Some(format!(
                "开发演练完成：安装包已通过签名校验（{} 字节），未触发真实安装",
                bytes.len()
            )),
        });
    }

    #[cfg(not(debug_assertions))]
    {
        if kind == InstallKind::Portable {
            let exe = std::env::current_exe().map_err(|e| format!("获取当前程序路径失败: {e}"))?;
            if let Err(err) = portable::replace_executable(&exe, &bytes) {
                let mut guard = state.pending.lock().await;
                *guard = Some(update);
                return Err(err.to_string());
            }

            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(800)).await;
                let mut cmd = Command::new(&exe);
                if let Some(parent) = exe.parent() {
                    cmd.current_dir(parent);
                }
                match cmd.spawn() {
                    Ok(_) => {
                        app_handle.exit(0);
                    }
                    Err(err) => {
                        log::error!("便携版更新后重启失败: {err}");
                    }
                }
            });

            return Ok(InstallUpdateResult {
                dry_run: false,
                saved_path: None,
                message: None,
            });
        }

        if let Err(err) = update.install(bytes) {
            let mut guard = state.pending.lock().await;
            *guard = Some(update);
            return Err(format!("安装更新失败: {err}"));
        }

        app.exit(0);
        Ok(InstallUpdateResult {
            dry_run: false,
            saved_path: None,
            message: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_dev_install_kind() {
        assert_eq!(parse_dev_install_kind("nsis"), Some(InstallKind::Nsis));
        assert_eq!(parse_dev_install_kind("MSI"), Some(InstallKind::Msi));
        assert_eq!(
            parse_dev_install_kind(" Portable "),
            Some(InstallKind::Portable)
        );
        assert_eq!(parse_dev_install_kind("dev"), Some(InstallKind::Dev));
        assert_eq!(parse_dev_install_kind("unknown"), None);
        assert_eq!(parse_dev_install_kind(""), None);
    }
}
