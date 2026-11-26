pub mod portable;

use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallKind {
    Nsis,
    Msi,
    Portable,
    Dev,
    Unsupported,
}

impl InstallKind {
    pub fn can_auto_install(self) -> bool {
        matches!(self, Self::Nsis | Self::Msi | Self::Portable)
    }

    pub fn updater_target(self) -> Option<String> {
        match self {
            Self::Portable => Some(format!("windows-{}-portable", std::env::consts::ARCH)),
            _ => None,
        }
    }
}

/// 根据运行目录特征与打包标记识别 Windows 安装方式：
/// 便携版 exe 直接取自 target/release，bundler 最后打入的标记是 NSIS，
/// 因此仅当有明确 MSI 标记时才判定为 MSI，而 NSIS 通过同目录 uninstall.exe 判定。
pub(crate) fn detect_windows_kind(exe: &Path, msi_marker: bool) -> InstallKind {
    if let Some(parent) = exe.parent() {
        if parent.join("uninstall.exe").is_file() {
            return InstallKind::Nsis;
        }
    }
    if msi_marker {
        InstallKind::Msi
    } else {
        InstallKind::Portable
    }
}

fn is_msi_bundle() -> bool {
    matches!(
        tauri::utils::platform::bundle_type(),
        Some(tauri::utils::config::BundleType::Msi)
    )
}

pub fn detect_install_kind() -> InstallKind {
    if cfg!(debug_assertions) {
        return InstallKind::Dev;
    }
    if !cfg!(target_os = "windows") {
        return InstallKind::Unsupported;
    }
    let Ok(exe) = std::env::current_exe() else {
        return InstallKind::Portable;
    };
    detect_windows_kind(&exe, is_msi_bundle())
}

pub fn spawn_startup_cleanup() {
    if let Ok(exe) = std::env::current_exe() {
        std::thread::spawn(move || {
            portable::cleanup_leftovers(&exe);
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir()
            .join("ai-detector-updater-kind-tests")
            .join(format!("{name}-{}-{unique}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_detect_windows_kind_branches() {
        let dir_nsis = create_temp_dir("nsis");
        let exe_nsis = dir_nsis.join("AI-Detector.exe");
        fs::write(&exe_nsis, b"").unwrap();
        fs::write(dir_nsis.join("uninstall.exe"), b"").unwrap();
        assert_eq!(detect_windows_kind(&exe_nsis, false), InstallKind::Nsis);
        assert_eq!(detect_windows_kind(&exe_nsis, true), InstallKind::Nsis);
        let _ = fs::remove_dir_all(&dir_nsis);

        let dir_msi = create_temp_dir("msi");
        let exe_msi = dir_msi.join("AI-Detector.exe");
        fs::write(&exe_msi, b"").unwrap();
        assert_eq!(detect_windows_kind(&exe_msi, true), InstallKind::Msi);
        assert_eq!(detect_windows_kind(&exe_msi, false), InstallKind::Portable);
        let _ = fs::remove_dir_all(&dir_msi);
    }
}
