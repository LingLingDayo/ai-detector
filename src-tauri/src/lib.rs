pub mod error;
pub mod infra;
pub mod platform;
pub mod provider;
pub mod services;
pub mod transport;

use platform::pelican_capture::CaptureRegistry;
use services::AppServices;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let services = AppServices::new().expect("初始化后端核心服务失败");
    let capture_registry = CaptureRegistry::default();
    transport::tauri::run(services, capture_registry);
}
