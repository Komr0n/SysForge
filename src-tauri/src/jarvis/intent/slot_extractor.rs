use std::collections::HashMap;

/// Extract slot values from user input using simple contextual and pattern matching.
pub fn extract_slots(
    input: &str,
    slot_schemas: &HashMap<String, SlotSchema>,
) -> HashMap<String, String> {
    let mut extracted = HashMap::new();
    let words: Vec<&str> = input.split_whitespace().collect();

    for (slot_name, schema) in slot_schemas {
        let mut matched_val: Option<String> = None;

        // 1. Context words lookup (e.g. "до 192.168.1.1", "to google.com")
        if let Some(context_words) = &schema.context_words {
            for cw in context_words {
                let cw_lower = cw.to_lowercase();
                for (i, w) in words.iter().enumerate() {
                    if w.to_lowercase() == cw_lower && i + 1 < words.len() {
                        matched_val = Some(words[i + 1].trim_matches(|c: char| !c.is_alphanumeric() && c != '.' && c != '-').to_string());
                        break;
                    }
                }
                if matched_val.is_some() {
                    break;
                }
            }
        }

        // 2. Pattern based matching if not found
        if matched_val.is_none() {
            if let Some(pattern) = &schema.pattern {
                match pattern.as_str() {
                    "ip_or_hostname" => {
                        for w in &words {
                            let clean = w.trim_matches(|c: char| !c.is_alphanumeric() && c != '.' && c != '-');
                            // Simple IP or domain heuristic
                            if clean.contains('.') && clean.chars().any(|c| c.is_alphanumeric()) {
                                matched_val = Some(clean.to_string());
                                break;
                            }
                        }
                    }
                    "number" => {
                        for w in &words {
                            let clean = w.trim_matches(|c: char| !c.is_numeric());
                            if !clean.is_empty() && clean.chars().all(|c| c.is_numeric()) {
                                matched_val = Some(clean.to_string());
                                break;
                            }
                        }
                    }
                    "duration" => {
                        let lower = input.to_lowercase();
                        if lower.contains("полтора часа") {
                            matched_val = Some("90".to_string());
                        } else if lower.contains("два с половиной часа") {
                            matched_val = Some("150".to_string());
                        } else if lower.contains("полчаса") {
                            matched_val = Some("30".to_string());
                        } else if lower.contains("через час") || lower.contains("на час") {
                            matched_val = Some("60".to_string());
                        } else if lower.contains("два часа") {
                            matched_val = Some("120".to_string());
                        } else {
                            for (i, w) in words.iter().enumerate() {
                                let clean = w.trim_matches(|c: char| !c.is_numeric());
                                if let Ok(n) = clean.parse::<u64>() {
                                    if i + 1 < words.len() {
                                        let next = words[i + 1].to_lowercase();
                                        if next.starts_with("час") || next.starts_with("hour") {
                                            matched_val = Some((n * 60).to_string());
                                            break;
                                        } else if next.starts_with("мин") || next.starts_with("min") {
                                            matched_val = Some(n.to_string());
                                            break;
                                        }
                                    }
                                    matched_val = Some(n.to_string());
                                    break;
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        // 3. Fallback to default value if provided
        if matched_val.is_none() {
            if let Some(default_val) = &schema.default {
                matched_val = Some(default_val.clone());
            }
        }

        if let Some(val) = matched_val {
            extracted.insert(slot_name.clone(), val);
        }
    }

    extracted
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SlotSchema {
    pub default: Option<String>,
    pub context_words: Option<Vec<String>>,
    pub pattern: Option<String>,
}
