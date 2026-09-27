use crate::app::AppMsg;
use crate::protocol::WindowEntry;
use relm4::Sender;
use relm4::gtk;
use relm4::gtk::prelude::*;

/// Enough digits for any Niri window id; a longer number is a typo, not a window.
const MAX_WINDOW_DIGITS: usize = 9;
/// A search is a few letters of a project name, never a sentence.
const MAX_QUERY_CHARS: usize = 32;

/// What Enter does with the typed query.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum JumpChoice {
    /// A number: exactly that Niri window, listed or not.
    Window(i64),
    /// A name: the first listed match, opened like clicking its row.
    Card(String),
}

/// The brand block's window list: every agent window on every workspace, as its card's first line
/// and its Niri window number. The typed query narrows it by name or number; Enter goes to the
/// typed window number, or to the first match of a name.
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
        root.set_vexpand(true);
        root.set_margin_top(8);

        let status = gtk::Label::new(None);
        status.add_css_class("jump-line");
        status.set_halign(gtk::Align::Fill);
        status.set_xalign(0.0);

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
            rows,
            sender: sender.clone(),
        }
    }

    pub fn set_visible(&self, visible: bool) {
        self.root.set_visible(visible);
    }

    /// Rebuild the rows for the current list and query. Clicking a row activates its card, so a
    /// hidden tab is presented exactly as clicking its card would. The row Enter would open is
    /// marked, so a typed name always shows where it leads.
    pub fn render(
        &self,
        windows: &[WindowEntry],
        query: &str,
        can_type: bool,
        allow_unlisted: bool,
    ) {
        while let Some(child) = self.rows.first_child() {
            self.rows.remove(&child);
        }
        let shown = filter_entries(windows, query);
        let choice = jump_choice(windows, query, allow_unlisted);
        // Alphabetical from the controller, so workspace headings would repeat; each row names
        // its workspace instead.
        for entry in &shown {
            let chosen = match &choice {
                Some(JumpChoice::Window(id)) => entry.window_id == *id,
                Some(JumpChoice::Card(card_id)) => &entry.card_id == card_id,
                None => false,
            };
            self.rows.append(&self.row(entry, chosen));
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
        self.status
            .set_text(&status_text(windows, query, can_type, allow_unlisted));
    }

    /// The typing hint alone, leaving the rows (and any click in progress on them) untouched.
    pub fn set_prompt(
        &self,
        windows: &[WindowEntry],
        query: &str,
        can_type: bool,
        allow_unlisted: bool,
    ) {
        self.status
            .set_text(&status_text(windows, query, can_type, allow_unlisted));
    }

    /// A transient message after a jump or activation, until the next keystroke re-renders.
    pub fn set_status(&self, message: &str) {
        self.status.set_text(message);
    }

    fn row(&self, entry: &WindowEntry, chosen: bool) -> gtk::Button {
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
        row.set_child(Some(&line));
        row.set_tooltip_text(Some(&format!(
            "{} — window #{}, {}{}",
            entry.label,
            entry.window_id,
            workspace_title(entry),
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

/// Entries whose project name contains the query (ignoring case) or whose window number starts
/// with it; all of them when nothing is typed.
pub fn filter_entries<'a>(windows: &'a [WindowEntry], query: &str) -> Vec<&'a WindowEntry> {
    let needle = query.to_lowercase();
    windows
        .iter()
        .filter(|entry| {
            entry.window_id.to_string().starts_with(&needle)
                || entry.label.to_lowercase().contains(&needle)
        })
        .collect()
}

fn is_window_number(query: &str) -> bool {
    !query.is_empty() && query.chars().all(|character| character.is_ascii_digit())
}

/// What Enter does. Digits go to the listed window with exactly that number; failing that, to a
/// project whose name contains them (`0844` finds `pi-0844-…`); failing that, when
/// `allow_unlisted`, to exactly that number, listed or not, never a guessed completion. Anything
/// else goes to the first project whose name contains it. Nothing typed, or nothing matching,
/// does nothing. Typing held only by hover passes `allow_unlisted = false`, so a digit typed at a
/// terminal prompt cannot reach an arbitrary window.
pub fn jump_choice(
    windows: &[WindowEntry],
    query: &str,
    allow_unlisted: bool,
) -> Option<JumpChoice> {
    if query.is_empty() {
        return None;
    }
    let needle = query.to_lowercase();
    let named = || {
        windows
            .iter()
            .find(|entry| entry.label.to_lowercase().contains(&needle))
            .map(|entry| JumpChoice::Card(entry.card_id.clone()))
    };
    if !is_window_number(query) {
        return named();
    }
    let number = (query.len() <= MAX_WINDOW_DIGITS)
        .then(|| query.parse::<i64>().ok())
        .flatten();
    if let Some(id) = number
        && windows.iter().any(|entry| entry.window_id == id)
    {
        return Some(JumpChoice::Window(id));
    }
    named().or(number.filter(|_| allow_unlisted).map(JumpChoice::Window))
}

/// Append a typed character: letters and digits, and the `-`, `_` and `.` of project names.
pub fn push_query_char(query: &mut String, character: char) -> bool {
    if !is_query_char(character) || query.chars().count() >= MAX_QUERY_CHARS {
        return false;
    }
    query.push(character);
    true
}

pub fn is_query_char(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '-' | '_' | '.')
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

fn status_text(
    windows: &[WindowEntry],
    query: &str,
    can_type: bool,
    allow_unlisted: bool,
) -> String {
    if !can_type {
        // The keyboard was handed back (hover timeout); a click takes it again.
        return "Click, then type a name or number".to_owned();
    }
    match jump_choice(windows, query, allow_unlisted) {
        _ if query.is_empty() => "Type a name or number · ⏎ go".to_owned(),
        Some(JumpChoice::Window(_)) => format!("#{query}▏ ⏎ jump · ⌫ edit"),
        Some(JumpChoice::Card(card_id)) => {
            let label = windows
                .iter()
                .find(|entry| entry.card_id == card_id)
                .map(|entry| entry.label.as_str())
                .unwrap_or("match");
            format!("{query}▏ ⏎ {label}")
        }
        None => format!("{query}▏ no match"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn jump_choice_open(windows: &[WindowEntry], query: &str) -> Option<JumpChoice> {
        jump_choice(windows, query, true)
    }

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
    fn the_status_line_says_what_enter_will_do() {
        let windows = vec![entry("pi-extensions", 432, 2)];
        assert_eq!(
            status_text(&windows, "", false, true),
            "Click, then type a name or number"
        );
        assert_eq!(
            status_text(&windows, "", true, true),
            "Type a name or number · ⏎ go"
        );
        assert!(status_text(&windows, "43", true, true).starts_with("#43"));
        assert_eq!(
            status_text(&windows, "ext", true, true),
            "ext▏ ⏎ pi-extensions"
        );
        assert_eq!(status_text(&windows, "zzz", true, true), "zzz▏ no match");
    }

    #[test]
    fn the_query_matches_names_anywhere_and_numbers_from_the_start() {
        let windows = vec![
            entry("pi-extensions", 43, 2),
            entry("dep-diet", 432, 2),
            entry("Text-Tools", 344, 3),
        ];
        let labels = |query: &str| -> Vec<String> {
            filter_entries(&windows, query)
                .iter()
                .map(|entry| entry.label.clone())
                .collect()
        };
        assert_eq!(labels("").len(), 3);
        assert_eq!(
            labels("ext"),
            ["pi-extensions", "Text-Tools"],
            "any case, anywhere"
        );
        assert_eq!(labels("43"), ["pi-extensions", "dep-diet"]);
        assert_eq!(labels("432"), ["dep-diet"]);
        assert!(labels("9").is_empty());
    }

    #[test]
    fn enter_goes_to_the_typed_number_or_the_first_named_match() {
        let windows = vec![entry("dep-diet", 432, 2), entry("pi-extensions", 43, 2)];
        assert_eq!(
            jump_choice_open(&windows, "43"),
            Some(JumpChoice::Window(43))
        );
        assert_eq!(
            jump_choice_open(&windows, "007"),
            Some(JumpChoice::Window(7)),
            "a number need not be listed"
        );
        assert_eq!(jump_choice_open(&windows, "1234567890"), None);
        assert_eq!(
            jump_choice_open(&windows, "d"),
            Some(JumpChoice::Card("card-432".into())),
            "the first listed match"
        );
        assert_eq!(jump_choice_open(&windows, "nothing"), None);
        let numbered = vec![entry("pi-0844-qualification", 12, 2), entry("x", 844, 2)];
        assert_eq!(
            jump_choice_open(&numbered, "844"),
            Some(JumpChoice::Window(844)),
            "a listed window number wins"
        );
        assert_eq!(
            jump_choice_open(&numbered[..1], "0844"),
            Some(JumpChoice::Card("card-12".into())),
            "digits inside a name, with no such window listed, go to that project"
        );
        assert_eq!(jump_choice_open(&windows, ""), None);
        assert_eq!(
            jump_choice(&windows, "1", false),
            None,
            "held only by hover, an unlisted number goes nowhere"
        );
        assert_eq!(
            jump_choice(&windows, "43", false),
            Some(JumpChoice::Window(43)),
            "a listed number still jumps"
        );
    }

    #[test]
    fn the_query_takes_name_characters_up_to_a_bound() {
        let mut query = String::new();
        assert!(push_query_char(&mut query, 'e'));
        assert!(push_query_char(&mut query, '-'));
        assert!(push_query_char(&mut query, '4'));
        assert!(!push_query_char(&mut query, ' '));
        assert!(!push_query_char(&mut query, '/'));
        for _ in 0..50 {
            push_query_char(&mut query, 'x');
        }
        assert_eq!(query.chars().count(), MAX_QUERY_CHARS);
    }

    #[test]
    fn each_row_names_its_workspace() {
        let mut named = entry("a", 1, 3);
        named.workspace_name = Some("claude-recovery".into());
        assert_eq!(workspace_tag(&named), "ws3");
        assert_eq!(workspace_title(&named), "workspace 3 · claude-recovery");
        assert_eq!(workspace_title(&entry("a", 1, 2)), "workspace 2");
    }
}
