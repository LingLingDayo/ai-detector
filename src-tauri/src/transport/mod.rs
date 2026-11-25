/// 对外传输适配层；后续新增本地 HTTP/SSE 等独立 API 时，可在此同级新增 `http` 模块并复用 `AppServices`。
pub mod tauri;
