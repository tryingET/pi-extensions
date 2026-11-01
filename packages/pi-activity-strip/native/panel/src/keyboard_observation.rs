//! Optional private-v2 observation, never authorization or a cross-clock countdown.
use serde_json::{Value, json};

const MAX_SAFE: u64 = 9_007_199_254_740_991;

/// Validate/allowlist the exact same executable protocol fixtures as the Node observer.
/// Unknown fields are discarded, including all application/query text.
pub(crate) fn normalize(value: &Value) -> Option<Value> {
    if value["protocol"] != 2 || value["type"] != "keyboard-observation" {
        return None;
    }
    let request = value["request"]
        .as_u64()
        .filter(|v| *v > 0 && *v <= MAX_SAFE)?;
    let native_ms = value["nativeMs"].as_u64().filter(|v| *v <= MAX_SAFE)?;
    let captured = value["captured"].as_bool()?;
    let origin = value["origin"].as_str()?;
    let reason = value["reason"].as_str()?;
    if !captured
        || !matches!(
            reason,
            "acquired" | "activity" | "idle-expired" | "source-revoked"
        )
    {
        return None;
    }
    let deadline = value.get("deadlineMs")?;
    match origin {
        "hover" => {
            let limit = deadline.as_u64().filter(|v| *v <= MAX_SAFE)?;
            if (reason == "idle-expired" && native_ms < limit)
                || (matches!(reason, "acquired" | "activity") && native_ms >= limit)
            {
                return None;
            }
        }
        "explicit" if deadline.is_null() && reason != "idle-expired" => {}
        _ => return None,
    }
    Some(
        json!({"protocol":2, "type":"keyboard-observation", "request":request,
        "origin":origin, "reason":reason, "nativeMs":native_ms,
        "deadlineMs":deadline, "captured":captured}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shared_node_rust_protocol_transitions_are_observations_only() {
        let cases: Value =
            serde_json::from_str(include_str!("keyboard-observation-fixtures.json")).unwrap();
        for case in cases.as_array().unwrap() {
            let got = normalize(&case["event"]);
            assert_eq!(
                got.is_some(),
                case["valid"].as_bool().unwrap(),
                "{}",
                case["name"]
            );
            if let Some(got) = got {
                assert!(got.get("query").is_none());
                assert!(got.get("credential").is_none());
                assert_eq!(got.as_object().unwrap().len(), 8);
            }
        }
    }
}
