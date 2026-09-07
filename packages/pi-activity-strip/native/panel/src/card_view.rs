use crate::app::AppMsg;
use crate::protocol::Card;
use relm4::Sender;
use relm4::gtk;
use relm4::gtk::gdk;
use relm4::gtk::glib;
use relm4::gtk::prelude::*;

pub struct CardView {
    pub root: gtk::Button,
    phase: gtk::Label,
    repo: gtk::Label,
    state: gtk::Label,
    tool: gtk::Label,
    elapsed: gtk::Label,
    detail: gtk::Label,
    prompt: gtk::Label,
    reply: gtk::Label,
    path: gtk::Label,
    pid: gtk::Label,
    agent: gtk::Label,
    activation: gtk::Label,
    inspector: gtk::Grid,
}

impl CardView {
    pub fn new(id: &str, sender: &Sender<AppMsg>) -> Self {
        let root = gtk::Button::new();
        root.add_css_class("card");
        root.set_focusable(true);
        root.set_can_focus(true);
        root.set_width_request(224);
        root.set_height_request(60);

        let content = gtk::Box::new(gtk::Orientation::Vertical, 0);
        let header = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        let label_box = gtk::Box::new(gtk::Orientation::Vertical, 3);
        label_box.set_hexpand(true);
        let repo = label("card-repo", gtk::Align::Start);
        let phase = label("card-phase", gtk::Align::Start);
        label_box.append(&repo);
        label_box.append(&phase);
        let state = label("card-state", gtk::Align::End);
        header.append(&label_box);
        header.append(&state);

        let footer = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        footer.set_margin_top(5);
        let tool = label("card-tool", gtk::Align::Start);
        tool.set_hexpand(true);
        let elapsed = label("card-elapsed", gtk::Align::End);
        footer.append(&tool);
        footer.append(&elapsed);

        let inspector = gtk::Grid::new();
        inspector.add_css_class("inspector");
        inspector.set_row_spacing(6);
        inspector.set_column_spacing(8);
        inspector.set_margin_top(10);
        inspector.set_visible(false);
        let detail = inspector_row(&inspector, 0, "detail");
        let prompt = inspector_row(&inspector, 1, "prompt");
        let reply = inspector_row(&inspector, 2, "reply");
        let path = inspector_row(&inspector, 3, "path");
        let pid = inspector_row(&inspector, 4, "pid");
        let agent = inspector_row(&inspector, 5, "agent");
        let activation = label("activation", gtk::Align::Start);
        activation.set_visible(false);
        inspector.attach(&activation, 0, 6, 2, 1);

        content.append(&header);
        content.append(&footer);
        content.append(&inspector);
        root.set_child(Some(&content));

        let card_id = id.to_owned();
        let tx = sender.clone();
        root.connect_clicked(move |_| {
            let _ = tx.send(AppMsg::Activate(card_id.clone()));
        });

        let motion = gtk::EventControllerMotion::new();
        let card_id = id.to_owned();
        let tx = sender.clone();
        motion.connect_enter(move |_, _, _| {
            let _ = tx.send(AppMsg::Hover(card_id.clone(), true));
        });
        let card_id = id.to_owned();
        let tx = sender.clone();
        motion.connect_leave(move |_| {
            let _ = tx.send(AppMsg::Hover(card_id.clone(), false));
        });
        root.add_controller(motion);

        let focus = gtk::EventControllerFocus::new();
        let card_id = id.to_owned();
        let tx = sender.clone();
        focus.connect_enter(move |_| {
            let _ = tx.send(AppMsg::Focus(card_id.clone(), true));
        });
        let card_id = id.to_owned();
        let tx = sender.clone();
        focus.connect_leave(move |_| {
            let _ = tx.send(AppMsg::Focus(card_id.clone(), false));
        });
        root.add_controller(focus);

        let keys = gtk::EventControllerKey::new();
        let card_id = id.to_owned();
        let tx = sender.clone();
        keys.connect_key_pressed(move |_, key, _, modifiers| {
            let direction = if key == gdk::Key::Left {
                -1
            } else if key == gdk::Key::Right {
                1
            } else if key == gdk::Key::Escape {
                let _ = tx.send(AppMsg::Collapse);
                return glib::Propagation::Stop;
            } else if key == gdk::Key::space || key == gdk::Key::KP_Space {
                return glib::Propagation::Stop;
            } else {
                return glib::Propagation::Proceed;
            };
            let manual = modifiers.contains(gdk::ModifierType::SHIFT_MASK);
            let _ = tx.send(AppMsg::Navigate(card_id.clone(), direction, manual));
            glib::Propagation::Stop
        });
        root.add_controller(keys);

        Self {
            root,
            phase,
            repo,
            state,
            tool,
            elapsed,
            detail,
            prompt,
            reply,
            path,
            pid,
            agent,
            activation,
            inspector,
        }
    }

    pub fn update(&self, card: &Card, focused: bool, duplicate_label: bool, now_ms: i64) {
        let hidden_tab = card.hidden_tab();
        self.repo.set_text(&display_repo(card, duplicate_label));
        self.phase.set_text(text_or(&card.phase, "Idle"));
        let real_event_at = if card.last_event_at > 0 {
            card.last_event_at
        } else {
            card.updated_at
        };
        let stalled = card.stalled(now_ms);
        self.state.set_text(if stalled {
            "stalled"
        } else {
            state_label(&card.state)
        });
        self.tool.set_text(text_or(
            if card.tool_name.is_empty() {
                &card.tool_target
            } else {
                &card.tool_name
            },
            "monitoring",
        ));
        self.elapsed.set_text(&format!(
            "{} · {}",
            duration(now_ms, card.agent_started_at.unwrap_or(card.started_at)),
            duration(now_ms, real_event_at)
        ));
        self.detail.set_text(text_or(&card.detail, "Ready"));
        self.prompt
            .set_text(text_or(&card.last_prompt_preview, "—"));
        self.reply.set_text(text_or(&card.assistant_preview, "—"));
        self.path.set_text(text_or(&card.cwd, "—"));
        self.pid.set_text(&pid_row(card, hidden_tab));
        self.agent
            .set_text(text_or(&card.agent_label, "Pi session"));

        for class in [
            "state-idle",
            "state-thinking",
            "state-tool",
            "state-waiting",
            "state-success",
            "state-error",
            "current",
            "stalled",
            "hidden-tab",
        ] {
            self.root.remove_css_class(class);
        }
        if hidden_tab {
            self.root.add_css_class("hidden-tab");
        }
        self.root.add_css_class(&format!(
            "state-{}",
            if stalled {
                "waiting"
            } else {
                state_class(&card.state)
            }
        ));
        if focused {
            self.root.add_css_class("current");
        }
        if stalled {
            self.root.add_css_class("stalled");
        }
        let pid_note = if card.pid > 0 {
            format!("pid {}", card.pid)
        } else {
            "no pid".to_owned()
        };
        self.root.set_tooltip_text(Some(&format!(
            "{} {} ({}{})",
            if hidden_tab { "Present" } else { "Focus" },
            text_or(&card.repo_label, "Pi session"),
            pid_note,
            if hidden_tab { ", hidden tab" } else { "" }
        )));
        let accessible_label = format!(
            "{}, {}, {}",
            text_or(&card.repo_label, "Pi session"),
            if stalled {
                "stalled"
            } else {
                text_or(&card.phase, "idle")
            },
            if hidden_tab {
                "hidden tab, press Enter to present it in its Ghostty window"
            } else {
                "press Enter to focus its Ghostty window"
            }
        );
        self.root
            .update_property(&[gtk::accessible::Property::Label(&accessible_label)]);
        self.root
            .update_state(&[gtk::accessible::State::Selected(Some(focused))]);
    }

    pub fn set_expanded(&self, expanded: bool) {
        self.root
            .update_state(&[gtk::accessible::State::Expanded(Some(expanded))]);
        self.root
            .set_height_request(if expanded { 252 } else { 60 });
        self.inspector.set_visible(expanded);
        if expanded {
            self.root.add_css_class("open");
        } else {
            self.root.remove_css_class("open");
        }
    }

    pub fn set_activation(&self, ok: bool, message: &str) {
        self.activation.set_text(message);
        self.activation.set_visible(true);
        self.activation.remove_css_class("success");
        self.activation.remove_css_class("error");
        self.activation
            .add_css_class(if ok { "success" } else { "error" });
        self.root
            .update_property(&[gtk::accessible::Property::Description(message)]);
        self.root
            .announce(message, gtk::AccessibleAnnouncementPriority::Medium);
    }
}

fn label(class: &str, align: gtk::Align) -> gtk::Label {
    let value = gtk::Label::new(None);
    value.add_css_class(class);
    value.set_halign(align);
    value.set_ellipsize(relm4::gtk::pango::EllipsizeMode::End);
    value.set_xalign(if align == gtk::Align::End { 1.0 } else { 0.0 });
    value
}

fn inspector_row(grid: &gtk::Grid, row: i32, key: &str) -> gtk::Label {
    let key_label = label("inspector-key", gtk::Align::Start);
    key_label.set_text(key);
    key_label.set_width_chars(7);
    let value = label("inspector-value", gtk::Align::Start);
    value.set_wrap(true);
    value.set_lines(2);
    value.set_hexpand(true);
    grid.attach(&key_label, 0, row, 1, 1);
    grid.attach(&value, 1, row, 1, 1);
    value
}

fn display_repo(card: &Card, duplicate: bool) -> String {
    let marker = if card.hidden_tab() { "⧉ " } else { "" };
    if duplicate && card.pid > 0 {
        format!(
            "{}{} · {:04}",
            marker,
            text_or(&card.repo_label, "Pi session"),
            card.pid % 10_000
        )
    } else {
        format!("{}{}", marker, text_or(&card.repo_label, "Pi session"))
    }
}

fn pid_row(card: &Card, hidden_tab: bool) -> String {
    let pid = if card.pid > 0 {
        card.pid.to_string()
    } else {
        "—".to_owned()
    };
    if hidden_tab {
        format!("{pid} · hidden tab")
    } else {
        pid
    }
}

fn state_label(state: &str) -> &str {
    match state {
        "success" => "done",
        "thinking" | "tool" | "waiting" | "error" | "idle" => state,
        _ => "idle",
    }
}

fn state_class(state: &str) -> &str {
    match state {
        "thinking" | "tool" | "waiting" | "success" | "error" => state,
        _ => "idle",
    }
}

fn text_or<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.is_empty() { fallback } else { value }
}

fn duration(now_ms: i64, anchor_ms: i64) -> String {
    let seconds = now_ms.saturating_sub(anchor_ms.max(1)) / 1000;
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card(json: serde_json::Value) -> Card {
        serde_json::from_value(json).expect("card")
    }

    #[test]
    fn hidden_tabs_carry_a_marker_and_pid_note() {
        let agent = card(serde_json::json!({ "agentLabel": "Claude Code" }));
        assert_eq!(agent.agent_label, "Claude Code");
        assert_eq!(text_or(&agent.agent_label, "Pi session"), "Claude Code");
        assert_eq!(
            text_or(&card(serde_json::json!({})).agent_label, "Pi session"),
            "Pi session"
        );

        let hidden = card(serde_json::json!({
            "repoLabel": "dspx", "processId": 12345, "surfaceVisible": false
        }));
        assert!(hidden.hidden_tab());
        assert_eq!(display_repo(&hidden, false), "⧉ dspx");
        assert_eq!(display_repo(&hidden, true), "⧉ dspx · 2345");
        assert_eq!(pid_row(&hidden, true), "12345 · hidden tab");

        let visible = card(serde_json::json!({ "repoLabel": "dspx", "surfaceVisible": true }));
        assert!(!visible.hidden_tab());
        assert_eq!(display_repo(&visible, false), "dspx");
        assert_eq!(pid_row(&visible, false), "—");

        let legacy = card(serde_json::json!({ "repoLabel": "dspx" }));
        assert!(
            !legacy.hidden_tab(),
            "controllers without placement never mark tabs hidden"
        );
    }
}
