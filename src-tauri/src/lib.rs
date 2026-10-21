pub mod commands;
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
            send_chat_request,
            fetch_models_list,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 桌面应用时发生异常");
}
