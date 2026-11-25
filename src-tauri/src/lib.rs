pub mod commands;
pub mod diagnostics;
pub mod error;
pub mod infra;
pub mod parser;
pub mod platform;
pub mod provider;
pub mod services;
pub mod types;
pub mod utils;

pub use commands::*;
pub use types::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            diagnostics::init(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            send_probe_request,
            cancel_probe_request,
            send_chat_request,
            cancel_chat_request,
            fetch_models_list,
            open_external_url,
            open_devtools,
            generate_candy_challenges,
            generate_single_candy_challenge,
            evaluate_candy_answer,
            capture_pelican_frames,
            cancel_pelican_capture,
            save_pelican_download,
            pick_download_directory
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 桌面应用时发生异常");
}
