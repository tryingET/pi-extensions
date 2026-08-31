use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{self, Write};
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    #[serde(default)]
    pub card_id: String,
    #[serde(default)]
    pub session_id: String,
    #[serde(default)]
    pub repo_label: String,
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub tool_name: String,
    #[serde(default)]
    pub tool_target: String,
    #[serde(default)]
    pub detail: String,
    #[serde(default)]
    pub last_prompt_preview: String,
    #[serde(default)]
    pub assistant_preview: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub started_at: i64,
    #[serde(default)]
    pub agent_started_at: Option<i64>,
    #[serde(default)]
    pub last_event_at: i64,
    #[serde(default)]
    pub updated_at: i64,
    #[serde(default)]
    pub agent_active: bool,
    #[serde(default, rename = "processId")]
    pub pid: i64,
}

impl Card {
    pub fn id(&self) -> &str {
        if self.card_id.is_empty() {
            &self.session_id
        } else {
            &self.card_id
        }
    }

    pub fn active(&self) -> bool {
        self.agent_active || matches!(self.state.as_str(), "thinking" | "tool" | "waiting")
    }

    pub fn monitoring(&self) -> bool {
        self.state == "success" && self.tool_name.is_empty() && self.tool_target.is_empty()
    }

    pub fn stalled(&self, now_ms: i64) -> bool {
        let real_event_at = if self.last_event_at > 0 {
            self.last_event_at
        } else {
            self.updated_at
        };
        self.agent_active
            && matches!(self.state.as_str(), "thinking" | "tool" | "waiting")
            && real_event_at > 0
            && now_ms.saturating_sub(real_event_at) > 900_000
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewMessage {
    #[serde(default = "protocol_version")]
    pub protocol: u8,
    #[serde(rename = "type")]
    pub message_type: String,
    pub revision: u64,
    #[serde(default)]
    pub visible: bool,
    #[serde(default)]
    pub focused_card_id: Option<String>,
    #[serde(default)]
    pub sessions: Vec<Card>,
}

fn protocol_version() -> u8 {
    1
}

static OUTPUT: OnceLock<Mutex<io::Stdout>> = OnceLock::new();

pub fn emit(event: Value) {
    let stdout = OUTPUT.get_or_init(|| Mutex::new(io::stdout()));
    if let Ok(mut output) = stdout.lock() {
        let _ = serde_json::to_writer(&mut *output, &event);
        let _ = output.write_all(b"\n");
        let _ = output.flush();
    }
}

pub fn emit_ready() {
    emit(json!({
        "protocol": 1,
        "type": "ready",
        "pid": std::process::id(),
        "namespace": "pi-activity-strip"
    }));
}

pub fn emit_error(message: impl Into<String>) {
    emit(json!({ "protocol": 1, "type": "error", "message": message.into() }));
}

pub fn demo_view() -> ViewMessage {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    ViewMessage {
        protocol: 1,
        message_type: "view".into(),
        revision: 1,
        visible: true,
        focused_card_id: Some("demo-tool".into()),
        sessions: vec![
            Card {
                card_id: "demo-monitor".into(),
                session_id: "demo-monitor".into(),
                repo_label: "activity-strip".into(),
                phase: "Monitoring".into(),
                state: "success".into(),
                tool_name: String::new(),
                detail: "Native layer-shell panel online".into(),
                cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions".into(),
                started_at: now - 135_000,
                last_event_at: now - 4_000,
                updated_at: now,
                ..empty_card()
            },
            Card {
                card_id: "demo-tool".into(),
                session_id: "demo-tool".into(),
                repo_label: "native-dogfood".into(),
                phase: "Rendering GTK cards".into(),
                state: "tool".into(),
                tool_name: "gtk4-layer-shell".into(),
                tool_target: "top surface".into(),
                detail: "Exclusive zone remains 84px while details expand".into(),
                last_prompt_preview: "Replace Electron without losing the ribbon UX".into(),
                assistant_preview: "Native panel fixture is active.".into(),
                cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip".into(),
                started_at: now - 42_000,
                agent_started_at: Some(now - 42_000),
                last_event_at: now - 1_000,
                updated_at: now,
                agent_active: true,
                ..empty_card()
            },
        ],
    }
}

fn empty_card() -> Card {
    Card {
        card_id: String::new(),
        session_id: String::new(),
        repo_label: String::new(),
        phase: String::new(),
        state: String::new(),
        tool_name: String::new(),
        tool_target: String::new(),
        detail: String::new(),
        last_prompt_preview: String::new(),
        assistant_preview: String::new(),
        cwd: String::new(),
        started_at: 0,
        agent_started_at: None,
        last_event_at: 0,
        updated_at: 0,
        agent_active: false,
        pid: 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn view_messages_accept_current_node_projection_shape() {
        let view: ViewMessage = serde_json::from_str(
            r#"{"protocol":1,"type":"view","revision":7,"visible":true,"focusedCardId":"card-a","sessions":[{"cardId":"card-a","sessionId":"session-a","state":"tool","agentActive":true,"agentStartedAt":null,"processId":4242}]}"#,
        )
        .expect("view should parse");
        assert_eq!(view.revision, 7);
        assert_eq!(view.sessions[0].id(), "card-a");
        assert!(view.sessions[0].active());
        assert_eq!(view.sessions[0].agent_started_at, None);
        assert_eq!(view.sessions[0].pid, 4242);
    }

    #[test]
    fn monitoring_cards_are_distinct_from_active_work() {
        let mut card = empty_card();
        card.state = "success".into();
        assert!(card.monitoring());
        card.tool_target = "old target".into();
        assert!(!card.monitoring());
        card.tool_target.clear();
        assert!(!card.active());
    }

    #[test]
    fn stalled_requires_agent_active_and_uses_real_event_time() {
        let mut card = empty_card();
        card.state = "tool".into();
        card.last_event_at = 1_000;
        card.updated_at = 1_000_000;
        assert!(!card.stalled(1_000_001));
        card.agent_active = true;
        assert!(card.stalled(1_000_001));
        card.state = "success".into();
        assert!(!card.stalled(1_000_001));
        card.state = "tool".into();
        card.last_event_at = 0;
        card.updated_at = 0;
        assert!(!card.stalled(1_000_001));
    }
}
