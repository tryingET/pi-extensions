use serde::Deserialize;
use serde_json::{Value, json};
use std::io::{self, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AkTask {
    #[serde(default)]
    pub id: i64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub state: String,
}

impl AkTask {
    /// Only an `active` chip is a button: the card's own session holds a live claim, so clicking
    /// it focuses that session's Ghostty window. Every other state is a badge and never fires.
    pub fn is_active(&self) -> bool {
        self.state == "active"
    }
}

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
    /// Set for tabs running an agent other than Pi, which publish no telemetry of their own.
    #[serde(default)]
    pub agent_label: String,
    /// Read-only AK task references joined onto this card by the controller. `active` chips are
    /// clickable and focus this card's terminal; the rest are inert badges.
    #[serde(default)]
    pub ak_tasks: Vec<AkTask>,
    /// How many further AK references exist beyond the rendered chips.
    #[serde(default)]
    pub ak_task_overflow: u32,
    /// `Some(false)` marks a tab hidden behind another tab of its Ghostty window; the controller
    /// placed it through its host process, so activation presents the tab before focusing.
    #[serde(default)]
    pub surface_visible: Option<bool>,
    /// Niri window id, so a window an agent or tool names by id can be found on the ribbon. A
    /// hidden tab has no window of its own and carries the id of the window hosting it.
    #[serde(default, deserialize_with = "lenient_integer")]
    pub window_id: Option<i64>,
    /// Niri workspace `idx`: the number the operator sees, not the internal workspace id.
    #[serde(default, deserialize_with = "lenient_integer")]
    pub workspace_idx: Option<i64>,
}

/// An optional label is not worth a view: a value that is not an integer drops the field rather
/// than failing the whole message and every card in it.
fn lenient_integer<'de, D>(deserializer: D) -> Result<Option<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Value::deserialize(deserializer)?.as_i64())
}

impl Card {
    pub fn id(&self) -> &str {
        if self.card_id.is_empty() {
            &self.session_id
        } else {
            &self.card_id
        }
    }

    pub fn hidden_tab(&self) -> bool {
        self.surface_visible == Some(false)
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
static READY: AtomicBool = AtomicBool::new(false);

pub fn emit(event: Value) {
    let stdout = OUTPUT.get_or_init(|| Mutex::new(io::stdout()));
    if let Ok(mut output) = stdout.lock() {
        let _ = serde_json::to_writer(&mut *output, &event);
        let _ = output.write_all(b"\n");
        let _ = output.flush();
    }
}

/// Whether this panel ever came up. GTK returns from `run` without building anything when it hands
/// the activation to another panel on the same display.
pub fn was_ready() -> bool {
    READY.load(Ordering::SeqCst)
}

pub fn emit_ready() {
    READY.store(true, Ordering::SeqCst);
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
                window_id: Some(36),
                workspace_idx: Some(2),
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
                ak_tasks: vec![AkTask {
                    id: 5701,
                    title: "Show clickable AK-task references on the activity ribbon".into(),
                    state: "active".into(),
                }],
                ak_task_overflow: 1,
                window_id: Some(43),
                workspace_idx: Some(2),
                ..empty_card()
            },
            Card {
                card_id: "demo-hidden".into(),
                session_id: "demo-hidden".into(),
                repo_label: "pi-extensions".into(),
                phase: "Waiting behind another tab".into(),
                state: "idle".into(),
                detail: "Hidden tab placed through its Ghostty host window".into(),
                cwd: "/home/tryinget/ai-society/softwareco/owned/pi-extensions".into(),
                started_at: now - 610_000,
                last_event_at: now - 95_000,
                updated_at: now,
                pid: 48213,
                agent_label: "Claude Code".into(),
                surface_visible: Some(false),
                window_id: Some(43),
                workspace_idx: Some(2),
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
        agent_label: String::new(),
        ak_tasks: Vec::new(),
        ak_task_overflow: 0,
        surface_visible: None,
        window_id: None,
        workspace_idx: None,
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
        assert!(view.sessions[0].ak_tasks.is_empty());
        assert_eq!(view.sessions[0].ak_task_overflow, 0);
    }

    #[test]
    fn window_and_workspace_numbers_are_optional_card_fields() {
        let view: ViewMessage = serde_json::from_str(
            r#"{"protocol":1,"type":"view","revision":9,"sessions":[{"cardId":"card-a","windowId":43,"workspaceIdx":2},{"cardId":"card-b","windowId":null,"workspaceIdx":null},{"cardId":"card-c"}]}"#,
        )
        .expect("view should parse");
        assert_eq!(view.sessions[0].window_id, Some(43));
        assert_eq!(view.sessions[0].workspace_idx, Some(2));
        assert_eq!(view.sessions[1].window_id, None);
        assert_eq!(view.sessions[1].workspace_idx, None);
        assert_eq!(
            view.sessions[2].window_id, None,
            "controllers that send no window id still parse"
        );
        assert_eq!(view.sessions[2].workspace_idx, None);
    }

    #[test]
    fn a_malformed_window_or_workspace_number_drops_only_that_field() {
        let view: ViewMessage = serde_json::from_str(
            r#"{"protocol":1,"type":"view","revision":10,"sessions":[{"cardId":"card-a","windowId":"43","workspaceIdx":2.5},{"cardId":"card-b","windowId":44,"workspaceIdx":3}]}"#,
        )
        .expect("a bad optional field must not reject the whole view");
        assert_eq!(view.sessions.len(), 2);
        assert_eq!(view.sessions[0].window_id, None);
        assert_eq!(view.sessions[0].workspace_idx, None);
        assert_eq!(view.sessions[1].window_id, Some(44));
        assert_eq!(view.sessions[1].workspace_idx, Some(3));
    }

    #[test]
    fn ak_task_chips_parse_with_states() {
        let view: ViewMessage = serde_json::from_str(
            r#"{"protocol":1,"type":"view","revision":8,"sessions":[{"cardId":"card-a","akTasks":[{"id":5701,"title":"Show clickable AK-task references","state":"active"},{"id":5432,"title":"Preserve safe NEXUS recovery reasons","state":"orphaned"},{"id":4220,"title":"Control Decision 77 epoch admissions","state":"deferred"}],"akTaskOverflow":3}]}"#,
        )
        .expect("view should parse");
        let card = &view.sessions[0];
        assert_eq!(card.ak_tasks.len(), 3);
        assert!(card.ak_tasks[0].is_active());
        assert!(!card.ak_tasks[1].is_active());
        assert!(!card.ak_tasks[2].is_active());
        assert_eq!(card.ak_task_overflow, 3);
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
