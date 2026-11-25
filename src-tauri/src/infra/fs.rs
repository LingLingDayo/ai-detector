use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

pub const MAX_DOWNLOAD_BYTES: usize = 20 * 1024 * 1024;
pub const MAX_DATA_FILE_BYTES: usize = 50 * 1024 * 1024;
pub const MAX_FILE_COLLISIONS: usize = 1000;

pub fn sanitize_download_name(file_name: &str) -> AppResult<String> {
    if file_name.len() > 512 {
        return Err(AppError::InvalidInput("下载文件名过长".to_string()));
    }
    let (stem, extension) = file_name
        .trim()
        .rsplit_once('.')
        .ok_or_else(|| AppError::InvalidInput("下载文件仅支持 GIF、SVG 或 HTML 格式".to_string()))?;
    let extension = extension.to_ascii_lowercase();
    if !matches!(extension.as_str(), "gif" | "svg" | "html") {
        return Err(AppError::InvalidInput(
            "下载文件仅支持 GIF、SVG 或 HTML 格式".to_string(),
        ));
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
        return Err(AppError::InvalidInput("下载文件名不能为空".to_string()));
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

pub fn parse_custom_download_dir(custom_dir: Option<&str>) -> AppResult<Option<PathBuf>> {
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
        return Err(AppError::InvalidInput("自定义下载目录路径无效".to_string()));
    }
    let path = PathBuf::from(unquoted);
    if !path.is_absolute() {
        return Err(AppError::InvalidInput(
            "自定义下载目录必须是绝对路径".to_string(),
        ));
    }
    Ok(Some(path))
}

pub fn display_download_path(path: &Path) -> String {
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

pub fn write_download_file(
    download_dir: &Path,
    file_name: &str,
    data: &[u8],
) -> AppResult<PathBuf> {
    let file_name = sanitize_download_name(file_name)?;
    if data.is_empty() || data.len() > MAX_DOWNLOAD_BYTES {
        return Err(AppError::InvalidInput(
            "下载文件不能为空且不能超过 20 MiB".to_string(),
        ));
    }
    if !download_dir.is_absolute() {
        return Err(AppError::InvalidInput(
            "系统下载目录不是绝对路径".to_string(),
        ));
    }
    fs::create_dir_all(download_dir)
        .map_err(|error| AppError::Io(format!("创建系统下载目录失败: {error}")))?;
    let download_dir = download_dir
        .canonicalize()
        .map_err(|error| AppError::Io(format!("读取系统下载目录失败: {error}")))?;
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
                        AppError::Io(format!(
                            "写入下载文件失败（未完成文件保留于 {}）: {error}",
                            display_download_path(&path)
                        ))
                    })?;
                return Ok(path);
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(AppError::Io(format!("创建下载文件失败: {error}"))),
        }
    }
    Err(AppError::Conflict(
        "下载目录中同名文件过多，请修改作品名称后重试".to_string(),
    ))
}

pub fn write_data_file(path: &Path, data: &[u8]) -> AppResult<PathBuf> {
    if data.is_empty() || data.len() > MAX_DATA_FILE_BYTES {
        return Err(AppError::InvalidInput(
            "导出数据不能为空且不能超过 50 MiB".to_string(),
        ));
    }
    if !path.is_absolute() {
        return Err(AppError::InvalidInput(
            "导出文件路径必须是绝对路径".to_string(),
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| AppError::InvalidInput("导出文件路径无效".to_string()))?;
    fs::create_dir_all(parent)
        .map_err(|error| AppError::Io(format!("创建导出目录失败: {error}")))?;
    let mut file = fs::File::create(path)
        .map_err(|error| AppError::Io(format!("创建导出文件失败: {error}")))?;
    file.write_all(data)
        .and_then(|_| file.sync_all())
        .map_err(|error| AppError::Io(format!("写入导出文件失败: {error}")))?;
    Ok(path.canonicalize().unwrap_or_else(|_| path.to_path_buf()))
}

pub fn read_data_file(path: &Path) -> AppResult<Vec<u8>> {
    if !path.is_absolute() {
        return Err(AppError::InvalidInput(
            "导入文件路径必须是绝对路径".to_string(),
        ));
    }
    let meta = fs::metadata(path)
        .map_err(|error| AppError::Io(format!("读取导入文件信息失败: {error}")))?;
    if !meta.is_file() {
        return Err(AppError::InvalidInput("所选路径不是有效文件".to_string()));
    }
    if meta.len() == 0 || meta.len() > MAX_DATA_FILE_BYTES as u64 {
        return Err(AppError::InvalidInput(
            "导入文件不能为空且不能超过 50 MiB".to_string(),
        ));
    }
    fs::read(path).map_err(|error| AppError::Io(format!("读取导入文件失败: {error}")))
}

#[cfg(test)]
mod tests {
    use super::*;
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
    fn test_sanitize_avoids_windows_superscript_reserved_port_names() {
        assert_eq!(sanitize_download_name("COM¹.gif").unwrap(), "_COM¹.gif");
        assert_eq!(sanitize_download_name("LPT².svg").unwrap(), "_LPT².svg");
        assert_eq!(sanitize_download_name("COM³.html").unwrap(), "_COM³.html");
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

    #[test]
    fn test_write_and_read_data_file_roundtrip() {
        let directory = test_download_dir("data-file");
        let target = directory.join("nested").join("backup.json");
        let payload = br#"{"hello":"world"}"#;
        let saved = write_data_file(&target, payload).unwrap();
        assert!(saved.is_absolute());
        assert_eq!(read_data_file(&saved).unwrap(), payload);
    }

    #[test]
    fn test_write_and_read_data_file_rejects_invalid_inputs() {
        let directory = test_download_dir("data-file-invalid");
        assert!(write_data_file(&directory.join("empty.json"), b"").is_err());
        assert!(write_data_file(Path::new("relative.json"), b"ok").is_err());
        assert!(write_data_file(
            &directory.join("huge.bin"),
            &vec![0; MAX_DATA_FILE_BYTES + 1]
        )
        .is_err());
        assert!(read_data_file(&directory.join("missing.json")).is_err());
        assert!(read_data_file(Path::new("relative.json")).is_err());
    }
}
