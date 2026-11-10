pub mod commands;
mod cancellation;
pub mod parser;
pub mod types;
pub mod utils;

pub use commands::*;
pub use types::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            send_probe_request,
            cancel_probe_request,
            send_chat_request,
            cancel_chat_request,
            fetch_models_list,
            open_external_url,
            generate_candy_challenges,
            generate_single_candy_challenge,
            evaluate_candy_answer,
            record_pelican_frames,
            stop_pelican_recording,
            save_pelican_file
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 桌面应用时发生异常");
}
