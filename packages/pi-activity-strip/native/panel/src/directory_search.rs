use crate::protocol::{AkTask, WindowEntry};

/// Enough digits for any Niri window id; a longer number is a typo, not a window.
const MAX_WINDOW_DIGITS: usize = 9;
/// Long enough for a full 36-char UUID, `session-<uuid>`, or `#agy:<uuid>`, yet bounded.
pub const MAX_QUERY_CHARS: usize = 64;
/// Minimum compact length for bare (unprefixed) UUID/hex session-id prefix matches.
const MIN_BARE_SESSION_PREFIX: usize = 3;
/// Minimum compact length for bare (unprefixed) session-id substring matches anywhere in an id.
const MIN_BARE_SESSION_SUBSTRING: usize = 4;
/// Minimum length for bare AK task title matches so 1-char typing stays crisp on project names.
const MIN_TASK_TITLE_CHARS: usize = 2;

/// What Enter does with the typed query.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum JumpChoice {
    /// A number: exactly that Niri window, listed or not.
    Window(i64),
    /// A listed entry (name, AK task, or session id), opened like clicking its row.
    Card(String),
}

/// Why a directory entry matched the current query, ordered from strongest to weakest tier.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MatchKind {
    WindowExact,
    AkTaskExactActive(AkTask),
    AkTaskExactBadge(AkTask),
    Label,
    AkTaskPrefixActive(AkTask),
    AkTaskPrefixBadge(AkTask),
    SessionId(String),
    AkTaskTitleActive(AkTask),
    AkTaskTitleBadge(AkTask),
    WindowPrefix,
}

impl MatchKind {
    fn rank(&self) -> u8 {
        match self {
            Self::WindowExact => 0,
            Self::AkTaskExactActive(_) => 1,
            Self::AkTaskExactBadge(_) => 2,
            Self::Label => 3,
            Self::AkTaskPrefixActive(_) => 4,
            Self::AkTaskPrefixBadge(_) => 5,
            Self::SessionId(_) => 6,
            Self::AkTaskTitleActive(_) => 7,
            Self::AkTaskTitleBadge(_) => 8,
            Self::WindowPrefix => 9,
        }
    }
}

#[derive(Clone, Debug)]
pub struct FilteredEntry<'a> {
    pub entry: &'a WindowEntry,
    pub match_kind: Option<MatchKind>,
}

/// Append a typed character: letters, digits, and separators of project names, AK refs, and ids.
pub fn push_query_char(query: &mut String, character: char) -> bool {
    if !is_query_char(character) || query.chars().count() >= MAX_QUERY_CHARS {
        return false;
    }
    query.push(character);
    true
}

pub fn is_query_char(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '-' | '_' | '.' | '#' | ':')
}

/// Entries matching the query, ranked by match tier (ties keep the controller's alphabetical
/// order); all entries unchanged when nothing is typed.
pub fn filter_entries_with_matches<'a>(
    windows: &'a [WindowEntry],
    query: &str,
) -> Vec<FilteredEntry<'a>> {
    if query.is_empty() {
        return windows
            .iter()
            .map(|entry| FilteredEntry {
                entry,
                match_kind: None,
            })
            .collect();
    }
    let mut ranked: Vec<(u8, usize, FilteredEntry<'a>)> = windows
        .iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            let kind = match_entry(entry, query)?;
            Some((
                kind.rank(),
                index,
                FilteredEntry {
                    entry,
                    match_kind: Some(kind),
                },
            ))
        })
        .collect();
    ranked.sort_by_key(|(rank, index, _)| (*rank, *index));
    ranked.into_iter().map(|(_, _, item)| item).collect()
}

/// Entries matching the query (project name, window number, AK task, or session id); all of them
/// when nothing is typed.
#[cfg(test)]
pub fn filter_entries<'a>(windows: &'a [WindowEntry], query: &str) -> Vec<&'a WindowEntry> {
    filter_entries_with_matches(windows, query)
        .into_iter()
        .map(|item| item.entry)
        .collect()
}

/// What Enter does when the operator may also have stepped through filtered matches with ↑/↓.
/// A selected card still in the filtered list wins; otherwise the default `jump_choice` stands.
pub fn jump_choice_with_selection(
    windows: &[WindowEntry],
    query: &str,
    allow_unlisted: bool,
    selected_card_id: Option<&str>,
) -> Option<JumpChoice> {
    if query.is_empty() {
        return None;
    }
    if let Some(selected) = selected_card_id
        && filter_entries_with_matches(windows, query)
            .iter()
            .any(|item| item.entry.card_id == selected)
    {
        return Some(JumpChoice::Card(selected.to_owned()));
    }
    jump_choice(windows, query, allow_unlisted)
}

/// Move selection up (`-1`) or down (`+1`) through the filtered list with wraparound.
pub fn step_selection(
    windows: &[WindowEntry],
    query: &str,
    allow_unlisted: bool,
    current_selected: Option<&str>,
    direction: i32,
) -> Option<String> {
    if query.is_empty() {
        return None;
    }
    let shown = filter_entries_with_matches(windows, query);
    if shown.is_empty() {
        return None;
    }
    let current = match jump_choice_with_selection(windows, query, allow_unlisted, current_selected)
    {
        Some(JumpChoice::Card(card_id)) => {
            shown.iter().position(|item| item.entry.card_id == card_id)
        }
        Some(JumpChoice::Window(id)) => shown.iter().position(|item| item.entry.window_id == id),
        None => None,
    };
    let next = match current {
        Some(index) => {
            (index as i64 + i64::from(direction)).rem_euclid(shown.len() as i64) as usize
        }
        None if direction >= 0 => 0,
        None => shown.len() - 1,
    };
    Some(shown[next].entry.card_id.clone())
}

/// What Enter does. For a window-number query (bare digits or `#<digits>`): exact listed window
/// wins, then exact AK task id (active before badge), then project name, then 4+ digit session id,
/// then when `allow_unlisted` that exact unlisted window number (never a guessed completion). For
/// any other query (project name, `ak...`, session id, task title), Enter opens the top match.
pub fn jump_choice(
    windows: &[WindowEntry],
    query: &str,
    allow_unlisted: bool,
) -> Option<JumpChoice> {
    if query.is_empty() {
        return None;
    }
    let shown = filter_entries_with_matches(windows, query);
    if let Some(digits) = window_number_digits(query) {
        let number = parse_positive_id(digits);
        if let Some(id) = number
            && windows.iter().any(|entry| entry.window_id == id)
        {
            return Some(JumpChoice::Window(id));
        }
        if let Some(item) = shown.iter().find(|item| {
            matches!(
                item.match_kind,
                Some(
                    MatchKind::AkTaskExactActive(_)
                        | MatchKind::AkTaskExactBadge(_)
                        | MatchKind::Label
                        | MatchKind::SessionId(_)
                )
            )
        }) {
            return Some(JumpChoice::Card(item.entry.card_id.clone()));
        }
        return number.filter(|_| allow_unlisted).map(JumpChoice::Window);
    }
    shown
        .first()
        .map(|item| JumpChoice::Card(item.entry.card_id.clone()))
}

/// Classify the strongest match of `query` against one directory entry.
pub fn match_entry(entry: &WindowEntry, query: &str) -> Option<MatchKind> {
    if query.is_empty() {
        return None;
    }
    let needle = query.to_lowercase();
    let win_digits = window_number_digits(&needle);
    if let Some(digits) = win_digits
        && parse_positive_id(digits) == Some(entry.window_id)
    {
        return Some(MatchKind::WindowExact);
    }
    let ak_match = match_ak_task_id(&entry.ak_tasks, &needle);
    if let Some(kind @ (MatchKind::AkTaskExactActive(_) | MatchKind::AkTaskExactBadge(_))) =
        ak_match
    {
        return Some(kind);
    }
    if entry.label.to_lowercase().contains(&needle) {
        return Some(MatchKind::Label);
    }
    if let Some(kind) = ak_match {
        return Some(kind);
    }
    if let Some(sid) = match_session_id(&entry.session_ids, &needle) {
        return Some(MatchKind::SessionId(sid.to_owned()));
    }
    if let Some(kind) = match_ak_task_title(&entry.ak_tasks, &needle) {
        return Some(kind);
    }
    if let Some(digits) = win_digits
        && entry.window_id.to_string().starts_with(digits)
    {
        return Some(MatchKind::WindowPrefix);
    }
    None
}

#[cfg(test)]
pub fn status_text(
    windows: &[WindowEntry],
    query: &str,
    can_type: bool,
    allow_unlisted: bool,
    hotkey: Option<&str>,
) -> String {
    status_text_with_selection(windows, query, can_type, allow_unlisted, hotkey, None)
}

pub fn status_text_with_selection(
    windows: &[WindowEntry],
    query: &str,
    can_type: bool,
    allow_unlisted: bool,
    hotkey: Option<&str>,
    selected_card_id: Option<&str>,
) -> String {
    if !can_type {
        // The keyboard was handed back (hover timeout); a click or the shortcut takes it again.
        return crate::hints::pointer_prompt(hotkey);
    }
    if query.is_empty() {
        return "Type name, #, AK, or id · ⏎".to_owned();
    }
    let display_query = compact_query_tail(query, 14);
    match jump_choice_with_selection(windows, query, allow_unlisted, selected_card_id) {
        Some(JumpChoice::Window(_)) => {
            let shown = query.strip_prefix('#').unwrap_or(query);
            format!("#{shown}▏ ⏎ jump · ⌫ edit")
        }
        Some(JumpChoice::Card(card_id)) => {
            let entry = windows.iter().find(|entry| entry.card_id == card_id);
            let label = entry.map(|e| e.label.as_str()).unwrap_or("match");
            let kind = entry.and_then(|e| match_entry(e, query));
            match kind {
                Some(
                    MatchKind::AkTaskExactActive(task)
                    | MatchKind::AkTaskExactBadge(task)
                    | MatchKind::AkTaskPrefixActive(task)
                    | MatchKind::AkTaskPrefixBadge(task)
                    | MatchKind::AkTaskTitleActive(task)
                    | MatchKind::AkTaskTitleBadge(task),
                ) => format!("{display_query}▏ ⏎ AK{} · {label}", task.id),
                _ => format!("{display_query}▏ ⏎ {label}"),
            }
        }
        None => format!("{display_query}▏ no match"),
    }
}

fn window_number_digits(query: &str) -> Option<&str> {
    let digits = query.strip_prefix('#').unwrap_or(query);
    if !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) {
        Some(digits)
    } else {
        None
    }
}

fn parse_positive_id(digits: &str) -> Option<i64> {
    if digits.len() > MAX_WINDOW_DIGITS {
        return None;
    }
    digits.parse::<i64>().ok().filter(|id| *id > 0)
}

fn match_ak_task_id(tasks: &[AkTask], needle: &str) -> Option<MatchKind> {
    if tasks.is_empty() {
        return None;
    }
    if matches!(needle, "ak" | "ak-" | "ak:") {
        return tasks
            .iter()
            .find(|task| task.is_active())
            .cloned()
            .map(MatchKind::AkTaskPrefixActive)
            .or_else(|| tasks.first().cloned().map(MatchKind::AkTaskPrefixBadge));
    }
    let digits = if let Some(rest) = needle.strip_prefix("ak") {
        let rest = rest
            .strip_prefix('-')
            .or_else(|| rest.strip_prefix(':'))
            .unwrap_or(rest);
        (!rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())).then_some(rest)
    } else {
        window_number_digits(needle)
    }?;
    let exact = parse_positive_id(digits);
    let ordered = tasks
        .iter()
        .filter(|task| task.is_active())
        .chain(tasks.iter().filter(|task| !task.is_active()));
    let mut prefix_match = None;
    for task in ordered {
        if exact == Some(task.id) {
            return Some(if task.is_active() {
                MatchKind::AkTaskExactActive(task.clone())
            } else {
                MatchKind::AkTaskExactBadge(task.clone())
            });
        }
        if prefix_match.is_none() && task.id.to_string().starts_with(digits) {
            prefix_match = Some(if task.is_active() {
                MatchKind::AkTaskPrefixActive(task.clone())
            } else {
                MatchKind::AkTaskPrefixBadge(task.clone())
            });
        }
    }
    prefix_match
}

fn match_ak_task_title(tasks: &[AkTask], needle: &str) -> Option<MatchKind> {
    if tasks.is_empty() {
        return None;
    }
    let (title_needle, explicit) = match needle
        .strip_prefix("ak:")
        .or_else(|| needle.strip_prefix("ak-"))
    {
        Some(rest) if !rest.is_empty() && !rest.chars().all(|c| c.is_ascii_digit()) => (rest, true),
        _ => (needle, false),
    };
    if !explicit && title_needle.chars().count() < MIN_TASK_TITLE_CHARS {
        return None;
    }
    tasks
        .iter()
        .filter(|task| task.is_active())
        .find(|task| task.title.to_lowercase().contains(title_needle))
        .cloned()
        .map(MatchKind::AkTaskTitleActive)
        .or_else(|| {
            tasks
                .iter()
                .filter(|task| !task.is_active())
                .find(|task| task.title.to_lowercase().contains(title_needle))
                .cloned()
                .map(MatchKind::AkTaskTitleBadge)
        })
}

pub(crate) fn strip_session_prefix(needle: &str) -> (&str, bool) {
    let trimmed = needle.strip_prefix('#').unwrap_or(needle);
    for prefix in [
        "session-",
        "session:",
        "sid:",
        "id:",
        "pi:",
        "claude:",
        "codex:",
        "agy:",
        "agy-",
        "nodecode:",
    ] {
        if let Some(rest) = trimmed.strip_prefix(prefix) {
            return (rest, true);
        }
    }
    (needle, false)
}

fn match_session_id<'a>(session_ids: &'a [String], needle: &str) -> Option<&'a str> {
    if session_ids.is_empty() {
        return None;
    }
    let (stripped, explicit) = strip_session_prefix(needle);
    let compact: String = stripped.chars().filter(|c| *c != '-').collect();
    if explicit && stripped.is_empty() {
        return session_ids.first().map(String::as_str);
    }
    if compact.is_empty() {
        return None;
    }
    let all_digits = compact.chars().all(|c| c.is_ascii_digit());
    let all_hex = compact.chars().all(|c| c.is_ascii_hexdigit());
    let min_prefix = if explicit {
        1
    } else if all_digits {
        MIN_BARE_SESSION_SUBSTRING
    } else if all_hex {
        MIN_BARE_SESSION_PREFIX
    } else {
        2
    };
    let min_substring = if explicit {
        1
    } else {
        MIN_BARE_SESSION_SUBSTRING
    };
    let mut substring_hit = None;
    for sid in session_ids {
        let lower = sid.to_lowercase();
        let sid_compact: String = lower.chars().filter(|c| *c != '-').collect();
        if compact.len() >= min_prefix
            && (lower.starts_with(stripped) || sid_compact.starts_with(&compact))
        {
            return Some(sid.as_str());
        }
        if substring_hit.is_none()
            && compact.len() >= min_substring
            && (lower.contains(stripped) || sid_compact.contains(&compact))
        {
            substring_hit = Some(sid.as_str());
        }
    }
    substring_hit
}

fn compact_query_tail(query: &str, max_chars: usize) -> String {
    let count = query.chars().count();
    if count <= max_chars {
        return query.to_owned();
    }
    let tail: String = query.chars().skip(count - (max_chars - 1)).collect();
    format!("…{tail}")
}

#[cfg(test)]
#[path = "directory_search_tests.rs"]
mod tests;
