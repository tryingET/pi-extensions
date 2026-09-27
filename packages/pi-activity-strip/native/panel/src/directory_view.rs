use crate::app::AppMsg;
use crate::protocol::WindowEntry;
use relm4::Sender;
use relm4::gtk;
use relm4::gtk::prelude::*;

/// Room for the list under the brand text in the expanded ribbon.
const DIRECTORY_MAX_HEIGHT: i32 = 150;
/// Enough digits for any Niri window id; more is a typo, not a window.
const MAX_JUMP_DIGITS: usize = 9;

/// The brand block's window list: every agent window on every workspace, as its card's first line
/// and its Niri window number. Typed digits narrow the list; Enter jumps to the typed number.
pub struct DirectoryView {
    pub root: gtk::Box,
    status: gtk::Label,
    rows: gtk::Box,
    sender: Sender<AppMsg>,
}

impl DirectoryView {
    pub fn new(sender: &Sender<AppMsg>) -> Self {
        let root = gtk::Box::new(gtk::Orientation::Vertical, 6);
        root.add_css_class("directory");
        root.set_visible(false);
        root.set_margin_top(8);

        let status = gtk::Label::new(None);
        status.add_css_class("jump-line");
        status.set_halign(gtk::Align::Fill);
        status.set_xalign(0.0);

        let rows = gtk::Box::new(gtk::Orientation::Vertical, 1);
        let scroller = gtk::ScrolledWindow::new();
        scroller.add_css_class("directory-scroller");
        scroller.set_policy(gtk::PolicyType::Never, gtk::PolicyType::Automatic);
        // Ask for the rows' height up to what the expanded ribbon has room for, then scroll.
        scroller.set_propagate_natural_height(true);
        scroller.set_max_content_height(DIRECTORY_MAX_HEIGHT);
        scroller.set_child(Some(&rows));

        root.append(&status);
        root.append(&scroller);
        Self {
            root,
            status,
            rows,
            sender: sender.clone(),
        }
    }

    pub fn set_visible(&self, visible: bool) {
        self.root.set_visible(visible);
    }

    /// Rebuild the rows for the current list and typed digits. Clicking a row activates its card,
    /// so a hidden tab is presented exactly as clicking its card would.
    pub fn render(&self, windows: &[WindowEntry], digits: &str, can_type: bool) {
        while let Some(child) = self.rows.first_child() {
            self.rows.remove(&child);
        }
        let shown = filter_entries(windows, digits);
        let mut previous: Option<&WindowEntry> = None;
        for entry in &shown {
            if previous.is_none_or(|last| !same_workspace(last, entry)) {
                let header = gtk::Label::new(Some(&workspace_heading(entry)));
                header.add_css_class("directory-header");
                header.set_xalign(0.0);
                // A long workspace name must not widen the brand column.
                header.set_ellipsize(relm4::gtk::pango::EllipsizeMode::End);
                header.set_max_width_chars(1);
                self.rows.append(&header);
            }
            self.rows.append(&self.row(entry));
            previous = Some(entry);
        }
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
        self.status.set_text(&status_text(digits, can_type));
    }

    /// The typing hint alone, leaving the rows (and any click in progress on them) untouched.
    pub fn set_prompt(&self, digits: &str, can_type: bool) {
        self.status.set_text(&status_text(digits, can_type));
    }

    /// A transient message after a jump or activation, until the next keystroke re-renders.
    pub fn set_status(&self, message: &str) {
        self.status.set_text(message);
    }

    fn row(&self, entry: &WindowEntry) -> gtk::Button {
        let row = gtk::Button::new();
        row.add_css_class("directory-row");
        if entry.current {
            row.add_css_class("current");
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
        let id = gtk::Label::new(Some(&format!("#{}", entry.window_id)));
        id.add_css_class("directory-id");
        line.append(&label);
        line.append(&id);
        row.set_child(Some(&line));
        row.set_tooltip_text(Some(&format!(
            "{} — window #{}{}",
            entry.label,
            entry.window_id,
            if entry.hidden_tab { ", hidden tab" } else { "" }
        )));
        let tx = self.sender.clone();
        let card_id = entry.card_id.clone();
        row.connect_clicked(move |_| {
            let _ = tx.send(AppMsg::DirectoryActivate(card_id.clone()));
        });
        row
    }
}

/// One heading per workspace. Workspace numbers repeat across monitors, so the workspace id
/// decides; the number is only what the heading shows.
fn same_workspace(a: &WindowEntry, b: &WindowEntry) -> bool {
    match (a.workspace_id, b.workspace_id) {
        (Some(left), Some(right)) => left == right,
        _ => a.workspace_idx == b.workspace_idx,
    }
}

/// Entries whose window number starts with the typed digits; all of them when nothing is typed.
pub fn filter_entries<'a>(windows: &'a [WindowEntry], digits: &str) -> Vec<&'a WindowEntry> {
    windows
        .iter()
        .filter(|entry| entry.window_id.to_string().starts_with(digits))
        .collect()
}

/// The window number Enter jumps to: exactly what was typed, never a guessed completion.
pub fn jump_target(digits: &str) -> Option<i64> {
    if digits.is_empty() || digits.len() > MAX_JUMP_DIGITS {
        return None;
    }
    digits.parse().ok()
}

/// Append a typed digit, refusing input past the longest possible window number.
pub fn push_digit(digits: &mut String, digit: char) -> bool {
    if !digit.is_ascii_digit() || digits.len() >= MAX_JUMP_DIGITS {
        return false;
    }
    digits.push(digit);
    true
}

fn workspace_heading(entry: &WindowEntry) -> String {
    let number = entry
        .workspace_idx
        .map(|idx| format!("WORKSPACE {idx}"))
        .unwrap_or_else(|| "WORKSPACE".to_owned());
    match entry
        .workspace_name
        .as_deref()
        .filter(|name| !name.is_empty())
    {
        Some(name) => format!("{number} · {name}"),
        None => number,
    }
}

fn status_text(digits: &str, can_type: bool) -> String {
    if !can_type {
        // Hover shows the list without taking the keyboard; a click hands it over.
        "Click, then type a window number".to_owned()
    } else if digits.is_empty() {
        "Type a window number · ⏎ jump".to_owned()
    } else {
        format!("#{digits}▏ ⏎ jump · ⌫ edit")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        }
    }

    #[test]
    fn workspaces_with_the_same_number_on_different_monitors_get_their_own_heading() {
        let left = entry("a", 1, 1);
        let mut right = entry("b", 2, 1);
        right.workspace_id = Some(900);
        assert!(!same_workspace(&left, &right));
        assert!(same_workspace(&left, &entry("c", 3, 1)));
    }

    #[test]
    fn the_status_line_says_when_a_click_is_needed_before_typing() {
        assert_eq!(status_text("", false), "Click, then type a window number");
        assert_eq!(status_text("", true), "Type a window number · ⏎ jump");
        assert!(status_text("43", true).starts_with("#43"));
    }

    #[test]
    fn typed_digits_narrow_the_list_by_window_number_prefix() {
        let windows = vec![entry("a", 43, 2), entry("b", 432, 2), entry("c", 344, 3)];
        let labels = |digits: &str| -> Vec<String> {
            filter_entries(&windows, digits)
                .iter()
                .map(|entry| entry.label.clone())
                .collect()
        };
        assert_eq!(labels(""), ["a", "b", "c"]);
        assert_eq!(labels("43"), ["a", "b"]);
        assert_eq!(labels("432"), ["b"]);
        assert!(labels("9").is_empty());
    }

    #[test]
    fn enter_jumps_to_exactly_the_typed_number() {
        assert_eq!(jump_target("43"), Some(43));
        assert_eq!(jump_target("007"), Some(7));
        assert_eq!(jump_target(""), None);
        assert_eq!(jump_target("1234567890"), None);
    }

    #[test]
    fn only_digits_are_accepted_up_to_a_window_number_length() {
        let mut digits = String::new();
        assert!(push_digit(&mut digits, '4'));
        assert!(!push_digit(&mut digits, 'x'));
        for _ in 0..20 {
            push_digit(&mut digits, '1');
        }
        assert_eq!(digits.len(), MAX_JUMP_DIGITS);
    }

    #[test]
    fn workspace_headings_name_the_number_and_any_name() {
        let mut named = entry("a", 1, 3);
        named.workspace_name = Some("claude-recovery".into());
        assert_eq!(workspace_heading(&named), "WORKSPACE 3 · claude-recovery");
        assert_eq!(workspace_heading(&entry("a", 1, 2)), "WORKSPACE 2");
    }
}
