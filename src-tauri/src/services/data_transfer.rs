use std::path::Path;

use crate::error::AppResult;
use crate::infra::fs::{display_download_path, read_data_file, write_data_file};

#[derive(Clone, Default)]
pub struct DataTransferService;

impl DataTransferService {
    pub fn new() -> Self {
        Self
    }

    pub fn save_export_file(&self, path: &Path, data: &[u8]) -> AppResult<String> {
        let saved = write_data_file(path, data)?;
        Ok(display_download_path(&saved))
    }

    pub fn read_import_file(&self, path: &Path) -> AppResult<(String, String, Vec<u8>)> {
        let data = read_data_file(path)?;
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_string())
            .unwrap_or_else(|| "import.bin".to_string());
        Ok((file_name, display_download_path(path), data))
    }
}
