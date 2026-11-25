pub mod candy;
pub mod chat;
pub mod events;
pub mod models;
pub mod pelican;
pub mod probe;
pub mod system;
pub mod save;

use tauri::Emitter;

use crate::platform::pelican_capture::CaptureRegistry;
use crate::services::AppServices;

pub fn run(services: AppServices, capture_registry: CaptureRegistry) {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(services)
        .manage(capture_registry)
        .setup(|app| {
            let handle = app.handle().clone();
            crate::infra::logging::init_with_sink(move |entry| {
                let _ = handle.emit(events::DIAGNOSTICS_LOG, entry);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            probe::send_probe_request,
            probe::cancel_probe_request,
            chat::send_chat_request,
            chat::cancel_chat_request,
            models::fetch_models_list,
            system::open_external_url,
            system::open_devtools,
            candy::generate_candy_challenges,
            candy::generate_single_candy_challenge,
            candy::evaluate_candy_answer,
            pelican::capture_pelican_frames,
            pelican::cancel_pelican_capture,
            pelican::save_pelican_download,
            pelican::pick_download_directory,
            save::save_pelican_file
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 桌面应用时发生异常");
}
