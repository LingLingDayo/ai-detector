use std::time::{Duration, Instant};

use tauri::Emitter;

use crate::parser::{parse_non_streaming_json, parse_streaming_body, parse_streaming_progress};
use crate::types::{ProbeRequest, ProbeResponse};
use crate::utils::{compact_error, normalize_url};

pub const DEFAULT_USER_AGENT: &str =
    "Codex Desktop/0.147.0-alpha.1.2 (Windows 10.0.26200; x86_64) unknown (codex_exec; 0.147.0-alpha.1.2)";

fn is_adaptive_thinking_required(model: &str) -> bool {
    let m = model.to_lowercase();
    if m.contains("claude") {
        // 仅对 Anthropic 官方强制要求 adaptive thinking (即拒绝 budget_tokens 报 400) 的模型生效：
        // Claude 4.7, 4.8 以及 5.x+ 系列 (如 5, 5.1, 5.5 等)。
        // 注意：Claude 4.6 (如 claude-sonnet-4-6, claude-opus-4-6) 虽然支持 adaptive，但并不强制，使用 budget_tokens 仍可正常请求，严禁在此强制配置。
        if m.contains("-5") || m.contains(".5") || m.contains("-4-7") || m.contains("-4-8") || m.contains(".4.7") || m.contains(".4.8") {
            return true;
        }
    }
    false
}

/// MiMo V2.6 仅支持 thinking.type 开关与 max_completion_tokens，不支持 reasoning_effort
fn is_mimo_thinking_switch_model(model: &str) -> bool {
    let m = model.trim().to_lowercase();
    let base = m.rsplit('/').next().unwrap_or(&m);
    base.starts_with("mimo-v2.6-pro") || base.starts_with("mimo-v2.6-flash")
}

#[tauri::command]
pub async fn send_probe_request(
    app: tauri::AppHandle,
    req: ProbeRequest,
) -> Result<ProbeResponse, String> {
    let is_stream = req.stream.unwrap_or(true);
    let default_timeout = if is_stream { 90 } else { 240 };
    let timeout_sec = req.timeout_seconds.unwrap_or(default_timeout).max(5);

    let client = if is_stream {
        // 流式请求：不设置单一总超时限制（以避免长文本生成被中断），由首包超时与分片超时保护
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?
    } else {
        // 同步请求：客户端默认超时 240 秒
        reqwest::Client::builder()
            .timeout(Duration::from_secs(timeout_sec))
            .build()
            .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?
    };

    let target_url = normalize_url(&req.base_url, &req.api_format);
    let start_time = Instant::now();
    let max_attempts = 1;

    for attempt in 1..=max_attempts {
        let mut request_builder = client.post(&target_url);

        request_builder = request_builder
            .header(reqwest::header::USER_AGENT, DEFAULT_USER_AGENT)
            .header(reqwest::header::CONTENT_TYPE, "application/json");

        if is_stream {
            request_builder = request_builder.header(
                reqwest::header::ACCEPT,
                "text/event-stream, application/json",
            );
        } else {
            request_builder = request_builder.header(reqwest::header::ACCEPT, "application/json");
        }

        let body_value = if req.api_format == "anthropic" {
            request_builder = request_builder
                .header("x-api-key", req.api_key.trim())
                .header(
                    reqwest::header::AUTHORIZATION,
                    format!("Bearer {}", req.api_key.trim()),
                )
                .header("anthropic-version", "2023-06-01");

            let mut map = serde_json::json!({
                "model": req.model.trim(),
                "max_tokens": 65536,
                "messages": [
                    { "role": "user", "content": &req.prompt }
                ]
            });
            if is_stream {
                map["stream"] = serde_json::json!(true);
            }
            if let Some(effort) = &req.reasoning_effort {
                let trimmed = effort.trim();
                if trimmed != "none" && !trimmed.is_empty() {
                    if is_adaptive_thinking_required(&req.model) {
                        map["thinking"] = serde_json::json!({
                            "type": "adaptive"
                        });
                        map["output_config"] = serde_json::json!({
                            "effort": trimmed
                        });
                        map["max_tokens"] = serde_json::json!(65536);
                    } else {
                        let budget = match trimmed {
                            "minimal" => 1024,
                            "low" => 2048,
                            "medium" => 4096,
                            "high" => 8192,
                            "xhigh" => 16384,
                            "max" => 32768,
                            _ => 8192,
                        };
                        map["thinking"] = serde_json::json!({
                            "type": "enabled",
                            "budget_tokens": budget
                        });
                        map["max_tokens"] = serde_json::json!((budget + 2048).max(65536));
                    }
                }
            }
            map
        } else if req.api_format == "responses" || req.api_format == "openai_responses" {
            request_builder = request_builder.header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", req.api_key.trim()),
            );

            let mut map = serde_json::json!({
                "model": req.model.trim(),
                "input": [
                    {
                        "type": "message",
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": &req.prompt
                            }
                        ]
                    }
                ],
                "max_output_tokens": 65536
            });
            if is_stream {
                map["stream"] = serde_json::json!(true);
            }
            if let Some(effort) = &req.reasoning_effort {
                let trimmed = effort.trim();
                if trimmed != "none" && !trimmed.is_empty() {
                    map["reasoning"] = serde_json::json!({
                        "effort": trimmed
                    });
                }
            }
            map
        } else {
            request_builder = request_builder.header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", req.api_key.trim()),
            );

            let m = req.model.trim().to_lowercase();
            let is_o_series = m.starts_with("o1") || m.starts_with("o3") || m.starts_with("o4");
            let is_thinking_switch = is_mimo_thinking_switch_model(&req.model);

            let mut map = serde_json::json!({
                "model": req.model.trim(),
                "messages": [
                    { "role": "user", "content": &req.prompt }
                ]
            });
            if is_o_series || is_thinking_switch {
                map["max_completion_tokens"] = serde_json::json!(65536);
            } else {
                map["max_tokens"] = serde_json::json!(65536);
            }
            if is_stream {
                map["stream"] = serde_json::json!(true);
            }
            if let Some(effort) = &req.reasoning_effort {
                let trimmed = effort.trim();
                if is_thinking_switch {
                    map["thinking"] = serde_json::json!({
                        "type": if trimmed == "none" || trimmed.is_empty() { "disabled" } else { "enabled" }
                    });
                } else if trimmed != "none" && !trimmed.is_empty() {
                    if let Ok(num) = trimmed.parse::<u64>() {
                        map["max_completion_tokens"] = serde_json::json!(num);
                        map.as_object_mut().and_then(|o| o.remove("max_tokens"));
                    } else {
                        map["reasoning_effort"] = serde_json::json!(trimmed);
                    }
                }
            }
            map
        };

        request_builder = request_builder.json(&body_value);

        if is_stream {
            let first_response_timeout = Duration::from_secs(timeout_sec);
            let send_res = tokio::time::timeout(first_response_timeout, request_builder.send()).await;

            let mut resp = match send_res {
                Ok(Ok(r)) => r,
                Ok(Err(e)) => {
                    if attempt < max_attempts {
                        tokio::time::sleep(Duration::from_millis(1000 * attempt)).await;
                        continue;
                    }
                    return Err(format!("无法连接上游接口: {}", e));
                }
                Err(_) => {
                    return Err(format!(
                        "流式请求首次响应超时（{} 秒内未收到上游响应）",
                        timeout_sec
                    ));
                }
            };

            let status = resp.status();
            if !status.is_success() {
                let err_body = resp.text().await.unwrap_or_default();
                let err_msg = compact_error(&err_body, status);
                let status_code = status.as_u16();
                let retryable = status_code == 408
                    || status_code == 429
                    || (status_code >= 500 && status_code <= 504);

                if retryable && attempt < max_attempts {
                    tokio::time::sleep(Duration::from_millis(1000 * attempt)).await;
                    continue;
                }
                return Err(format!("接口请求异常 ({}): {}", status_code, err_msg));
            }

            // 确保首包在剩余的首次响应时限内到达
            let elapsed_since_start = start_time.elapsed();
            let first_chunk_timeout = if elapsed_since_start < first_response_timeout {
                first_response_timeout - elapsed_since_start
            } else {
                Duration::from_millis(100)
            };

            let first_chunk_res = tokio::time::timeout(first_chunk_timeout, resp.chunk()).await;
            let first_chunk = match first_chunk_res {
                Ok(Ok(Some(bytes))) => bytes,
                Ok(Ok(None)) => {
                    return Err("上游返回了空流响应".to_string());
                }
                Ok(Err(e)) => return Err(format!("读取上游流式首包数据失败: {}", e)),
                Err(_) => {
                    return Err(format!(
                        "流式请求首次响应超时（{} 秒内未收到模型首包响应）",
                        timeout_sec
                    ));
                }
            };

            let mut raw_bytes = Vec::new();
            raw_bytes.extend_from_slice(&first_chunk);

            // 首包数据到达，通知前端模型真正开始流式输出
            let _ = app.emit("pelican-stream-start", ());

            // 将已解析的累计文本节流推送给前端，便于展示实时输出进度
            let mut last_progress_at = Instant::now();
            let mut last_progress_len = 0usize;
            let mut emit_progress = |raw_bytes: &[u8]| {
                let body_text = String::from_utf8_lossy(raw_bytes);
                let preview = parse_streaming_progress(&body_text, &req.api_format);
                if preview.len() > last_progress_len {
                    last_progress_len = preview.len();
                    let _ = app.emit("pelican-stream-progress", preview);
                }
            };
            emit_progress(&raw_bytes);

            // 读取后续数据分片，每个分片之间设置 90 秒空闲超时防止连接死锁
            loop {
                let chunk_res = tokio::time::timeout(Duration::from_secs(90), resp.chunk()).await;
                match chunk_res {
                    Ok(Ok(Some(bytes))) => {
                        raw_bytes.extend_from_slice(&bytes);
                        if last_progress_at.elapsed() >= Duration::from_millis(100) {
                            emit_progress(&raw_bytes);
                            last_progress_at = Instant::now();
                        }
                    }
                    Ok(Ok(None)) => break,
                    Ok(Err(e)) => return Err(format!("读取上游流式响应数据中断: {}", e)),
                    Err(_) => {
                        return Err("上游流式响应传输中断（90 秒内未收到后续数据分片）".to_string())
                    }
                }
            }
            emit_progress(&raw_bytes);

            let duration_ms = start_time.elapsed().as_millis() as u64;
            let text_body = String::from_utf8_lossy(&raw_bytes);
            let content = parse_streaming_body(&text_body, &req.api_format)?;

            return Ok(ProbeResponse {
                text: content,
                raw_status: status.as_u16(),
                duration_ms,
            });
        } else {
            match request_builder.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let text = resp
                            .text()
                            .await
                            .map_err(|e| format!("读取上游响应失败: {}", e))?;

                        let duration_ms = start_time.elapsed().as_millis() as u64;
                        let parsed: serde_json::Value = serde_json::from_str(&text)
                            .map_err(|e| format!("上游未返回有效 JSON 数据: {}", e))?;

                        let content = parse_non_streaming_json(&parsed, &req.api_format)?;

                        return Ok(ProbeResponse {
                            text: content,
                            raw_status: status.as_u16(),
                            duration_ms,
                        });
                    } else {
                        let err_body = resp.text().await.unwrap_or_default();
                        let err_msg = compact_error(&err_body, status);

                        let status_code = status.as_u16();
                        let retryable = status_code == 408
                            || status_code == 429
                            || (status_code >= 500 && status_code <= 504);

                        if retryable && attempt < max_attempts {
                            tokio::time::sleep(Duration::from_millis(1000 * attempt)).await;
                            continue;
                        }
                        return Err(format!("接口请求异常 ({}): {}", status_code, err_msg));
                    }
                }
                Err(e) => {
                    if e.is_timeout() {
                        return Err(format!("同步请求超时（{} 秒内未收到上游响应）", timeout_sec));
                    }
                    if attempt < max_attempts {
                        tokio::time::sleep(Duration::from_millis(1000 * attempt)).await;
                        continue;
                    }
                    return Err(format!("无法连接上游接口: {}", e));
                }
            }
        }
    }

    Err("达到最大重试次数，仍未获得响应".to_string())
}
