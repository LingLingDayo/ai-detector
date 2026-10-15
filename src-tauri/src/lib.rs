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
    pub stream: Option<bool>,
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

const MODEL_FETCH_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

fn extract_models_from_json(json_val: &serde_json::Value) -> Vec<String> {
    let mut models = Vec::new();

    fn extract_item(item: &serde_json::Value, list: &mut Vec<String>) {
        if let Some(s) = item.as_str() {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                list.push(trimmed.to_string());
            }
            return;
        }
        if let Some(obj) = item.as_object() {
            for key in &["id", "model", "name", "model_name", "value"] {
                if let Some(val) = obj.get(*key).and_then(|v| v.as_str()) {
                    let trimmed = val.trim();
                    if !trimmed.is_empty() {
                        list.push(trimmed.to_string());
                        return;
                    }
                }
            }
        }
    }

    if let Some(arr) = json_val.as_array() {
        for item in arr {
            extract_item(item, &mut models);
        }
    } else if let Some(obj) = json_val.as_object() {
        let mut found = false;
        for key in &["data", "models", "model_list", "items", "result", "list"] {
            if let Some(arr) = obj.get(*key).and_then(|v| v.as_array()) {
                for item in arr {
                    extract_item(item, &mut models);
                }
                found = true;
                break;
            }
        }

        if !found {
            for parent in &["data", "result"] {
                if let Some(parent_obj) = obj.get(*parent).and_then(|v| v.as_object()) {
                    for child in &["data", "models", "items", "list"] {
                        if let Some(arr) = parent_obj.get(*child).and_then(|v| v.as_array()) {
                            for item in arr {
                                extract_item(item, &mut models);
                            }
                            found = true;
                            break;
                        }
                    }
                    if found {
                        break;
                    }
                }
            }
        }

        if !found {
            for key in &["models", "data"] {
                if let Some(sub_obj) = obj.get(*key).and_then(|v| v.as_object()) {
                    for k in sub_obj.keys() {
                        let trimmed = k.trim();
                        if !trimmed.is_empty() {
                            models.push(trimmed.to_string());
                        }
                    }
                    if !models.is_empty() {
                        break;
                    }
                }
            }
        }
    }

    models.sort();
    models.dedup();
    models
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

    let fallback_url = if target_url.ends_with("/v1/models") {
        Some(target_url.replace("/v1/models", "/models"))
    } else if target_url.ends_with("/models") && !target_url.ends_with("/v1/models") {
        Some(format!("{}/v1/models", target_url.trim_end_matches("/models")))
    } else {
        None
    };

    let send_request = |url: &str| {
        let mut builder = client
            .get(url)
            .header(reqwest::header::USER_AGENT, MODEL_FETCH_USER_AGENT)
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
        builder.send()
    };

    let mut resp = send_request(&target_url)
        .await
        .map_err(|e| format!("无法连接模型列表接口: {}", e))?;

    let mut status = resp.status();
    if (status == reqwest::StatusCode::NOT_FOUND || status == reqwest::StatusCode::METHOD_NOT_ALLOWED)
        && fallback_url.is_some()
    {
        if let Some(ref fb_url) = fallback_url {
            if let Ok(fb_resp) = send_request(fb_url).await {
                if fb_resp.status().is_success() {
                    resp = fb_resp;
                    status = resp.status();
                }
            }
        }
    }

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

    let models = extract_models_from_json(&json_val);
    Ok(models)
}

fn parse_non_streaming_json(parsed: &serde_json::Value, api_format: &str) -> Result<String, String> {
    if api_format == "anthropic" {
        if let Some(stop_reason) = parsed.get("stop_reason").and_then(|s| s.as_str()) {
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
        Ok(full)
    } else if api_format == "responses" || api_format == "openai_responses" {
        if let Some(output_text) = parsed.get("output_text").and_then(|o| o.as_str()) {
            Ok(output_text.trim().to_string())
        } else if let Some(outputs) = parsed.get("output").and_then(|o| o.as_array()) {
            let mut full = String::new();
            for item in outputs {
                let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if item_type == "reasoning"
                    || item_type == "compaction_summary"
                    || item_type == "function_call"
                {
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
                Ok(parsed
                    .get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c0| c0.get("message"))
                    .and_then(|m| m.get("content"))
                    .and_then(|s| s.as_str())
                    .unwrap_or("")
                    .to_string())
            } else {
                Ok(full)
            }
        } else if let Some(content_val) = parsed.get("content") {
            if let Some(s) = content_val.as_str() {
                Ok(s.to_string())
            } else if let Some(arr) = content_val.as_array() {
                let mut full = String::new();
                for part in arr {
                    if let Some(s) = part.as_str() {
                        full.push_str(s);
                    } else if let Some(t) = part.get("text").and_then(|s| s.as_str()) {
                        full.push_str(t);
                    }
                }
                Ok(full)
            } else {
                Ok(content_val.to_string())
            }
        } else if let Some(choice_content) = parsed
            .get("choices")
            .and_then(|c| c.get(0))
            .and_then(|c0| c0.get("message"))
            .and_then(|m| m.get("content"))
            .and_then(|s| s.as_str())
        {
            Ok(choice_content.to_string())
        } else {
            Err("无法从上游 responses 响应中解析出文本内容".to_string())
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
            Ok(s.to_string())
        } else if let Some(arr) = content_val.as_array() {
            let mut combined = String::new();
            for item in arr {
                if let Some(t) = item.get("text").and_then(|s| s.as_str()) {
                    combined.push_str(t);
                }
            }
            Ok(combined)
        } else {
            Ok(content_val.to_string())
        }
    }
}

fn parse_streaming_body(body: &str, api_format: &str) -> Result<String, String> {
    let mut content_accum = String::new();
    let mut finish_reason: Option<String> = None;
    let mut found_sse_data = false;

    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(':') {
            continue;
        }

        if let Some(data_str) = trimmed.strip_prefix("data:") {
            let data_str = data_str.trim();
            if data_str == "[DONE]" {
                continue;
            }
            found_sse_data = true;

            if let Ok(val) = serde_json::from_str::<serde_json::Value>(data_str) {
                if let Some(err) = val.get("error") {
                    let msg = err
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("上游返回错误");
                    return Err(msg.to_string());
                }

                if api_format == "anthropic" {
                    let event_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if event_type == "content_block_delta" {
                        if let Some(delta) = val.get("delta") {
                            let delta_type =
                                delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            if delta_type == "text_delta" {
                                if let Some(text) = delta.get("text").and_then(|s| s.as_str()) {
                                    content_accum.push_str(text);
                                }
                            }
                        }
                    } else if event_type == "message_delta" {
                        if let Some(stop_reason) = val
                            .get("delta")
                            .and_then(|d| d.get("stop_reason"))
                            .and_then(|s| s.as_str())
                        {
                            if stop_reason == "refusal" {
                                return Err("模型拒绝生成数值，本次回答无效".to_string());
                            }
                            if stop_reason == "max_tokens" {
                                return Err("回答因达到 max_tokens 上限被截断，本次回答无效".to_string());
                            }
                        }
                    }
                } else if api_format == "responses" || api_format == "openai_responses" {
                    let val_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if val_type == "response.output_text.delta" {
                        if let Some(delta) = val.get("delta").and_then(|d| d.as_str()) {
                            content_accum.push_str(delta);
                        } else if let Some(delta_obj) = val.get("delta") {
                            if let Some(t) = delta_obj.get("text").and_then(|s| s.as_str()) {
                                content_accum.push_str(t);
                            }
                        }
                    } else if let Some(delta_str) = val.get("delta").and_then(|d| d.as_str()) {
                        content_accum.push_str(delta_str);
                    } else if let Some(output_text) = val.get("output_text").and_then(|o| o.as_str()) {
                        content_accum.push_str(output_text);
                    } else if let Some(text) = val.get("text").and_then(|t| t.as_str()) {
                        content_accum.push_str(text);
                    } else if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.get(0) {
                            if let Some(r) = choice.get("finish_reason").and_then(|s| s.as_str()) {
                                finish_reason = Some(r.to_string());
                            }
                            if let Some(delta) = choice.get("delta") {
                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                    content_accum.push_str(content);
                                }
                            }
                        }
                    }
                } else {
                    // chat_completions
                    if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.get(0) {
                            if let Some(r) = choice.get("finish_reason").and_then(|s| s.as_str()) {
                                finish_reason = Some(r.to_string());
                            }
                            if let Some(delta) = choice.get("delta") {
                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                    content_accum.push_str(content);
                                } else if let Some(parts) = delta.get("content").and_then(|c| c.as_array()) {
                                    for part in parts {
                                        if let Some(t) = part.get("text").and_then(|s| s.as_str()) {
                                            content_accum.push_str(t);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(reason) = finish_reason {
        if reason == "length" {
            return Err("回答被长度截断（finish_reason: length），本次回答无效".to_string());
        }
        if reason == "content_filter" {
            return Err("回答触发内容安全拦截（content_filter），本次回答无效".to_string());
        }
    }

    if !found_sse_data || content_accum.is_empty() {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) {
            return parse_non_streaming_json(&parsed, api_format);
        }
    }

    if content_accum.is_empty() {
        return Err("流式响应未包含有效文本内容".to_string());
    }

    Ok(content_accum)
}

#[tauri::command]
async fn send_probe_request(req: ProbeRequest) -> Result<ProbeResponse, String> {
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
                "max_tokens": 4096,
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

            let mut map = serde_json::json!({
                "model": req.model.trim(),
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

            // 读取后续数据分片，每个分片之间设置 90 秒空闲超时防止连接死锁
            loop {
                let chunk_res = tokio::time::timeout(Duration::from_secs(90), resp.chunk()).await;
                match chunk_res {
                    Ok(Ok(Some(bytes))) => {
                        raw_bytes.extend_from_slice(&bytes);
                    }
                    Ok(Ok(None)) => break,
                    Ok(Err(e)) => return Err(format!("读取上游流式响应数据中断: {}", e)),
                    Err(_) => {
                        return Err("上游流式响应传输中断（90 秒内未收到后续数据分片）".to_string())
                    }
                }
            }

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

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("仅支持打开 http 或 https 协议链接".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .spawn()
            .map_err(|e| format!("打开系统浏览器失败: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("打开系统浏览器失败: {}", e))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|e| format!("打开系统浏览器失败: {}", e))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            send_probe_request,
            fetch_models_list,
            open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("运行 Tauri 桌面应用时发生异常");
}
