use crate::app::AppMsg;
pub use crate::directory_search::{
    JumpChoice, is_query_char, jump_choice_with_selection, push_query_char, step_selection,
};
use crate::directory_search::{
    MatchKind, filter_entries_with_matches, status_text_with_selection, strip_session_prefix,
};
use crate::protocol::WindowEntry;
use relm4::Sender;
use relm4::gtk;
use relm4::gtk::prelude::*;
use std::cell::RefCell;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RowSubtitle {
    pub text: String,
    pub css_class: &'static str,
}

#[derive(Clone, PartialEq, Eq)]
struct RenderedRowKey {
    entry: WindowEntry,
    subtitle: Option<RowSubtitle>,
}

/// The brand block's window list: every agent window on every workspace, as its card's first line
/// and its Niri window number. The typed query narrows it by project name, window number, AK task
/// (id or title), or session id; Enter jumps to the typed window number or activates the top match.
pub struct DirectoryView {
    pub root: gtk::Box,
    status: gtk::Label,
    scroller: gtk::ScrolledWindow,
    rows: gtk::Box,
    // Every material field (including activation target and match subtitle), not current styling.
    rendered_rows: RefCell<Vec<RenderedRowKey>>,
    sender: Sender<AppMsg>,
}

impl DirectoryView {
    pub fn new(sender: &Sender<AppMsg>) -> Self {
        let root = gtk::Box::new(gtk::Orientation::Vertical, 6);
        root.add_css_class("directory");
        root.set_visible(false);
        root.set_vexpand(true);
        root.set_margin_top(8);

        let status = gtk::Label::new(None);
        status.add_css_class("jump-line");
        status.set_halign(gtk::Align::Fill);
        status.set_xalign(0.0);
        // Never let a long UUID query widen the fixed brand column and push cards aside.
        status.set_ellipsize(relm4::gtk::pango::EllipsizeMode::End);
        status.set_max_width_chars(1);

        let rows = gtk::Box::new(gtk::Orientation::Vertical, 1);
        let scroller = gtk::ScrolledWindow::new();
        scroller.add_css_class("directory-scroller");
        scroller.set_policy(gtk::PolicyType::Never, gtk::PolicyType::Automatic);
        // Fill the brand column's height; rows beyond it scroll (wheel or touchpad, no bar).
        scroller.set_vexpand(true);
        scroller.set_child(Some(&rows));

        root.append(&status);
        root.append(&scroller);
        Self {
            root,
            status,
            scroller,
            rows,
            rendered_rows: RefCell::new(Vec::new()),
            sender: sender.clone(),
        }
    }

    pub fn set_visible(&self, visible: bool) {
        self.root.set_visible(visible);
    }

    /// Strong references let GTK tests distinguish retained rows from replacement widgets.
    #[cfg(test)]
    pub(crate) fn row_widgets(&self) -> Vec<gtk::Widget> {
        let mut rows = Vec::new();
        let mut child = self.rows.first_child();
        while let Some(row) = child {
            child = row.next_sibling();
            rows.push(row);
        }
        rows
    }

    /// Retain rows when their material data, order, and match subtitle are unchanged; update
    /// focus/choice styling in place. Clicking a row activates its card, including hidden tabs.
    pub fn render(
        &self,
        windows: &[WindowEntry],
        query: &str,
        can_type: bool,
        allow_unlisted: bool,
        hotkey: Option<&str>,
        selected_card_id: Option<&str>,
    ) {
        let shown = filter_entries_with_matches(windows, query);
        let subtitles: Vec<Option<RowSubtitle>> = shown
            .iter()
            .map(|item| row_subtitle(item.match_kind.as_ref(), query))
            .collect();
        let key: Vec<RenderedRowKey> = shown
            .iter()
            .zip(&subtitles)
            .map(|(item, subtitle)| {
                let mut entry = item.entry.clone();
                entry.current = false;
                RenderedRowKey {
                    entry,
                    subtitle: subtitle.clone(),
                }
            })
            .collect();
        // Empty states have different messages; rebuild them rather than caching a label.
        let reuse = !shown.is_empty() && *self.rendered_rows.borrow() == key;
        if !reuse {
            while let Some(child) = self.rows.first_child() {
                self.rows.remove(&child);
            }
        }
        let mut retained = self.rows.first_child();
        let choice = jump_choice_with_selection(windows, query, allow_unlisted, selected_card_id);
        for (item, subtitle) in shown.iter().zip(&subtitles) {
            let entry = item.entry;
            let chosen = match &choice {
                Some(JumpChoice::Window(id)) => entry.window_id == *id,
                Some(JumpChoice::Card(card_id)) => &entry.card_id == card_id,
                None => false,
            };
            if reuse {
                let row = retained.take().expect("cached directory row exists");
                retained = row.next_sibling();
                for (class, enabled) in [("current", entry.current), ("chosen", chosen)] {
                    if enabled {
                        row.add_css_class(class);
                    } else {
                        row.remove_css_class(class);
                    }
                }
            } else {
                self.rows
                    .append(&self.row(entry, subtitle.as_ref(), chosen));
            }
        }
        *self.rendered_rows.borrow_mut() = key;
        if shown.is_empty() {
            let empty = gtk::Label::new(Some(if windows.is_empty() {
                "No agent windows"
            } else {
                "No listed window matches"
            }));
            empty.add_css_class("directory-empty");
            empty.set_xalign(0.0);
            self.rows.append(&empty);
        }
        self.status.set_text(&status_text_with_selection(
            windows,
            query,
            can_type,
            allow_unlisted,
            hotkey,
            selected_card_id,
        ));
    }

    /// Bring the currently `.chosen` row into view after ↑/↓ selection movement.
    pub fn scroll_chosen_into_view(&self) {
        let mut child = self.rows.first_child();
        while let Some(row) = child {
            if row.has_css_class("chosen") {
                if let Some(origin) =
                    row.compute_point(&self.rows, &gtk::graphene::Point::new(0.0, 0.0))
                {
                    let start = f64::from(origin.y());
                    let end = start + f64::from(row.height());
                    let adjustment = self.scroller.vadjustment();
                    let page = adjustment.page_size();
                    if page > 0.0 {
                        let value = adjustment.value();
                        let next = if start < value {
                            start
                        } else if end > value + page {
                            (end - page).min(start)
                        } else {
                            value
                        };
                        adjustment.set_value(next);
                    }
                }
                break;
            }
            child = row.next_sibling();
        }
    }

    /// The typing hint alone, leaving the rows (and any click in progress on them) untouched.
    pub fn set_prompt(
        &self,
        windows: &[WindowEntry],
        query: &str,
        can_type: bool,
        allow_unlisted: bool,
        hotkey: Option<&str>,
        selected_card_id: Option<&str>,
    ) {
        self.status.set_text(&status_text_with_selection(
            windows,
            query,
            can_type,
            allow_unlisted,
            hotkey,
            selected_card_id,
        ));
    }

    /// A transient message after a jump or activation, until the next keystroke re-renders.
    pub fn set_status(&self, message: &str) {
        self.status.set_text(message);
    }

    fn row(
        &self,
        entry: &WindowEntry,
        subtitle: Option<&RowSubtitle>,
        chosen: bool,
    ) -> gtk::Button {
        let row = gtk::Button::new();
        row.add_css_class("directory-row");
        if entry.current {
            row.add_css_class("current");
        }
        if chosen {
            row.add_css_class("chosen");
        }
        let line = gtk::Box::new(gtk::Orientation::Horizontal, 8);
        let label = gtk::Label::new(Some(&format!(
            "{}{}",
            if entry.hidden_tab { "⧉ " } else { "" },
            entry.label
        )));
        label.add_css_class("directory-label");
        label.set_xalign(0.0);
        label.set_hexpand(true);
        label.set_ellipsize(relm4::gtk::pango::EllipsizeMode::End);
        label.set_max_width_chars(1);
        let workspace = gtk::Label::new(Some(&workspace_tag(entry)));
        workspace.add_css_class("directory-workspace");
        let id = gtk::Label::new(Some(&format!("#{}", entry.window_id)));
        id.add_css_class("directory-id");
        line.append(&label);
        line.append(&workspace);
        line.append(&id);

        if let Some(sub) = subtitle {
            let stack = gtk::Box::new(gtk::Orientation::Vertical, 1);
            stack.append(&line);
            let match_label = gtk::Label::new(Some(&sub.text));
            match_label.add_css_class("directory-match");
            match_label.add_css_class(sub.css_class);
            match_label.set_xalign(0.0);
            match_label.set_hexpand(true);
            match_label.set_ellipsize(relm4::gtk::pango::EllipsizeMode::End);
            match_label.set_max_width_chars(1);
            stack.append(&match_label);
            row.set_child(Some(&stack));
        } else {
            row.set_child(Some(&line));
        }

        row.set_tooltip_text(Some(&row_tooltip(entry)));
        let tx = self.sender.clone();
        let card_id = entry.card_id.clone();
        row.connect_clicked(move |_| {
            let _ = tx.send(AppMsg::DirectoryActivate(card_id.clone()));
        });
        row
    }
}

/// Optional second line on a directory row showing why an AK task or session-id query matched.
fn row_subtitle(match_kind: Option<&MatchKind>, query: &str) -> Option<RowSubtitle> {
    match match_kind? {
        MatchKind::AkTaskExactActive(task)
        | MatchKind::AkTaskPrefixActive(task)
        | MatchKind::AkTaskTitleActive(task) => Some(RowSubtitle {
            text: format!("AK{} · {}", task.id, task.title),
            css_class: "ak-active",
        }),
        MatchKind::AkTaskExactBadge(task)
        | MatchKind::AkTaskPrefixBadge(task)
        | MatchKind::AkTaskTitleBadge(task) => {
            let tag = match task.state.as_str() {
                "orphaned" => " [orphaned]",
                "deferred" => " [deferred]",
                _ => "",
            };
            Some(RowSubtitle {
                text: format!("AK{}{tag} · {}", task.id, task.title),
                css_class: match task.state.as_str() {
                    "orphaned" => "ak-orphaned",
                    "deferred" => "ak-deferred",
                    _ => "ak-unknown",
                },
            })
        }
        MatchKind::SessionId(sid) => Some(RowSubtitle {
            text: format!("id {}", compact_session_preview(sid, query)),
            css_class: "session-match",
        }),
        MatchKind::WindowExact | MatchKind::Label | MatchKind::WindowPrefix => None,
    }
}

/// Show the matched region of a session id cleanly inside the 196px brand column.
fn compact_session_preview(session_id: &str, query: &str) -> String {
    let lower = session_id.to_lowercase();
    let needle_lower = query.to_lowercase();
    let (stripped, _) = strip_session_prefix(&needle_lower);
    if session_id.chars().count() <= 18 {
        return session_id.to_owned();
    }
    if !stripped.is_empty()
        && let Some(byte_pos) = lower.find(stripped)
        && byte_pos > 8
    {
        let char_pos = lower[..byte_pos].chars().count();
        let total = session_id.chars().count();
        let start = char_pos.saturating_sub(2).min(total.saturating_sub(14));
        let slice: String = session_id.chars().skip(start).take(16).collect();
        return format!("…{slice}");
    }
    let head: String = session_id.chars().take(16).collect();
    format!("{head}…")
}

/// The short workspace marker on each row: the number the operator sees in Niri.
fn workspace_tag(entry: &WindowEntry) -> String {
    entry
        .workspace_idx
        .map(|idx| format!("ws{idx}"))
        .unwrap_or_default()
}

/// The workspace in full, for the row's tooltip: its number and any name.
fn workspace_title(entry: &WindowEntry) -> String {
    let number = entry
        .workspace_idx
        .map(|idx| format!("workspace {idx}"))
        .unwrap_or_else(|| "workspace".to_owned());
    match entry
        .workspace_name
        .as_deref()
        .filter(|name| !name.is_empty())
    {
        Some(name) => format!("{number} · {name}"),
        None => number,
    }
}

fn row_tooltip(entry: &WindowEntry) -> String {
    let mut lines = vec![format!(
        "{} — window #{}, {}{}",
        entry.label,
        entry.window_id,
        workspace_title(entry),
        if entry.hidden_tab { ", hidden tab" } else { "" }
    )];
    for task in entry.ak_tasks.iter().take(4) {
        let state = match task.state.as_str() {
            "active" => "live claim",
            "orphaned" => "claim outlives session",
            "deferred" => "deferred",
            other => other,
        };
        lines.push(format!("AK{} [{state}] {}", task.id, task.title));
    }
    if entry.ak_tasks.len() > 4 {
        lines.push(format!("+{} more AK tasks", entry.ak_tasks.len() - 4));
    }
    for sid in entry.session_ids.iter().take(2) {
        lines.push(format!("session {sid}"));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::AkTask;

    fn entry(label: &str, window_id: i64, workspace_idx: i64) -> WindowEntry {
        WindowEntry {
            card_id: format!("card-{window_id}"),
            label: label.into(),
            window_id,
            workspace_id: Some(workspace_idx + 100),
            workspace_idx: Some(workspace_idx),
            workspace_name: None,
            hidden_tab: false,
            current: false,
            session_ids: Vec::new(),
            ak_tasks: Vec::new(),
        }
    }

    #[test]
    fn each_row_names_its_workspace_and_tooltip_includes_ak_tasks_and_session_ids() {
        let mut named = entry("pi-extensions", 43, 3);
        named.workspace_name = Some("claude-recovery".into());
        named.ak_tasks = vec![AkTask {
            id: 5701,
            title: "Show clickable AK-task references".into(),
            state: "active".into(),
        }];
        named.session_ids = vec!["01a0993a-d336-739f-a308-cfa4c21d6332".into()];
        assert_eq!(workspace_tag(&named), "ws3");
        assert_eq!(workspace_title(&named), "workspace 3 · claude-recovery");
        assert_eq!(workspace_title(&entry("a", 1, 2)), "workspace 2");
        let tip = row_tooltip(&named);
        assert!(tip.contains("AK5701 [live claim] Show clickable AK-task references"));
        assert!(tip.contains("session 01a0993a-d336-739f-a308-cfa4c21d6332"));

        let ak_sub = row_subtitle(
            crate::directory_search::match_entry(&named, "ak5701").as_ref(),
            "ak5701",
        )
        .unwrap();
        assert_eq!(ak_sub.css_class, "ak-active");
        assert!(ak_sub.text.starts_with("AK5701 · Show clickable"));

        let sid_sub = row_subtitle(
            crate::directory_search::match_entry(&named, "cfa4c21d").as_ref(),
            "cfa4c21d",
        )
        .unwrap();
        assert_eq!(sid_sub.css_class, "session-match");
        assert!(sid_sub.text.contains("cfa4c21d"));
    }
}
