use std::path::{Path, PathBuf};

use crate::error::AppResult;
use crate::infra::fs::{display_download_path, parse_custom_download_dir, write_download_file};

#[derive(Clone, Default)]
pub struct DownloadService;

impl DownloadService {
    pub fn new() -> Self {
        Self
    }

    pub fn resolve_directory(
        &self,
        custom_dir: Option<&str>,
        default_dir: PathBuf,
    ) -> AppResult<PathBuf> {
        Ok(parse_custom_download_dir(custom_dir)?.unwrap_or(default_dir))
    }

    pub fn save_file(
        &self,
        download_dir: &Path,
        file_name: &str,
        data: &[u8],
    ) -> AppResult<String> {
        let path = write_download_file(download_dir, file_name, data)?;
        Ok(display_download_path(&path))
    }
}
