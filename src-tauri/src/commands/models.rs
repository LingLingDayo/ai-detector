use std::time::Duration;

use crate::parser::extract_models_from_json;
use crate::utils::compact_error;

pub const MODEL_FETCH_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[tauri::command]
pub async fn fetch_models_list(
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
