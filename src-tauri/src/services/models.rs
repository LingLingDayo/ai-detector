use std::time::Duration;

use crate::error::{AppError, AppResult};
use crate::infra::http::{
    compact_error, resolve_user_agent_with_fallback, HttpClient, MODEL_FETCH_USER_AGENT,
};
use crate::provider::models_parser::extract_models_from_json;
use crate::provider::protocol_for;
use crate::provider::types::ApiFormat;
use crate::provider::url::resolve_models_urls;

#[derive(Debug, Clone)]
pub struct ModelsListRequest {
    pub base_url: String,
    pub api_key: String,
    pub api_format: String,
    pub user_agent: Option<String>,
}

#[derive(Clone)]
pub struct ModelsService {
    http: HttpClient,
}

impl ModelsService {
    pub fn new(http: HttpClient) -> Self {
        Self { http }
    }

    pub async fn fetch_list(&self, req: ModelsListRequest) -> AppResult<Vec<String>> {
        let format = ApiFormat::from_raw(&req.api_format);
        let protocol = protocol_for(format);
        let (target_url, fallback_url) = resolve_models_urls(&req.base_url, format);
        let resolved_user_agent =
            resolve_user_agent_with_fallback(req.user_agent.as_deref(), MODEL_FETCH_USER_AGENT);

        let send_request = |url: &str| {
            let builder = self
                .http
                .get(url)
                .timeout(Duration::from_secs(20))
                .header(reqwest::header::USER_AGENT, resolved_user_agent)
                .header(reqwest::header::ACCEPT, "application/json");
            protocol.apply_auth_headers(builder, &req.api_key).send()
        };

        let mut resp = send_request(&target_url).await.map_err(|e| {
            log::error!(
                "获取模型列表: 无法连接接口, api_format={}, error={}",
                req.api_format,
                e
            );
            AppError::UpstreamNetwork(format!("无法连接模型列表接口: {e}"))
        })?;

        let mut status = resp.status();
        if (status == reqwest::StatusCode::NOT_FOUND
            || status == reqwest::StatusCode::METHOD_NOT_ALLOWED)
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
            log::warn!(
                "获取模型列表失败: status={}, api_format={}",
                status.as_u16(),
                req.api_format
            );
            return Err(AppError::UpstreamHttp {
                prefix: "获取模型列表失败",
                status: status.as_u16(),
                message: compact_error(&err_body, status),
            });
        }

        let json_val: serde_json::Value = resp.json().await.map_err(|e| {
            log::error!(
                "获取模型列表: 解析 JSON 失败, api_format={}, error={}",
                req.api_format,
                e
            );
            AppError::UpstreamProtocol(format!("解析模型列表 JSON 失败: {e}"))
        })?;

        Ok(extract_models_from_json(&json_val))
    }
}
