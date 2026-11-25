use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::error::{AppError, AppResult};

pub const FRAME_INTERVAL_MS: u64 = 50;
pub const FRAME_TIMEOUT_MS: u64 = 2000;
pub const RENDER_READY_TIMEOUT_MS: u64 = 8000;
pub const RENDER_READY_POLL_MS: u64 = 25;
pub const GIF_CAPTURE_WIDTH: f64 = 640.0;
pub const GIF_CAPTURE_HEIGHT: f64 = 480.0;
pub const MAX_RENDER_HTML_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_CAPTURE_DURATION_MS: u64 = 12_000;
pub const MAX_CAPTURE_FRAMES: usize = 200;
pub const MAX_FRAME_DATA_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFrame {
    pub data: String,
    pub timestamp_ms: f64,
}

pub fn ensure_main_window(label: &str) -> AppResult<()> {
    if label == "main" {
        Ok(())
    } else {
        Err(AppError::InvalidInput(
            "GIF 采集仅允许由主窗口调用".to_string(),
        ))
    }
}

pub fn validate_render_html(html: &str) -> AppResult<()> {
    if html.trim().is_empty() || html.len() > MAX_RENDER_HTML_BYTES {
        return Err(AppError::InvalidInput(
            "待渲染图形内容为空或超出大小限制".to_string(),
        ));
    }
    Ok(())
}

pub fn sanitize_render_label(request_id: &str) -> String {
    request_id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(48)
        .collect()
}

pub fn capture_frame_interval_ms(duration_ms: u64) -> u64 {
    if duration_ms > 6000 {
        60
    } else {
        FRAME_INTERVAL_MS
    }
}

pub fn capture_frame_limit(duration_ms: u64) -> AppResult<usize> {
    if duration_ms == 0 || duration_ms > MAX_CAPTURE_DURATION_MS {
        return Err(AppError::InvalidInput(
            "GIF 采集时长必须大于 0 且不超过 12 秒".to_string(),
        ));
    }
    let interval_ms = capture_frame_interval_ms(duration_ms);
    Ok((((duration_ms + interval_ms - 1) / interval_ms) as usize).min(MAX_CAPTURE_FRAMES))
}

pub fn screenshot_parameters() -> String {
    // 仅截取当前可见视口合成层，不传 clip 以避免 Chromium 临时覆盖视口参数引发页面层闪烁。
    json!({
        "format": "png",
        "fromSurface": true,
        "captureBeyondViewport": false,
    })
    .to_string()
}

pub fn parse_capture_frame(response: &str) -> AppResult<String> {
    #[derive(Deserialize)]
    struct ScreenshotResponse {
        data: String,
    }
    if response.len() > MAX_FRAME_DATA_BYTES + 1024 {
        return Err(AppError::Platform("作品截图响应超出大小限制".to_string()));
    }
    let response: ScreenshotResponse = serde_json::from_str(response)
        .map_err(|error| AppError::Platform(format!("作品截图响应解析失败: {error}")))?;
    if response.data.is_empty() || response.data.len() > MAX_FRAME_DATA_BYTES {
        return Err(AppError::Platform("作品截图为空或超出大小限制".to_string()));
    }
    Ok(response.data)
}

pub fn is_render_ready_response(response: &str) -> bool {
    #[derive(Deserialize)]
    struct EvaluateValue {
        value: Option<bool>,
    }
    #[derive(Deserialize)]
    struct EvaluateResponse {
        result: Option<EvaluateValue>,
    }
    serde_json::from_str::<EvaluateResponse>(response)
        .ok()
        .and_then(|parsed| parsed.result)
        .and_then(|result| result.value)
        == Some(true)
}

pub fn next_capture_instant(
    started: Instant,
    now: Instant,
    recording_end: Instant,
    interval_ms: u64,
) -> Instant {
    let tick = now.saturating_duration_since(started).as_millis() as u64 / interval_ms + 1;
    (started + Duration::from_millis(tick * interval_ms)).min(recording_end)
}

pub fn completed_frame_count(frame_count: usize) -> AppResult<usize> {
    if frame_count == 0 || frame_count > MAX_CAPTURE_FRAMES {
        return Err(AppError::Platform("采集作品帧数量无效，请重试".to_string()));
    }
    Ok(frame_count)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_duration_supports_twelve_seconds_and_adaptive_frame_limit() {
        assert_eq!(capture_frame_limit(1).unwrap(), 1);
        assert_eq!(capture_frame_limit(50).unwrap(), 1);
        assert_eq!(capture_frame_limit(51).unwrap(), 2);
        assert_eq!(capture_frame_limit(6000).unwrap(), 120);
        assert_eq!(capture_frame_limit(8000).unwrap(), 134);
        assert_eq!(capture_frame_limit(12000).unwrap(), 200);
        assert!(capture_frame_limit(0).is_err());
        assert!(capture_frame_limit(12001).is_err());
        assert!(capture_frame_limit(u64::MAX).is_err());
    }

    #[test]
    fn test_screenshot_parameters_captures_surface_without_clip() {
        let parameters: serde_json::Value =
            serde_json::from_str(&screenshot_parameters()).unwrap();
        assert_eq!(parameters["format"], "png");
        assert_eq!(parameters["fromSurface"], true);
        assert_eq!(parameters["captureBeyondViewport"], false);
        assert!(parameters.get("clip").is_none());
    }

    #[test]
    fn test_capture_frame_is_camel_case_for_worker_channel() {
        let frame = serde_json::to_value(CaptureFrame {
            data: "png-base64".to_string(),
            timestamp_ms: 12.5,
        })
        .unwrap();
        assert_eq!(frame["timestampMs"], 12.5);
        assert!(frame.get("timestamp_ms").is_none());
    }

    #[test]
    fn test_parse_capture_frame_returns_clipped_png_data() {
        assert_eq!(
            parse_capture_frame(r#"{"data":"png-base64"}"#).unwrap(),
            "png-base64"
        );
    }

    #[test]
    fn test_parse_capture_frame_rejects_empty_and_missing_images() {
        for response in ["{}", r#"{"data":""}"#, "not-json"] {
            assert!(parse_capture_frame(response).is_err());
        }
    }

    #[test]
    fn test_capture_commands_only_allow_main_window() {
        assert!(ensure_main_window("main").is_ok());
        assert!(ensure_main_window("preview").is_err());
        assert!(ensure_main_window("").is_err());
    }

    #[test]
    fn test_next_capture_instant_skips_missed_ticks_without_exceeding_duration() {
        let started = Instant::now();
        let end = started + Duration::from_secs(5);
        assert_eq!(
            next_capture_instant(started, started + Duration::from_millis(121), end, 50),
            started + Duration::from_millis(150)
        );
        assert_eq!(
            next_capture_instant(started, started + Duration::from_millis(121), end, 60),
            started + Duration::from_millis(180)
        );
        assert_eq!(
            next_capture_instant(started, started + Duration::from_millis(6990), end, 50),
            end
        );
    }

    #[test]
    fn test_completed_capture_reports_actual_sent_frame_count() {
        assert_eq!(completed_frame_count(1).unwrap(), 1);
        assert_eq!(completed_frame_count(37).unwrap(), 37);
        assert_eq!(completed_frame_count(200).unwrap(), 200);
    }

    #[test]
    fn test_completed_capture_rejects_empty_or_excess_frames() {
        assert!(completed_frame_count(0).is_err());
        assert!(completed_frame_count(201).is_err());
    }

    #[test]
    fn test_render_html_validation_and_ready_response_parsing() {
        assert!(validate_render_html("").is_err());
        assert!(validate_render_html("   ").is_err());
        assert!(validate_render_html("<!DOCTYPE html><html></html>").is_ok());
        assert!(validate_render_html(&"a".repeat(MAX_RENDER_HTML_BYTES + 1)).is_err());
        assert_eq!(sanitize_render_label("abc-123_XYZ!@#"), "abc-123_XYZ");
        assert!(is_render_ready_response(
            r#"{"result":{"type":"boolean","value":true}}"#
        ));
        assert!(!is_render_ready_response(
            r#"{"result":{"type":"boolean","value":false}}"#
        ));
        assert!(!is_render_ready_response("invalid"));
    }
}
