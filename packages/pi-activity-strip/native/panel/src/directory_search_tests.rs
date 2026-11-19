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
        session_ids: Vec::new(),
        ak_tasks: Vec::new(),
    }
}

fn task(id: i64, title: &str, state: &str) -> AkTask {
    AkTask {
        id,
        title: title.into(),
        state: state.into(),
    }
}

#[test]
fn existing_project_name_and_window_number_semantics_are_preserved() {
    let windows = vec![
        entry("pi-extensions", 43, 2),
        entry("dep-diet", 432, 2),
        entry("Text-Tools", 344, 3),
    ];
    let labels = |q: &str| -> Vec<String> {
        filter_entries(&windows, q)
            .into_iter()
            .map(|e| e.label.clone())
            .collect()
    };
    assert_eq!(labels("").len(), 3);
    assert_eq!(labels("ext"), ["pi-extensions", "Text-Tools"]);
    assert_eq!(labels("43"), ["pi-extensions", "dep-diet"]);
    assert_eq!(labels("432"), ["dep-diet"]);
    assert!(labels("9").is_empty());

    let pair = vec![entry("dep-diet", 432, 2), entry("pi-extensions", 43, 2)];
    assert_eq!(jump_choice(&pair, "43", true), Some(JumpChoice::Window(43)));
    assert_eq!(jump_choice(&pair, "007", true), Some(JumpChoice::Window(7)));
    assert_eq!(jump_choice(&pair, "1234567890", true), None);
    assert_eq!(
        jump_choice(&pair, "d", true),
        Some(JumpChoice::Card("card-432".into()))
    );
    assert_eq!(jump_choice(&pair, "nothing", true), None);
    assert_eq!(jump_choice(&pair, "", true), None);
    assert_eq!(jump_choice(&pair, "1", false), None);
    assert_eq!(
        jump_choice(&pair, "43", false),
        Some(JumpChoice::Window(43))
    );

    let numbered = vec![entry("pi-0844-qualification", 12, 2), entry("x", 844, 2)];
    assert_eq!(
        jump_choice(&numbered, "844", true),
        Some(JumpChoice::Window(844))
    );
    assert_eq!(
        jump_choice(&numbered[..1], "0844", true),
        Some(JumpChoice::Card("card-12".into()))
    );
}

#[test]
fn ak_tasks_match_by_id_prefix_hash_and_title_with_active_priority() {
    let mut alpha = entry("alpha", 12, 2);
    alpha.ak_tasks = vec![task(5701, "Clickable AK references", "deferred")];
    let mut beta = entry("pi-extensions", 43, 3);
    beta.ak_tasks = vec![
        task(5701, "Clickable AK references", "active"),
        task(4220, "Control Decision 77 epoch", "orphaned"),
    ];
    let windows = vec![alpha, beta];

    for query in ["AK5701", "ak5701", "ak-5701", "ak:5701", "#5701", "5701"] {
        assert_eq!(
            jump_choice(&windows, query, true),
            Some(JumpChoice::Card("card-43".into())),
            "active claim beats deferred badge and unlisted window for {query}"
        );
        assert_eq!(
            jump_choice(&windows, query, false),
            Some(JumpChoice::Card("card-43".into())),
            "hover mode can jump to listed AK task card for {query}"
        );
    }
    assert_eq!(
        jump_choice(&windows, "ak57", true),
        Some(JumpChoice::Card("card-43".into()))
    );
    assert_eq!(
        jump_choice(&windows, "clickable", true),
        Some(JumpChoice::Card("card-43".into()))
    );
    assert_eq!(
        jump_choice(&windows, "ak:epoch", true),
        Some(JumpChoice::Card("card-43".into()))
    );
    assert_eq!(
        jump_choice(&windows, "4220", true),
        Some(JumpChoice::Card("card-43".into()))
    );
    // Listed window number still wins over an AK task with the same id.
    let mut collide = entry("win-5701", 5701, 4);
    collide.ak_tasks = Vec::new();
    let with_window = vec![windows[1].clone(), collide];
    assert_eq!(
        jump_choice(&with_window, "5701", true),
        Some(JumpChoice::Window(5701))
    );
}

#[test]
fn label_matches_rank_above_task_title_matches() {
    let mut alpha = entry("alpha", 12, 2);
    alpha.ak_tasks = vec![task(9001, "Fix ext handling", "active")];
    let beta = entry("pi-extensions", 43, 2);
    let windows = vec![alpha, beta];
    let shown = filter_entries(&windows, "ext");
    assert_eq!(shown[0].label, "pi-extensions");
    assert_eq!(shown[1].label, "alpha");
    assert_eq!(
        jump_choice(&windows, "ext", true),
        Some(JumpChoice::Card("card-43".into()))
    );
}

#[test]
fn session_ids_match_uuids_hyphenless_tokens_prefixes_and_non_uuid_ids() {
    let mut pi = entry("pi-extensions", 43, 2);
    pi.session_ids = vec!["01a0993a-d336-739f-a308-cfa4c21d6332".into()];
    let mut agy = entry("workstation", 88, 3);
    agy.session_ids = vec!["386c9894-bf72-4e6c-809c-a86913e8adfc".into()];
    let mut nodecode = entry("cells", 99, 4);
    nodecode.session_ids = vec!["nc-sess-42".into()];
    let windows = vec![pi, agy, nodecode];

    for query in [
        "01a",
        "01a0993a",
        "01a0993ad336",
        "cfa4c21d",
        "01a0993a-d336-739f-a308-cfa4c21d6332",
        "session-01a0993a",
        "sid:01a",
    ] {
        assert_eq!(
            jump_choice(&windows, query, true),
            Some(JumpChoice::Card("card-43".into())),
            "Pi session id query {query}"
        );
    }
    for query in ["#agy:386c9894", "agy:386c", "a86913e8"] {
        assert_eq!(
            jump_choice(&windows, query, true),
            Some(JumpChoice::Card("card-88".into())),
            "agy session id query {query}"
        );
    }
    assert_eq!(
        jump_choice(&windows, "nc-sess", true),
        Some(JumpChoice::Card("card-99".into()))
    );
}

#[test]
fn short_letters_and_numbers_do_not_false_match_uuid_substrings() {
    let mut pi = entry("pi-extensions", 432, 2);
    pi.session_ids = vec!["bad04399-dead-4321-beef-007123456789".into()];
    let windows = vec![pi];

    // 1-2 chars and 2-3 digit numbers never falsely match random UUID bytes.
    assert!(filter_entries(&windows, "de").is_empty());
    assert!(filter_entries(&windows, "99").is_empty());
    assert_eq!(
        jump_choice(&windows, "007", true),
        Some(JumpChoice::Window(7)),
        "3-digit number jumps to unlisted window rather than UUID substring"
    );
    // 3-char hex prefix DOES match from start, while 3-char mid-UUID hex does not.
    assert_eq!(
        jump_choice(&windows, "bad", true),
        Some(JumpChoice::Card("card-432".into()))
    );
    assert!(filter_entries(&windows, "ead").is_empty());
    // 4-char mid-UUID hex DOES match.
    assert_eq!(
        jump_choice(&windows, "dead", true),
        Some(JumpChoice::Card("card-432".into()))
    );
}

#[test]
fn status_line_and_subtitles_reflect_match_kind_and_query_bounds() {
    let mut pi = entry("pi-extensions", 432, 2);
    pi.ak_tasks = vec![task(5701, "Show clickable AK-task references", "active")];
    pi.session_ids = vec!["01a0993a-d336-739f-a308-cfa4c21d6332".into()];
    let windows = vec![pi];

    assert_eq!(
        status_text(&windows, "", false, true, None),
        "Click, then type to search"
    );
    assert_eq!(
        status_text(&windows, "", false, true, Some("Super+Shift+A")),
        "Click or Super+Shift+A to type"
    );
    assert_eq!(
        status_text(&windows, "", true, true, None),
        "Type name, #, AK, or id · ⏎"
    );
    assert!(status_text(&windows, "43", true, true, None).starts_with("#43"));
    assert!(status_text(&windows, "#43", true, true, None).starts_with("#43▏"));
    assert_eq!(
        status_text(&windows, "ext", true, true, None),
        "ext▏ ⏎ pi-extensions"
    );
    assert_eq!(
        status_text(&windows, "ak5701", true, true, None),
        "ak5701▏ ⏎ AK5701 · pi-extensions"
    );
    assert_eq!(
        status_text(&windows, "zzz", true, true, None),
        "zzz▏ no match"
    );

    let mut query = String::new();
    assert!(push_query_char(&mut query, '#'));
    assert!(push_query_char(&mut query, ':'));
    assert!(!push_query_char(&mut query, ' '));
    assert!(!push_query_char(&mut query, '/'));
    for _ in 0..100 {
        push_query_char(&mut query, 'x');
    }
    assert_eq!(query.chars().count(), MAX_QUERY_CHARS);
}

#[test]
fn up_and_down_step_through_filtered_matches_with_wraparound_and_enter_opens_selection() {
    let windows = vec![
        entry("pi-extensions", 43, 2),
        entry("pi-activity", 432, 3),
        entry("pi-modes", 500, 4),
    ];
    // Start at default first match ("card-43"); Down advances, Up wraps cleanly.
    let second = step_selection(&windows, "pi", true, None, 1);
    assert_eq!(second.as_deref(), Some("card-432"));
    assert_eq!(
        jump_choice_with_selection(&windows, "pi", true, second.as_deref()),
        Some(JumpChoice::Card("card-432".into()))
    );
    assert_eq!(
        status_text_with_selection(&windows, "pi", true, true, None, second.as_deref()),
        "pi▏ ⏎ pi-activity"
    );
    let third = step_selection(&windows, "pi", true, second.as_deref(), 1);
    assert_eq!(third.as_deref(), Some("card-500"));
    let wrapped_first = step_selection(&windows, "pi", true, third.as_deref(), 1);
    assert_eq!(wrapped_first.as_deref(), Some("card-43"));
    let wrapped_last = step_selection(&windows, "pi", true, None, -1);
    assert_eq!(wrapped_last.as_deref(), Some("card-500"));

    // Numeric query: default is exact window #43; Down selects prefix match #432 as a Card.
    let from_exact = step_selection(&windows, "43", true, None, 1);
    assert_eq!(from_exact.as_deref(), Some("card-432"));
    assert_eq!(
        jump_choice_with_selection(&windows, "43", true, from_exact.as_deref()),
        Some(JumpChoice::Card("card-432".into()))
    );

    // Numeric prefix with no exact window (#43 unlisted, #432 listed): Down picks #432.
    let only_prefix = vec![entry("pi-activity", 432, 3)];
    let from_unlisted = step_selection(&only_prefix, "43", true, None, 1);
    assert_eq!(from_unlisted.as_deref(), Some("card-432"));
    assert_eq!(
        jump_choice_with_selection(&only_prefix, "43", true, from_unlisted.as_deref()),
        Some(JumpChoice::Card("card-432".into()))
    );

    // Stale selection falls back cleanly; empty results return None.
    assert_eq!(
        jump_choice_with_selection(&windows, "pi", true, Some("gone-card")),
        Some(JumpChoice::Card("card-43".into()))
    );
    assert_eq!(step_selection(&windows, "zzz", true, None, 1), None);
    assert_eq!(step_selection(&windows, "", true, None, 1), None);
}
