pub fn extract_models_from_json(json_val: &serde_json::Value) -> Vec<String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_models() {
        let json = serde_json::json!({
            "data": [
                {"id": "gpt-4o"},
                {"id": "claude-3-5-sonnet"}
            ]
        });
        let models = extract_models_from_json(&json);
        assert_eq!(models, vec!["claude-3-5-sonnet", "gpt-4o"]);
    }
}
