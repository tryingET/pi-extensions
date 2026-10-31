//! Progressive keyboard hints. The ribbon teaches its shortcut in three steps, each shown only
//! once the operator is already doing the step before it: every tooltip names the shortcut, the
//! list's status line says what the keyboard would do right now, and keyboard mode itself shows
//! the whole key map where the folder path normally is.

/// The whole key map, for the brand tooltip and the docs.
pub const KEY_MAP: &str =
    "←/→ move · Shift+←/→ reorder · Enter open\nType a name or window # to jump · Esc leaves";

/// Brand lines while keyboard mode is on: the key map replaces the folder path.
pub const KEYBOARD_EYEBROW: &str = "⌨ KEYBOARD MODE";
pub const KEYBOARD_META: &str = "←→ move · ⏎ open · Esc";

/// One line under each card's tooltip: the shortcut that reaches the ribbon without the mouse.
pub fn card_hint(hotkey: Option<&str>) -> Option<String> {
    hotkey.map(|key| format!("{key} drives the strip from the keyboard"))
}

/// The brand tooltip: where you are, then how to get here without the mouse.
pub fn brand_tooltip(cwd: Option<&str>, hotkey: Option<&str>) -> String {
    let keys = match hotkey {
        Some(key) => format!("{key} — keyboard mode\n{KEY_MAP}"),
        None => format!("Keyboard mode\n{KEY_MAP}"),
    };
    match cwd.filter(|cwd| !cwd.is_empty()) {
        Some(cwd) => format!("{cwd}\n\n{keys}"),
        None => keys,
    }
}

/// The list's prompt before it may type: the two ways to hand it the keyboard.
pub fn pointer_prompt(hotkey: Option<&str>) -> String {
    match hotkey {
        Some(key) => format!("Click or {key} to type"),
        None => "Click, then type a name or number".to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_level_names_the_bound_shortcut_and_none_invents_one() {
        assert_eq!(card_hint(None), None);
        assert!(
            card_hint(Some("Super+Shift+A"))
                .unwrap()
                .starts_with("Super+Shift+A")
        );
        assert!(pointer_prompt(Some("Super+Shift+A")).contains("Super+Shift+A"));
        assert_eq!(pointer_prompt(None), "Click, then type a name or number");
        let tooltip = brand_tooltip(Some("/home/me/repo"), Some("Super+Shift+A"));
        assert!(tooltip.starts_with("/home/me/repo\n\nSuper+Shift+A"));
        assert!(tooltip.contains("Esc leaves"));
        assert!(brand_tooltip(Some(""), None).starts_with("Keyboard mode"));
    }

    #[test]
    fn the_keyboard_mode_lines_fit_the_brand_column() {
        // BRAND_WIDTH is 196 px; the meta font fits about 26 characters before ellipsizing.
        assert!(KEYBOARD_META.chars().count() <= 26);
        assert!(KEYBOARD_EYEBROW.chars().count() <= 26);
    }
}
