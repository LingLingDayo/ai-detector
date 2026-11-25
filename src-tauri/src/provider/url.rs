use super::types::ApiFormat;

pub fn normalize_completion_url(base_url: &str, format: ApiFormat) -> String {
    let raw = base_url.trim().trim_end_matches('/');
    let trimmed = if raw.is_empty() {
        match format {
            ApiFormat::Anthropic => "https://api.anthropic.com",
            ApiFormat::ChatCompletions | ApiFormat::Responses => "https://api.openai.com",
        }
    } else {
        raw
    };

    match format {
        ApiFormat::Anthropic => {
            if trimmed.ends_with("/messages") {
                trimmed.to_string()
            } else if trimmed.ends_with("/v1") {
                format!("{trimmed}/messages")
            } else {
                format!("{trimmed}/v1/messages")
            }
        }
        ApiFormat::Responses => {
            if trimmed.ends_with("/responses") {
                trimmed.to_string()
            } else if trimmed.ends_with("/v1") {
                format!("{trimmed}/responses")
            } else {
                format!("{trimmed}/v1/responses")
            }
        }
        ApiFormat::ChatCompletions => {
            if trimmed.ends_with("/chat/completions") {
                trimmed.to_string()
            } else if trimmed.ends_with("/v1") {
                format!("{trimmed}/chat/completions")
            } else {
                format!("{trimmed}/v1/chat/completions")
            }
        }
    }
}

pub fn resolve_models_urls(base_url: &str, format: ApiFormat) -> (String, Option<String>) {
    let raw = base_url.trim().trim_end_matches('/');
    let trimmed = if raw.is_empty() {
        match format {
            ApiFormat::Anthropic => "https://api.anthropic.com",
            ApiFormat::ChatCompletions | ApiFormat::Responses => "https://api.openai.com",
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
        format!("{trimmed}/models")
    } else {
        format!("{trimmed}/v1/models")
    };

    let fallback_url = if target_url.ends_with("/v1/models") {
        Some(target_url.replace("/v1/models", "/models"))
    } else if target_url.ends_with("/models") && !target_url.ends_with("/v1/models") {
        Some(format!(
            "{}/v1/models",
            target_url.trim_end_matches("/models")
        ))
    } else {
        None
    };

    (target_url, fallback_url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_url_chat_completions() {
        assert_eq!(
            normalize_completion_url("", ApiFormat::ChatCompletions),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_completion_url("https://api.example.com", ApiFormat::ChatCompletions),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_completion_url("https://api.example.com/v1", ApiFormat::ChatCompletions),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            normalize_completion_url(
                "https://api.example.com/v1/chat/completions",
                ApiFormat::ChatCompletions
            ),
            "https://api.example.com/v1/chat/completions"
        );
    }

    #[test]
    fn test_normalize_url_anthropic() {
        assert_eq!(
            normalize_completion_url("", ApiFormat::Anthropic),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            normalize_completion_url("https://api.example.com", ApiFormat::Anthropic),
            "https://api.example.com/v1/messages"
        );
        assert_eq!(
            normalize_completion_url("https://api.example.com/v1", ApiFormat::Anthropic),
            "https://api.example.com/v1/messages"
        );
        assert_eq!(
            normalize_completion_url("https://api.example.com/messages", ApiFormat::Anthropic),
            "https://api.example.com/messages"
        );
    }

    #[test]
    fn test_normalize_url_responses() {
        assert_eq!(
            normalize_completion_url("https://api.example.com", ApiFormat::Responses),
            "https://api.example.com/v1/responses"
        );
        assert_eq!(
            normalize_completion_url(
                "https://api.example.com/v1",
                ApiFormat::from_raw("openai_responses")
            ),
            "https://api.example.com/v1/responses"
        );
    }

    #[test]
    fn test_resolve_models_urls() {
        let (target, fallback) =
            resolve_models_urls("https://api.example.com", ApiFormat::ChatCompletions);
        assert_eq!(target, "https://api.example.com/v1/models");
        assert_eq!(
            fallback.as_deref(),
            Some("https://api.example.com/models")
        );

        let (target2, fallback2) = resolve_models_urls(
            "https://api.example.com/chat/completions",
            ApiFormat::ChatCompletions,
        );
        assert_eq!(target2, "https://api.example.com/models");
        assert_eq!(
            fallback2.as_deref(),
            Some("https://api.example.com/v1/models")
        );
    }
}
