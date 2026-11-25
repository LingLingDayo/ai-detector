use std::fmt;

use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

/// 供未来 HTTP/SSE 对外 API 复用的结构化错误载体
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: &'static str,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppError {
    InvalidInput(String),
    Conflict(String),
    Canceled(String),
    Timeout(String),
    UpstreamHttp {
        prefix: &'static str,
        status: u16,
        message: String,
    },
    UpstreamNetwork(String),
    UpstreamProtocol(String),
    Io(String),
    Platform(String),
    Unsupported(String),
    Internal(String),
}

impl AppError {
    pub fn error_code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "INVALID_INPUT",
            Self::Conflict(_) => "CONFLICT",
            Self::Canceled(_) => "CANCELED",
            Self::Timeout(_) => "TIMEOUT",
            Self::UpstreamHttp { .. } => "UPSTREAM_HTTP_ERROR",
            Self::UpstreamNetwork(_) => "UPSTREAM_NETWORK_ERROR",
            Self::UpstreamProtocol(_) => "UPSTREAM_PROTOCOL_ERROR",
            Self::Io(_) => "IO_ERROR",
            Self::Platform(_) => "PLATFORM_ERROR",
            Self::Unsupported(_) => "UNSUPPORTED",
            Self::Internal(_) => "INTERNAL_ERROR",
        }
    }

    pub fn http_status(&self) -> u16 {
        match self {
            Self::InvalidInput(_) => 400,
            Self::Conflict(_) => 409,
            Self::Canceled(_) => 499,
            Self::Timeout(_) => 504,
            Self::UpstreamHttp { .. }
            | Self::UpstreamNetwork(_)
            | Self::UpstreamProtocol(_) => 502,
            Self::Unsupported(_) => 501,
            Self::Io(_) | Self::Platform(_) | Self::Internal(_) => 500,
        }
    }

    pub fn to_payload(&self) -> ErrorPayload {
        ErrorPayload {
            code: self.error_code(),
            message: self.to_string(),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(msg)
            | Self::Conflict(msg)
            | Self::Canceled(msg)
            | Self::Timeout(msg)
            | Self::UpstreamNetwork(msg)
            | Self::UpstreamProtocol(msg)
            | Self::Io(msg)
            | Self::Platform(msg)
            | Self::Unsupported(msg)
            | Self::Internal(msg) => write!(f, "{msg}"),
            Self::UpstreamHttp {
                prefix,
                status,
                message,
            } => write!(f, "{prefix} ({status}): {message}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_codes_and_http_statuses() {
        let cases = vec![
            (AppError::InvalidInput("bad".into()), "INVALID_INPUT", 400),
            (AppError::Conflict("busy".into()), "CONFLICT", 409),
            (AppError::Canceled("请求已取消".into()), "CANCELED", 499),
            (AppError::Timeout("timeout".into()), "TIMEOUT", 504),
            (
                AppError::UpstreamHttp {
                    prefix: "接口请求异常",
                    status: 503,
                    message: "Service Unavailable".into(),
                },
                "UPSTREAM_HTTP_ERROR",
                502,
            ),
            (
                AppError::UpstreamNetwork("connect err".into()),
                "UPSTREAM_NETWORK_ERROR",
                502,
            ),
            (
                AppError::UpstreamProtocol("invalid json".into()),
                "UPSTREAM_PROTOCOL_ERROR",
                502,
            ),
            (AppError::Io("disk".into()), "IO_ERROR", 500),
            (AppError::Platform("hwnd".into()), "PLATFORM_ERROR", 500),
            (AppError::Unsupported("macos".into()), "UNSUPPORTED", 501),
            (AppError::Internal("panic".into()), "INTERNAL_ERROR", 500),
        ];

        for (err, expected_code, expected_status) in cases {
            assert_eq!(err.error_code(), expected_code);
            assert_eq!(err.http_status(), expected_status);
        }
    }

    #[test]
    fn test_error_display_and_string_conversion() {
        let err = AppError::UpstreamHttp {
            prefix: "接口请求异常",
            status: 429,
            message: "Rate limit".to_string(),
        };
        assert_eq!(err.to_string(), "接口请求异常 (429): Rate limit");
        let payload = err.to_payload();
        assert_eq!(payload.code, "UPSTREAM_HTTP_ERROR");
        assert_eq!(payload.message, "接口请求异常 (429): Rate limit");
        let as_string: String = err.into();
        assert_eq!(as_string, "接口请求异常 (429): Rate limit");
    }
}
