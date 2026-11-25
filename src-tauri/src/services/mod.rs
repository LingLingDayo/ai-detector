pub mod candy;
pub mod chat;
pub mod data_transfer;
pub mod download;
pub mod models;
pub mod probe;

use crate::error::AppResult;
use crate::infra::cancel::CancellationRegistry;
use crate::infra::http::HttpClient;

use candy::CandyService;
use chat::ChatService;
use data_transfer::DataTransferService;
use download::DownloadService;
use models::ModelsService;
use probe::ProbeService;

/// 核心应用服务容器；纯异步 Rust，零 Tauri 依赖，可被任何传输层（Tauri / HTTP API）直接复用。
#[derive(Clone)]
pub struct AppServices {
    pub probe: ProbeService,
    pub chat: ChatService,
    pub models: ModelsService,
    pub candy: CandyService,
    pub download: DownloadService,
    pub data_transfer: DataTransferService,
}

impl AppServices {
    pub fn new() -> AppResult<Self> {
        let http = HttpClient::new()?;
        let cancellations = CancellationRegistry::new();
        Ok(Self::with_deps(http, cancellations))
    }

    pub fn with_deps(http: HttpClient, cancellations: CancellationRegistry) -> Self {
        Self {
            probe: ProbeService::new(http.clone(), cancellations.clone()),
            chat: ChatService::new(http.clone(), cancellations),
            models: ModelsService::new(http),
            candy: CandyService::new(),
            download: DownloadService::new(),
            data_transfer: DataTransferService::new(),
        }
    }
}
