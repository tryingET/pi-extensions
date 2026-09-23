use crate::app::AppMsg;
use crate::protocol::{AkTask, Card};
use relm4::Sender;
use relm4::gtk;
use relm4::gtk::gdk;
use relm4::gtk::glib;
use relm4::gtk::prelude::*;
use std::cell::Cell;
use std::rc::Rc;

/// Rendered AK chips per card. The controller sends live-claim buttons first, then state badges;
/// the card shows the first and folds the rest into the `+N` count. Nothing else in the footer
/// shrinks, so this bound and the bounded timers are what hold the card at its width. The
/// inspector still lists every reference.
const AK_CHIP_SLOTS: usize = 1;

pub struct CardView {
    pub root: gtk::Button,
    phase: gtk::Label,
    repo: gtk::Label,
    state: gtk::Label,
    window: gtk::Label,
    tool: gtk::Label,
    elapsed: gtk::Label,
    detail: gtk::Label,
    prompt: gtk::Label,
    reply: gtk::Label,
    path: gtk::Label,
    pid: gtk::Label,
    window_detail: gtk::Label,
    agent: gtk::Label,
    task: gtk::Label,
    activation: gtk::Label,
    inspector: gtk::Grid,
    ak_row: gtk::Box,
    ak_chips: Vec<gtk::Label>,
    ak_clickable: Vec<Rc<Cell<bool>>>,
    ak_overflow: gtk::Label,
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
        // The Niri window id, so a window an agent or tool names by id can be found on the ribbon.
        // It leads the footer so it sits at the same place on every card and costs the title nothing.
        let window = label("card-window", gtk::Align::Start);
        window.set_ellipsize(relm4::gtk::pango::EllipsizeMode::None);
        window.set_visible(false);
        // AK references ride in the footer as bare task numbers: the header belongs to the folder
        // name, which is what tells cards apart. The titles live in each chip's tooltip.
        let ak_row = gtk::Box::new(gtk::Orientation::Horizontal, 3);
        ak_row.set_valign(gtk::Align::Center);
        ak_row.set_visible(false);
        let tool = label("card-tool", gtk::Align::Start);
        tool.set_hexpand(true);
        let elapsed = label("card-elapsed", gtk::Align::End);
        // The window id and timers are never cut: the tool name gives way to the AK chips first.
        elapsed.set_ellipsize(relm4::gtk::pango::EllipsizeMode::None);
        footer.append(&window);
        footer.append(&ak_row);
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
        let window_detail = inspector_row(&inspector, 5, "window");
        // Always one short line; a wrapping label would reserve a second line of height for it.
        window_detail.set_wrap(false);
        window_detail.set_lines(-1);
        let agent = inspector_row(&inspector, 6, "agent");
        let task = inspector_row(&inspector, 7, "task");
        let activation = label("activation", gtk::Align::Start);
        activation.set_visible(false);
        inspector.attach(&activation, 0, 8, 2, 1);

        content.append(&header);
        content.append(&footer);
        content.append(&inspector);
        root.set_child(Some(&content));

        let card_id = id.to_owned();
        let tx = sender.clone();
        root.connect_clicked(move |_| {
            let _ = tx.send(AppMsg::Activate(card_id.clone()));
        });

        // AK task chips: an `active` chip reuses the card's own activation, so clicking it focuses
        // the exact Ghostty window of the session holding that task's live claim. Badge states stop
        // propagation instead, so a non-actionable reference never fires anything.
        let mut ak_chips = Vec::with_capacity(AK_CHIP_SLOTS);
        let mut ak_clickable = Vec::with_capacity(AK_CHIP_SLOTS);
        for _slot in 0..AK_CHIP_SLOTS {
            let chip = label("ak-task", gtk::Align::Start);
            chip.set_ellipsize(relm4::gtk::pango::EllipsizeMode::None);
            chip.set_visible(false);
            let clickable = Rc::new(Cell::new(false));
            let click = gtk::GestureClick::new();
            let card_id = id.to_owned();
            let tx = sender.clone();
            let chip_clickable = Rc::clone(&clickable);
            click.connect_released(move |gesture, _, _, _| {
                if chip_clickable.get() {
                    let _ = tx.send(AppMsg::Activate(card_id.clone()));
                }
                gesture.set_state(gtk::EventSequenceState::Claimed);
            });
            chip.add_controller(click);
            ak_row.append(&chip);
            ak_chips.push(chip);
            ak_clickable.push(clickable);
        }
        let ak_overflow = label("ak-overflow", gtk::Align::Start);
        ak_overflow.set_ellipsize(relm4::gtk::pango::EllipsizeMode::None);
        ak_overflow.set_visible(false);
        ak_row.append(&ak_overflow);

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
            window,
            tool,
            elapsed,
            detail,
            prompt,
            reply,
            path,
            pid,
            window_detail,
            agent,
            task,
            activation,
            inspector,
            ak_row,
            ak_chips,
            ak_clickable,
            ak_overflow,
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
        match window_chip_text(card) {
            Some(text) => {
                self.window.set_text(&text);
                self.window.set_visible(true);
            }
            None => self.window.set_visible(false),
        }
        self.window_detail.set_text(&window_row(card));
        self.agent
            .set_text(text_or(&card.agent_label, "Pi session"));
        self.task
            .set_text(&ak_inspector_text(&card.ak_tasks, card.ak_task_overflow));
        self.apply_ak_tasks(card);

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
        let ak_note = ak_accessible_note(&card.ak_tasks);
        let window_note = window_note(card);
        self.root.set_tooltip_text(Some(&format!(
            "{} {} ({}{}{}){}",
            if hidden_tab { "Present" } else { "Focus" },
            text_or(&card.repo_label, "Pi session"),
            pid_note,
            window_note,
            if hidden_tab { ", hidden tab" } else { "" },
            ak_note
        )));
        let accessible_label = format!(
            "{}{}, {}, {}{}",
            text_or(&card.repo_label, "Pi session"),
            window_note,
            if stalled {
                "stalled"
            } else {
                text_or(&card.phase, "idle")
            },
            if hidden_tab {
                "hidden tab, press Enter to present it in its Ghostty window"
            } else {
                "press Enter to focus its Ghostty window"
            },
            ak_note
        );
        self.root
            .update_property(&[gtk::accessible::Property::Label(&accessible_label)]);
        self.root
            .update_state(&[gtk::accessible::State::Selected(Some(focused))]);
    }

    fn apply_ak_tasks(&self, card: &Card) {
        let chips = &card.ak_tasks;
        for (index, chip) in self.ak_chips.iter().enumerate() {
            let clickable = self.ak_clickable.get(index).map(Rc::as_ref);
            match (chips.get(index), clickable) {
                (Some(task), Some(flag)) => {
                    chip.set_visible(true);
                    chip.set_text(&ak_chip_text(task));
                    for class in ["ak-active", "ak-deferred", "ak-orphaned"] {
                        chip.remove_css_class(class);
                    }
                    chip.add_css_class(ak_chip_class(&task.state));
                    chip.set_tooltip_text(Some(&ak_chip_tooltip(task)));
                    flag.set(task.is_active());
                }
                _ => {
                    chip.set_visible(false);
                    chip.set_tooltip_text(None);
                    if let Some(flag) = clickable {
                        flag.set(false);
                    }
                }
            }
        }
        self.ak_row.set_visible(!chips.is_empty());
        let overflow = ak_folded_count(chips.len(), card.ak_task_overflow);
        self.ak_overflow.set_visible(overflow > 0);
        self.ak_overflow.set_text(&format!("+{overflow}"));
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

/// Compact chip text: the bare Niri window id, as agents and tools print it.
fn window_chip_text(card: &Card) -> Option<String> {
    card.window_id.map(|id| format!("#{id}"))
}

/// Inspector row: the window id and the workspace number the operator sees. A hidden tab has no
/// window of its own, so its id is marked as the window hosting it.
fn window_row(card: &Card) -> String {
    let Some(window_id) = card.window_id else {
        return "—".to_owned();
    };
    let window = if card.hidden_tab() {
        format!("host #{window_id}")
    } else {
        format!("#{window_id}")
    };
    match card.workspace_idx {
        Some(workspace) => format!("{window} · workspace {workspace}"),
        None => window,
    }
}

/// Appended to the card's tooltip and accessible label when the window is known.
fn window_note(card: &Card) -> String {
    match card.window_id {
        Some(id) if card.hidden_tab() => format!(", host window {id}"),
        Some(id) => format!(", window {id}"),
        None => String::new(),
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

/// CSS class for one AK chip state. Unknown states render as a muted, non-clickable chip.
fn ak_chip_class(state: &str) -> &'static str {
    match state {
        "active" => "ak-active",
        "deferred" => "ak-deferred",
        "orphaned" => "ak-orphaned",
        _ => "ak-unknown",
    }
}

/// References beyond the rendered chips: those the card has no slot for plus the controller's own
/// overflow.
fn ak_folded_count(joined: usize, overflow: u32) -> u32 {
    overflow.saturating_add(joined.saturating_sub(AK_CHIP_SLOTS) as u32)
}

/// Compact chip text: the task number as it is written in commits, `AK5701`, so it never reads as
/// the `#43` window chip beside it. The title is in the tooltip and the inspector.
fn ak_chip_text(task: &AkTask) -> String {
    format!("AK{}", task.id)
}

fn ak_chip_tooltip(task: &AkTask) -> String {
    match task.state.as_str() {
        "active" => format!(
            "AK task #{} — {}. Click to focus the claiming session's Ghostty window.",
            task.id, task.title
        ),
        "orphaned" => format!(
            "AK task #{} — {}. Claim outlives its session (lease not expired); not clickable.",
            task.id, task.title
        ),
        "deferred" => format!(
            "AK task #{} — {}. Deferred by AK; not clickable.",
            task.id, task.title
        ),
        _ => format!("AK task #{} — {}", task.id, task.title),
    }
}

/// Inspector row: every joined reference with its state, plus the overflow count.
fn ak_inspector_text(tasks: &[AkTask], overflow: u32) -> String {
    if tasks.is_empty() && overflow == 0 {
        return "—".to_owned();
    }
    let mut lines: Vec<String> = tasks
        .iter()
        .map(|task| {
            format!(
                "#{} [{}] {}",
                task.id,
                match task.state.as_str() {
                    "active" => "live claim",
                    "orphaned" => "claim outlives session",
                    "deferred" => "deferred",
                    _ => "unknown",
                },
                task.title
            )
        })
        .collect();
    if overflow > 0 {
        lines.push(format!("+{overflow} more"));
    }
    lines.join("\n")
}

/// Appended to the card's tooltip and accessible label when AK references exist.
fn ak_accessible_note(tasks: &[AkTask]) -> String {
    match tasks.first() {
        Some(task) if task.is_active() => format!(
            ". AK task #{} {} (click the chip to focus the claiming session)",
            task.id, task.title
        ),
        Some(task) => format!(
            ". AK task #{} {} (badge only, not clickable)",
            task.id, task.title
        ),
        None => String::new(),
    }
}

fn text_or<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.is_empty() { fallback } else { value }
}

/// Elapsed time in at most five characters (`59:59`, `23h59`, `99d`), so a long-running session
/// never widens the card's footer.
fn duration(now_ms: i64, anchor_ms: i64) -> String {
    let seconds = now_ms.saturating_sub(anchor_ms.max(1)) / 1000;
    let minutes = seconds / 60;
    let hours = minutes / 60;
    if hours == 0 {
        format!("{}:{:02}", minutes, seconds % 60)
    } else if hours < 24 {
        format!("{}h{:02}", hours, minutes % 60)
    } else {
        format!("{}d", (hours / 24).min(99))
    }
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

    #[test]
    fn window_chip_names_the_niri_window_and_the_detail_adds_its_workspace() {
        let visible = card(serde_json::json!({
            "repoLabel": "dspx", "windowId": 43, "workspaceIdx": 2, "surfaceVisible": true
        }));
        assert_eq!(window_chip_text(&visible).as_deref(), Some("#43"));
        assert_eq!(window_row(&visible), "#43 · workspace 2");
        assert_eq!(window_note(&visible), ", window 43");

        let hidden = card(serde_json::json!({
            "repoLabel": "dspx", "windowId": 43, "workspaceIdx": 2, "surfaceVisible": false
        }));
        assert_eq!(
            window_chip_text(&hidden).as_deref(),
            Some("#43"),
            "a hidden tab shows the window hosting it"
        );
        assert_eq!(window_row(&hidden), "host #43 · workspace 2");
        assert_eq!(window_note(&hidden), ", host window 43");

        let unindexed = card(serde_json::json!({ "windowId": 43 }));
        assert_eq!(window_row(&unindexed), "#43");

        let unplaced = card(serde_json::json!({ "repoLabel": "dspx" }));
        assert_eq!(
            window_chip_text(&unplaced),
            None,
            "no chip without a window"
        );
        assert_eq!(window_row(&unplaced), "—");
        assert_eq!(window_note(&unplaced), "");
    }

    #[test]
    fn ak_chip_states_map_to_classes_and_only_active_is_clickable() {
        let active = AkTask {
            id: 5701,
            title: "Show clickable AK-task references".into(),
            state: "active".into(),
        };
        let orphaned = AkTask {
            state: "orphaned".into(),
            ..active.clone()
        };
        let deferred = AkTask {
            state: "deferred".into(),
            ..active.clone()
        };
        assert_eq!(ak_chip_class("active"), "ak-active");
        assert_eq!(ak_chip_class("orphaned"), "ak-orphaned");
        assert_eq!(ak_chip_class("deferred"), "ak-deferred");
        assert_eq!(ak_chip_class("surprise"), "ak-unknown");
        assert!(active.is_active());
        assert!(!orphaned.is_active());
        assert!(!deferred.is_active());
        assert_eq!(ak_chip_text(&active), "AK5701");
        assert_eq!(ak_folded_count(1, 0), 0);
        assert_eq!(ak_folded_count(4, 0), 3);
        assert_eq!(ak_folded_count(4, 21), 24);
        assert!(ak_chip_tooltip(&orphaned).contains("not clickable"));
        assert!(ak_chip_tooltip(&active).contains("focus the claiming session"));
    }

    #[test]
    fn durations_stay_within_five_characters() {
        let at = |seconds: i64| duration(1_000 + seconds * 1000, 1_000);
        assert_eq!(at(65), "1:05");
        assert_eq!(at(59 * 60 + 59), "59:59");
        assert_eq!(at(3600 + 5 * 60), "1h05");
        assert_eq!(at(23 * 3600 + 59 * 60), "23h59");
        assert_eq!(at(3 * 86_400), "3d");
        assert_eq!(at(400 * 86_400), "99d");
    }

    #[test]
    fn ak_inspector_lists_every_reference_with_overflow() {
        let tasks = vec![
            AkTask {
                id: 5701,
                title: "Live claim task".into(),
                state: "active".into(),
            },
            AkTask {
                id: 4220,
                title: "Deferred task".into(),
                state: "deferred".into(),
            },
        ];
        let text = ak_inspector_text(&tasks, 3);
        assert!(text.contains("#5701 [live claim] Live claim task"));
        assert!(text.contains("#4220 [deferred] Deferred task"));
        assert!(text.contains("+3 more"));
        assert_eq!(ak_inspector_text(&[], 0), "—");
        assert!(ak_accessible_note(&tasks).starts_with(". AK task #5701"));
        assert_eq!(ak_accessible_note(&[]), "");
    }
}
