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

/// Pre-parsed query facts computed once per search pass instead of per directory entry.
struct ParsedQuery {
    needle: String,
    win_digits: Option<String>,
    win_number: Option<i64>,
    ak_bare: bool,
    ak_digits: Option<String>,
    ak_number: Option<i64>,
    ak_title_needle: Option<String>,
    session_stripped: String,
    session_compact: String,
    session_explicit: bool,
    session_can_prefix: bool,
    session_can_substring: bool,
}

impl ParsedQuery {
    fn new(query: &str) -> Self {
        let needle = query.to_lowercase();
        let win_digits = window_number_digits(&needle).map(str::to_owned);
        let win_number = win_digits.as_deref().and_then(parse_positive_id);
        let ak_bare = matches!(needle.as_str(), "ak" | "ak-" | "ak:");
        let ak_digits = needle
            .strip_prefix("ak")
            .and_then(|rest| {
                let d = rest
                    .strip_prefix('-')
                    .or_else(|| rest.strip_prefix(':'))
                    .unwrap_or(rest);
                (!d.is_empty() && d.chars().all(|c| c.is_ascii_digit())).then(|| d.to_owned())
            })
            .or_else(|| win_digits.clone());
        let ak_number = ak_digits.as_deref().and_then(parse_positive_id);
        let ak_title_needle = match needle
            .strip_prefix("ak:")
            .or_else(|| needle.strip_prefix("ak-"))
        {
            Some(r) if !r.is_empty() && !r.chars().all(|c| c.is_ascii_digit()) => Some(r.into()),
            _ if needle.chars().count() >= MIN_TASK_TITLE_CHARS => Some(needle.clone()),
            _ => None,
        };
        let (stripped, session_explicit) = strip_session_prefix(&needle);
        let session_stripped = stripped.to_owned();
        let session_compact: String = session_stripped.chars().filter(|c| *c != '-').collect();
        let min_prefix = if session_explicit {
            1
        } else if session_compact.chars().all(|c| c.is_ascii_digit()) {
            MIN_BARE_SESSION_SUBSTRING
        } else if session_compact.chars().all(|c| c.is_ascii_hexdigit()) {
            MIN_BARE_SESSION_PREFIX
        } else {
            2
        };
        let min_sub = if session_explicit {
            1
        } else {
            MIN_BARE_SESSION_SUBSTRING
        };
        Self {
            session_can_prefix: !session_compact.is_empty() && session_compact.len() >= min_prefix,
            session_can_substring: !session_compact.is_empty() && session_compact.len() >= min_sub,
            needle,
            win_digits,
            win_number,
            ak_bare,
            ak_digits,
            ak_number,
            ak_title_needle,
            session_stripped,
            session_compact,
            session_explicit,
        }
    }
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
    let parsed = ParsedQuery::new(query);
    let mut ranked: Vec<(u8, usize, FilteredEntry<'a>)> = windows
        .iter()
        .enumerate()
        .filter_map(|(index, entry)| {
            let kind = match_parsed(entry, &parsed)?;
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

/// Resolve Enter's target directly from an already-computed filtered list (single pass).
pub fn resolve_choice_from_shown(
    windows: &[WindowEntry],
    shown: &[FilteredEntry<'_>],
    query: &str,
    allow_unlisted: bool,
    selected_card_id: Option<&str>,
) -> Option<JumpChoice> {
    if query.is_empty() {
        return None;
    }
    if let Some(selected) = selected_card_id
        && shown.iter().any(|item| item.entry.card_id == selected)
    {
        return Some(JumpChoice::Card(selected.to_owned()));
    }
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

/// What Enter does when the operator may also have stepped through filtered matches with ↑/↓.
pub fn jump_choice_with_selection(
    windows: &[WindowEntry],
    query: &str,
    allow_unlisted: bool,
    selected_card_id: Option<&str>,
) -> Option<JumpChoice> {
    if query.is_empty() {
        return None;
    }
    let shown = filter_entries_with_matches(windows, query);
    resolve_choice_from_shown(windows, &shown, query, allow_unlisted, selected_card_id)
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
    let current =
        match resolve_choice_from_shown(windows, &shown, query, allow_unlisted, current_selected) {
            Some(JumpChoice::Card(card_id)) => {
                shown.iter().position(|item| item.entry.card_id == card_id)
            }
            Some(JumpChoice::Window(id)) => {
                shown.iter().position(|item| item.entry.window_id == id)
            }
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

#[cfg(test)]
pub fn jump_choice(
    windows: &[WindowEntry],
    query: &str,
    allow_unlisted: bool,
) -> Option<JumpChoice> {
    jump_choice_with_selection(windows, query, allow_unlisted, None)
}

/// Classify the strongest match of `query` against one directory entry.
#[cfg(test)]
pub fn match_entry(entry: &WindowEntry, query: &str) -> Option<MatchKind> {
    if query.is_empty() {
        return None;
    }
    match_parsed(entry, &ParsedQuery::new(query))
}

fn match_parsed(entry: &WindowEntry, parsed: &ParsedQuery) -> Option<MatchKind> {
    if parsed.win_number == Some(entry.window_id) {
        return Some(MatchKind::WindowExact);
    }
    let ak_match = match_ak_task_id(&entry.ak_tasks, parsed);
    if let Some(kind @ (MatchKind::AkTaskExactActive(_) | MatchKind::AkTaskExactBadge(_))) =
        ak_match
    {
        return Some(kind);
    }
    if entry.label.to_lowercase().contains(&parsed.needle) {
        return Some(MatchKind::Label);
    }
    if let Some(kind) = ak_match {
        return Some(kind);
    }
    if let Some(sid) = match_session_id(&entry.session_ids, parsed) {
        return Some(MatchKind::SessionId(sid.to_owned()));
    }
    if let Some(kind) = match_ak_task_title(&entry.ak_tasks, parsed) {
        return Some(kind);
    }
    if let Some(digits) = parsed.win_digits.as_deref()
        && entry.window_id.to_string().starts_with(digits)
    {
        return Some(MatchKind::WindowPrefix);
    }
    None
}

/// Format the directory status line directly from an already-computed filtered list and choice.
pub fn format_status_from_shown(
    shown: &[FilteredEntry<'_>],
    query: &str,
    choice: Option<&JumpChoice>,
    can_type: bool,
    hotkey: Option<&str>,
) -> String {
    if !can_type {
        // The keyboard was handed back (hover timeout); a click or the shortcut takes it again.
        return crate::hints::pointer_prompt(hotkey);
    }
    if query.is_empty() {
        return "Type name, #, AK, or id · ⏎".to_owned();
    }
    let display_query = compact_query_tail(query, 14);
    match choice {
        Some(JumpChoice::Window(_)) => {
            let shown_num = query.strip_prefix('#').unwrap_or(query);
            format!("#{shown_num}▏ ⏎ jump · ⌫ edit")
        }
        Some(JumpChoice::Card(card_id)) => {
            let item = shown.iter().find(|item| item.entry.card_id == *card_id);
            let label = item.map(|i| i.entry.label.as_str()).unwrap_or("match");
            match item.and_then(|i| i.match_kind.as_ref()) {
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
    if !can_type || query.is_empty() {
        return format_status_from_shown(&[], query, None, can_type, hotkey);
    }
    let shown = filter_entries_with_matches(windows, query);
    let choice =
        resolve_choice_from_shown(windows, &shown, query, allow_unlisted, selected_card_id);
    format_status_from_shown(&shown, query, choice.as_ref(), can_type, hotkey)
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

fn match_ak_task_id(tasks: &[AkTask], parsed: &ParsedQuery) -> Option<MatchKind> {
    if tasks.is_empty() {
        return None;
    }
    if parsed.ak_bare {
        return tasks
            .iter()
            .find(|task| task.is_active())
            .cloned()
            .map(MatchKind::AkTaskPrefixActive)
            .or_else(|| tasks.first().cloned().map(MatchKind::AkTaskPrefixBadge));
    }
    let digits = parsed.ak_digits.as_deref()?;
    let ordered = tasks
        .iter()
        .filter(|task| task.is_active())
        .chain(tasks.iter().filter(|task| !task.is_active()));
    let mut prefix_match = None;
    for task in ordered {
        if parsed.ak_number == Some(task.id) {
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

fn match_ak_task_title(tasks: &[AkTask], parsed: &ParsedQuery) -> Option<MatchKind> {
    let title_needle = parsed.ak_title_needle.as_deref()?;
    if tasks.is_empty() {
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

fn match_session_id<'a>(session_ids: &'a [String], parsed: &ParsedQuery) -> Option<&'a str> {
    if session_ids.is_empty() {
        return None;
    }
    if parsed.session_explicit && parsed.session_stripped.is_empty() {
        return session_ids.first().map(String::as_str);
    }
    if !parsed.session_can_prefix && !parsed.session_can_substring {
        return None;
    }
    let mut substring_hit = None;
    for sid in session_ids {
        let lower = sid.to_lowercase();
        let sid_compact: String = lower.chars().filter(|c| *c != '-').collect();
        if parsed.session_can_prefix
            && (lower.starts_with(&parsed.session_stripped)
                || sid_compact.starts_with(&parsed.session_compact))
        {
            return Some(sid.as_str());
        }
        if parsed.session_can_substring
            && substring_hit.is_none()
            && (lower.contains(&parsed.session_stripped)
                || sid_compact.contains(&parsed.session_compact))
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
