use std::ffi::OsString;
use std::fs::{self, File};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::error::{AppError, AppResult};

pub fn staged_path(exe: &Path) -> PathBuf {
    let mut os: OsString = exe.as_os_str().to_os_string();
    os.push(".new");
    PathBuf::from(os)
}

pub fn backup_path(exe: &Path) -> PathBuf {
    let mut os: OsString = exe.as_os_str().to_os_string();
    os.push(".old");
    PathBuf::from(os)
}

fn map_io_error(context: &str, err: std::io::Error) -> AppError {
    if err.kind() == ErrorKind::PermissionDenied {
        AppError::Io("当前目录无写入权限，请手动下载新版本替换".to_string())
    } else {
        AppError::Io(format!("{context}: {err}"))
    }
}

/// 便携版原地自替换可执行文件：
/// Windows 下运行中的 exe 不能直接覆盖，但可以重命名为 `.old` 后将新文件移入原路径。
pub fn replace_executable(exe: &Path, bytes: &[u8]) -> AppResult<()> {
    if bytes.is_empty() {
        return Err(AppError::InvalidInput("更新包内容为空".to_string()));
    }

    let staged = staged_path(exe);
    let backup = backup_path(exe);

    {
        let mut file =
            File::create(&staged).map_err(|e| map_io_error("创建新版本临时文件失败", e))?;
        if let Err(e) = file.write_all(bytes).and_then(|_| file.sync_all()) {
            let _ = fs::remove_file(&staged);
            return Err(map_io_error("写入新版本文件失败", e));
        }
    }

    // 清理可能存在的旧备份文件
    let _ = fs::remove_file(&backup);

    if let Err(e) = fs::rename(exe, &backup) {
        let _ = fs::remove_file(&staged);
        return Err(map_io_error("备份当前可执行文件失败", e));
    }

    if let Err(e) = fs::rename(&staged, exe) {
        // 回滚：尽量把原 exe 恢复回来
        let _ = fs::rename(&backup, exe);
        let _ = fs::remove_file(&staged);
        return Err(map_io_error("替换可执行文件失败", e));
    }

    Ok(())
}

/// 清理便携版更新留下的 `.old` / `.new` 残留文件（旧进程可能仍在退出中，需短暂重试）。
pub fn cleanup_leftovers(exe: &Path) {
    let targets = [backup_path(exe), staged_path(exe)];

    for _ in 0..20 {
        let mut any_remaining = false;
        for path in &targets {
            if path.exists() {
                if fs::remove_file(path).is_err() {
                    any_remaining = true;
                }
            }
        }
        if !any_remaining {
            break;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn create_temp_test_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir()
            .join("ai-detector-updater-tests")
            .join(format!("{name}-{}-{unique}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_replace_executable_success() {
        let dir = create_temp_test_dir("replace-ok");
        let exe = dir.join("AI-Detector.exe");
        fs::write(&exe, b"old-binary-v1").unwrap();

        replace_executable(&exe, b"new-binary-v2").unwrap();

        assert_eq!(fs::read(&exe).unwrap(), b"new-binary-v2");
        assert_eq!(fs::read(backup_path(&exe)).unwrap(), b"old-binary-v1");
        assert!(!staged_path(&exe).exists());

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_replace_executable_rejects_empty_bytes() {
        let dir = create_temp_test_dir("replace-empty");
        let exe = dir.join("AI-Detector.exe");
        fs::write(&exe, b"old-binary").unwrap();

        let err = replace_executable(&exe, b"").unwrap_err();
        assert_eq!(err.error_code(), "INVALID_INPUT");
        assert_eq!(fs::read(&exe).unwrap(), b"old-binary");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_cleanup_leftovers_removes_files() {
        let dir = create_temp_test_dir("cleanup");
        let exe = dir.join("AI-Detector.exe");
        let backup = backup_path(&exe);
        let staged = staged_path(&exe);
        fs::write(&exe, b"current").unwrap();
        fs::write(&backup, b"old").unwrap();
        fs::write(&staged, b"new").unwrap();

        cleanup_leftovers(&exe);

        assert!(exe.exists());
        assert!(!backup.exists());
        assert!(!staged.exists());

        let _ = fs::remove_dir_all(&dir);
    }
}
