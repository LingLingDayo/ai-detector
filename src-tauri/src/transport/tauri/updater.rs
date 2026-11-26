use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::platform::updater::{detect_install_kind, portable, InstallKind};

#[derive(Default)]
pub struct UpdaterState {
    pending: tokio::sync::Mutex<Option<Update>>,
    installing: AtomicBool,
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
) -> Result<Option<AppUpdateInfo>, String> {
    let kind = detect_install_kind();
    let mut builder = app.updater_builder().timeout(Duration::from_secs(20));
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
    let Some(update) = update else {
        *guard = None;
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
    Ok(Some(info))
}

#[tauri::command]
pub async fn install_app_update(
    app: AppHandle,
    state: State<'_, UpdaterState>,
    on_progress: Channel<UpdateProgressPayload>,
) -> Result<(), String> {
    let kind = detect_install_kind();
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

        return Ok(());
    }

    if let Err(err) = update.install(bytes) {
        let mut guard = state.pending.lock().await;
        *guard = Some(update);
        return Err(format!("安装更新失败: {err}"));
    }

    app.exit(0);
    Ok(())
}
