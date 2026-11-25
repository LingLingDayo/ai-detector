use crate::error::{AppError, AppResult};

use super::types::{ParseMode, StreamParseState};
use super::LlmProtocol;

/// 按 `\n` 增量切分 SSE 字节流，避免多字节 UTF-8 跨网络分片截断与全量重扫。
#[derive(Default)]
pub struct SseLineDecoder {
    pending: Vec<u8>,
}

impl SseLineDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_bytes(&mut self, chunk: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(chunk);
        let mut events = Vec::new();
        let mut start = 0usize;

        while let Some(rel_pos) = self.pending[start..].iter().position(|&b| b == b'\n') {
            let line_end = start + rel_pos;
            let mut line_bytes = &self.pending[start..line_end];
            if line_bytes.ends_with(b"\r") {
                line_bytes = &line_bytes[..line_bytes.len() - 1];
            }
            if let Some(data) = extract_sse_data_line(line_bytes) {
                events.push(data);
            }
            start = line_end + 1;
        }

        if start > 0 {
            self.pending.drain(..start);
        }
        events
    }

    pub fn finish(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            return None;
        }
        let mut line_bytes = std::mem::take(&mut self.pending);
        if line_bytes.ends_with(b"\r") {
            line_bytes.pop();
        }
        extract_sse_data_line(&line_bytes)
    }
}

fn extract_sse_data_line(line_bytes: &[u8]) -> Option<String> {
    let line = String::from_utf8_lossy(line_bytes);
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with(':') {
        return None;
    }
    let data = trimmed.strip_prefix("data:")?.trim();
    if data.is_empty() {
        return None;
    }
    Some(data.to_string())
}

pub fn feed_sse_data_line(
    data: &str,
    protocol: &dyn LlmProtocol,
    mode: ParseMode,
    state: &mut StreamParseState,
) -> AppResult<()> {
    if data == "[DONE]" {
        state.saw_sse_data = true;
        return Ok(());
    }
    state.saw_sse_data = true;
    let Ok(value) = serde_json::from_str::<serde_json::Value>(data) else {
        return Ok(());
    };
    protocol.apply_stream_event(&value, state, mode)
}

pub fn scan_sse_str(
    body: &str,
    protocol: &dyn LlmProtocol,
    mode: ParseMode,
) -> StreamParseState {
    let mut decoder = SseLineDecoder::new();
    let mut state = StreamParseState::default();
    for data in decoder.push_bytes(body.as_bytes()) {
        let _ = feed_sse_data_line(&data, protocol, ParseMode::LenientChat, &mut state);
    }
    if let Some(data) = decoder.finish() {
        let _ = feed_sse_data_line(&data, protocol, ParseMode::LenientChat, &mut state);
    }
    let _ = mode;
    state
}

pub fn parse_sse_str(
    body: &str,
    protocol: &dyn LlmProtocol,
    mode: ParseMode,
) -> AppResult<StreamParseState> {
    let mut decoder = SseLineDecoder::new();
    let mut state = StreamParseState::default();

    for data in decoder.push_bytes(body.as_bytes()) {
        feed_sse_data_line(&data, protocol, mode, &mut state)?;
    }
    if let Some(data) = decoder.finish() {
        feed_sse_data_line(&data, protocol, mode, &mut state)?;
    }

    if let Some(message) = &state.error_message {
        return Err(AppError::UpstreamProtocol(message.clone()));
    }

    protocol.validate_stream_finish(&state, mode)?;

    if !state.saw_sse_data || state.text.is_empty() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
            let fallback = protocol.parse_non_streaming(&parsed, mode)?;
            if !fallback.text.is_empty() {
                return Ok(fallback);
            }
        }
    }

    if state.text.is_empty() {
        return Err(AppError::UpstreamProtocol(
            "流式响应未包含有效文本内容".to_string(),
        ));
    }

    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::provider::openai_chat::OpenAiChatProtocol;

    #[test]
    fn test_sse_decoder_handles_split_utf8_chunks_and_crlf() {
        let mut decoder = SseLineDecoder::new();
        let line = "data: {\"choices\":[{\"delta\":{\"content\":\"你好世界\"}}]}\r\n\r\n";
        let bytes = line.as_bytes();
        let mid = bytes.len() / 2;

        let part1 = decoder.push_bytes(&bytes[..mid]);
        assert!(part1.is_empty());

        let part2 = decoder.push_bytes(&bytes[mid..]);
        assert_eq!(part2.len(), 1);
        assert!(part2[0].contains("你好世界"));
        assert!(decoder.finish().is_none());
    }

    #[test]
    fn test_parse_streaming_progress_ignores_partial_lines() {
        let sse = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"<svg\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\">\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"cont"
        );
        let state = scan_sse_str(sse, &OpenAiChatProtocol, ParseMode::StrictProbe);
        assert_eq!(state.text, "<svg>");
    }
}
