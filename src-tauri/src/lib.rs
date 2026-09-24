use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

const DEFAULT_USER_AGENT: &str =
    "Codex Desktop/0.147.0-alpha.1.2 (Windows 10.0.26200; x86_64) unknown (codex_exec; 0.147.0-alpha.1.2)";

#[derive(Debug, Deserialize)]
pub struct ProbeRequest {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub prompt: String,
    #[serde(default = "default_api_format")]
    pub api_format: String,
    pub reasoning_effort: Option<String>,
    pub timeout_seconds: Option<u64>,
}

fn default_api_format() -> String {
    "chat_completions".to_string()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProbeResponse {
    pub text: String,
    pub raw_status: u16,
    pub duration_ms: u64,
}

fn normalize_url(base_url: &str, api_format: &str) -> String {
    let raw = base_url.trim().trim_end_matches('/');
    let trimmed = if raw.is_empty() {
        if api_format == "anthropic" {
            "https://api.anthropic.com"
        } else {
            "https://api.openai.com"
        }
    } else {
        raw
    };

    if api_format == "anthropic" {
        if trimmed.ends_with("/messages") {
            trimmed.to_string()
        } else if trimmed.ends_with("/v1") {
            format!("{}/messages", trimmed)
        } else {
            format!("{}/v1/messages", trimmed)
        }
    } else if api_format == "responses" || api_format == "openai_responses" {
        if trimmed.ends_with("/responses") {
            trimmed.to_string()
        } else if trimmed.ends_with("/v1") {
            format!("{}/responses", trimmed)
        } else {
            format!("{}/v1/responses", trimmed)
        }
    } else {
        if trimmed.ends_with("/chat/completions") {
            trimmed.to_string()
        } else if trimmed.ends_with("/v1") {
            format!("{}/chat/completions", trimmed)
        } else {
            format!("{}/v1/chat/completions", trimmed)
        }
    }
}

fn is_waf_block(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("cloudflare")
        || lower.contains("just a moment")
        || lower.contains("cf-ray")
        || lower.contains("access denied")
        || lower.contains("attention required")
}

fn compact_error(body: &str, status: reqwest::StatusCode) -> String {
    let trimmed = body.trim();
    if is_waf_block(trimmed) {
        return "请求被网关拦截（疑似 Cloudflare/WAF 阻断）。请检查 Base URL 是否正确。".to_string();
    }
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let Some(err_obj) = val.get("error") {
            if let Some(msg) = err_obj.get("message").and_then(|m| m.as_str()) {
                return msg.to_string();
            }
            return err_obj.to_string();
        }
        if let Some(msg) = val.get("message").and_then(|m| m.as_str()) {
            return msg.to_string();
        }
    }
    if trimmed.starts_with('<') {
        return format!("HTTP 状态码 {}，返回了 HTML 页面", status.as_u16());
    }
    if trimmed.is_empty() {
        format!("HTTP 状态码 {}", status.as_u16())
    } else {
        trimmed.chars().take(300).collect()
    }
}

#[tauri::command]
async fn fetch_models_list(
    base_url: String,
    api_key: String,
    api_format: String,
) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    let raw = base_url.trim().trim_end_matches('/');
    let trimmed = if raw.is_empty() {
        if api_format == "anthropic" {
            "https://api.anthropic.com"
        } else {
            "https://api.openai.com"
        }
    } else {
        raw
    };

    let target_url = if trimmed.ends_with("/chat/completions") {
        format!("{}/models", trimmed.trim_end_matches("/chat/completions"))
    } else if trimmed.ends_with("/responses") {
        format!("{}/models", trimmed.trim_end_matches("/responses"))
    } else if trimmed.ends_with("/messages") {
        format!("{}/models", trimmed.trim_end_matches("/messages"))
    } else if trimmed.ends_with("/v1") {
        format!("{}/models", trimmed)
    } else {
        format!("{}/v1/models", trimmed)
    };

    let mut builder = client
        .get(&target_url)
        .header(reqwest::header::USER_AGENT, DEFAULT_USER_AGENT)
        .header(reqwest::header::ACCEPT, "application/json");

    if api_format == "anthropic" {
        builder = builder
            .header("x-api-key", api_key.trim())
            .header(
                reqwest::header::AUTHORIZATION,
                format!("Bearer {}", api_key.trim()),
            )
            .header("anthropic-version", "2023-06-01");
    } else {
        builder = builder.header(
            reqwest::header::AUTHORIZATION,
            format!("Bearer {}", api_key.trim()),
        );
    }

    let resp = builder
        .send()
        .await
        .map_err(|e| format!("无法连接模型列表接口: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let err_body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "获取模型列表失败 ({}): {}",
            status.as_u16(),
            compact_error(&err_body, status)
        ));
    }

    let json_val: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析模型列表 JSON 失败: {}", e))?;

    let mut models = Vec::new();
    if let Some(arr) = json_val.get("data").and_then(|d| d.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|i| i.as_str()) {
                models.push(id.to_string());
            }
        }
    }

    models.sort();
    models.dedup();
    Ok(models)
}

#[tauri::command]
async fn send_probe_request(req: ProbeRequest) -> Result<ProbeResponse, String> {
    let timeout_sec = req.timeout_seconds.unwrap_or(150).max(10);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_sec))
        .build()
        .map_err(|e| format!("构建 HTTP 客户端失败: {}", e))?;

    let target_url = normalize_url(&req.base_url, &req.api_format);
    let start_time = Instant::now();
    let max_attempts = 1;

    for attempt in 1..=max_attempts {
        let mut request_builder = client.post(&target_url);

        request_builder = request_builder
            .header(reqwest::header::USER_AGENT, DEFAULT_USER_AGENT)
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .header(reqwest::header::ACCEPT, "application/json");

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
                "max_tokens": 4096,
                "messages": [
                    { "role": "user", "content": &req.prompt }
                ]
            });
            if let Some(effort) = &req.reasoning_effort {
                let trimmed = effort.trim();
                if trimmed != "none" && !trimmed.is_empty() {
                    let budget = if let Ok(num) = trimmed.parse::<u64>() {
                        num.max(1024)
                    } else {
                        match trimmed {
                            "minimal" => 1024,
                            "low" => 2048,
                            "medium" => 4096,
                            "high" => 8192,
                            "xhigh" => 16384,
                            "max" => 32768,
                            "ultra" => 65536,
                            _ => 8192,
                        }
                    };
                    map["thinking"] = serde_json::json!({
                        "type": "enabled",
                        "budget_tokens": budget
                    });
                    map["output_config"] = serde_json::json!({
                        "effort": trimmed
                    });
                    map["max_tokens"] = serde_json::json!(budget + 2048);
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
                ]
            });
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

            let mut map = serde_json::json!({
                "model": req.model.trim(),
                "messages": [
                    { "role": "user", "content": &req.prompt }
                ]
            });
            if let Some(effort) = &req.reasoning_effort {
                let trimmed = effort.trim();
                if trimmed != "none" && !trimmed.is_empty() {
                    if let Ok(num) = trimmed.parse::<u64>() {
                        map["max_completion_tokens"] = serde_json::json!(num);
                    } else {
                        map["reasoning_effort"] = serde_json::json!(trimmed);
                    }
                }
            }
            map
        };

        request_builder = request_builder.json(&body_value);

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

                    let content = if req.api_format == "anthropic" {
                        if let Some(stop_reason) =
                            parsed.get("stop_reason").and_then(|s| s.as_str())
                        {
                            if stop_reason == "refusal" {
                                return Err("模型拒绝生成数值，本次回答无效".to_string());
                            }
                            if stop_reason == "max_tokens" {
                                return Err("回答因达到 max_tokens 上限被截断，本次回答无效".to_string());
                            }
                        }
                        let mut full = String::new();
                        if let Some(blocks) = parsed.get("content").and_then(|c| c.as_array()) {
                            for block in blocks {
                                if block.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    if let Some(t) = block.get("text").and_then(|s| s.as_str()) {
                                        full.push_str(t);
                                    }
                                }
                            }
                        }
                        full
                    } else if req.api_format == "responses" || req.api_format == "openai_responses" {
                        if let Some(output_text) = parsed.get("output_text").and_then(|o| o.as_str()) {
                            output_text.trim().to_string()
                        } else if let Some(outputs) = parsed.get("output").and_then(|o| o.as_array()) {
                            let mut full = String::new();
                            for item in outputs {
                                let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                if item_type == "reasoning" || item_type == "compaction_summary" || item_type == "function_call" {
                                    continue;
                                }
                                if let Some(t) = item.get("text").and_then(|s| s.as_str()) {
                                    full.push_str(t);
                                } else if let Some(parts) = item.get("content").and_then(|c| c.as_array()) {
                                    for part in parts {
                                        let part_type = part.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                        if part_type == "input_text" || part_type == "thinking" {
                                            continue;
                                        }
                                        if let Some(t) = part.get("text").and_then(|s| s.as_str()) {
                                            full.push_str(t);
                                        }
                                    }
                                }
                            }
                            if full.is_empty() {
                                parsed.get("choices")
                                    .and_then(|c| c.get(0))
                                    .and_then(|c0| c0.get("message"))
                                    .and_then(|m| m.get("content"))
                                    .and_then(|s| s.as_str())
                                    .unwrap_or("")
                                    .to_string()
                            } else {
                                full
                            }
                        } else if let Some(content_val) = parsed.get("content") {
                            if let Some(s) = content_val.as_str() {
                                s.to_string()
                            } else if let Some(arr) = content_val.as_array() {
                                let mut full = String::new();
                                for part in arr {
                                    if let Some(s) = part.as_str() {
                                        full.push_str(s);
                                    } else if let Some(t) = part.get("text").and_then(|s| s.as_str()) {
                                        full.push_str(t);
                                    }
                                }
                                full
                            } else {
                                content_val.to_string()
                            }
                        } else if let Some(choice_content) = parsed.get("choices")
                            .and_then(|c| c.get(0))
                            .and_then(|c0| c0.get("message"))
                            .and_then(|m| m.get("content"))
                            .and_then(|s| s.as_str()) {
                            choice_content.to_string()
                        } else {
                            return Err("无法从上游 responses 响应中解析出文本内容".to_string());
                        }
                    } else {
                        let choice = parsed
                            .get("choices")
                            .and_then(|c| c.get(0))
                            .ok_or_else(|| "响应中缺少 choices 数据".to_string())?;

                        if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str()) {
                            if reason == "length" {
                                return Err("回答被长度截断（finish_reason: length），本次回答无效".to_string());
                            }
                            if reason == "content_filter" {
                                return Err("回答触发内容安全拦截（content_filter），本次回答无效".to_string());
                            }
                        }

                        let message = choice
                            .get("message")
                            .ok_or_else(|| "响应中缺少 message 数据".to_string())?;

                        let content_val = message
                            .get("content")
                            .ok_or_else(|| "响应中缺少 content 内容".to_string())?;

                        if let Some(s) = content_val.as_str() {
                            s.to_string()
                        } else if let Some(arr) = content_val.as_array() {
                            let mut combined = String::new();
                            for item in arr {
                                if let Some(t) = item.get("text").and_then(|s| s.as_str()) {
                                    combined.push_str(t);
                                }
                            }
                            combined
                        } else {
                            content_val.to_string()
                        }
                    };

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
                if attempt < max_attempts {
                    tokio::time::sleep(Duration::from_millis(1000 * attempt)).await;
                    continue;
                }
                return Err(format!("无法连接上游接口: {}", e));
            }
        }
    }

    Err("达到最大重试次数，仍未获得响应".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![send_probe_request, fetch_models_list])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 桌面应用时发生异常");
}
