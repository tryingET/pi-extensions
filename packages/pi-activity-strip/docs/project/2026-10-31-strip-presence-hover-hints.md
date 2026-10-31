---
summary: "Why the activity strip vanished in Ghostty/1Password and displaced hover focus, the as-is state model behind both, and the presence/engagement/keyboard model that replaces it, with progressive hotkey hints."
read_when:
  - "Changing when the strip is visible, or which windows count as an agent."
  - "Changing hover, keyboard-mode, scroll or regroup behaviour in the native panel."
  - "Changing the hotkey hints."
---

# Strip presence, hover stability and progressive hotkey hints

Operator report (2026-10-31): the strip disappears when focus is in nodecode, an `agent`, angelx, a plain Ghostty window or 1Password; hovering a card displaces the focus; and the keyboard shortcut is easy to forget.

## As-is: three owners of one interaction

Visibility, focus and keyboard state were each decided in a different place, and each place acted on the others' signals.

### 1. Controller visibility (Node)

- `classifyWorkspaceFocus` / `classifyAdmittedWindowFocus` returned `agent | non-agent | unknown | none`. `agent` meant *exactly one admitted card owns the focused window*.
- `FocusVisibility` made the strip eligible only for `agent`, or for `none` (Niri's NULL focus) while a hover/keyboard request was outstanding.
- So every window without a card was `non-agent` and hid the strip: 1Password, any Ghostty window running a plain shell, and every agent the catalog did not know. `nodecode`, Cursor's `agent` and the `angel` binary that `angelx` launches were not in `AGENT_CATALOG`, so their tabs had no card and their windows counted as foreign.

### 2. Projected focus (Node)

- `publishWindowFocus` handled Niri's NULL focused window by setting `focusKind = none` **and `focusedCardId = null`**.
- The panel takes the keyboard by switching its layer surface to exclusive keyboard mode. Niri then reports NULL focus. The controller blanked the focused card, the panel removed the ring and the brand fell back to session counts; when the panel released the keyboard Niri re-reported the terminal, the card came back as a *newly focused* card and the panel scrolled to it.

### 3. Panel engagement (GTK)

The panel held overlapping flags: `hovered: HashSet`, `keyboard_focused`, `keyboard_active` (explicit mode), `hover_keyboard` (request/grant/acquire/idle machine), `open_card_id`, `directory_open`, `directory_hovered`, `brand_hovered`, plus generations for delayed callbacks. One function, `leave_keyboard_mode`, was "the one way out" for every exit, and it ended keyboard, pointer engagement and expansion together.

## Root causes of "focus gets displaced on hover"

1. **GTK scroll-to-focus.** The cards sit in a `ScrolledWindow` whose automatic `Viewport` scrolls to any focused child. Hover-keyboard grant called `grab_focus` on `hovered.iter().next()` or, if that was empty, on the *first card*; the row jumped to put that card in view.
2. **Arbitrary hovered card.** `hovered` was a `HashSet`; with a leave/enter overlap two ids were present and `.iter().next()` picked either.
3. **Panel-induced NULL focus** (above): ring and brand vanished during hover typing, and the release re-announced the terminal card as a focus move, which scrolled it into view and ended the engagement.
4. **Idle release collapsed the hovered card.** About three seconds without typing ran `leave_keyboard_mode`, clearing `hovered` and collapsing the card that was still under a stationary pointer; the next pointer twitch re-expanded it.
5. **Regroup under the pointer.** The 15-second regroup reordered widgets while the pointer was over them, so the card under the pointer changed.
6. **Explicit entry at the first card.** The shortcut selected `order.first()`, scrolling a long row back to its start.

## New model

### Presence (controller)

- `FocusKind` gains `neutral`: the focused window is not a card's but belongs to a *presence app* (`src/common/presence-apps.mjs`). Defaults: `com.mitchellh.ghostty`, `com.tryinget.ghosttysidequest`, `com.onepassword.OnePassword`, `1Password`; `PI_ACTIVITY_STRIP_PRESENCE_APP_IDS` adds, removes (`-id`), empties (`none`) or opens (`*`) the set.
- `agent` and `neutral` are both *sources*: the strip is visible and admits the shortcut and hover typing. A neutral source names a window, never a card, so it has no "you are here" ring; jump intents are bound to that window's identity (`sourceIdentity(ws, win, undefined)`) and rejected if focus moved.
- The catalog learns `nodecode`, `angel` (what `angelx` executes) and Cursor's `agent` command, so those tabs become cards and their windows count as agents. `angelx` itself is a Python launcher whose `comm` is `angelx` and is not matched; its child is.
- NULL focus on the same workspace keeps `focusedCardId`. A NULL caused by the panel's own keyboard grab therefore changes nothing visible; a workspace change still clears it.

### Engagement vs. keyboard (panel)

The panel now separates two things that used to end together:

| | ends on |
|---|---|
| **Engagement** (pointer inside, hovered card/brand/list open) | pointer leaves the panel, Escape, activation/jump, explicit toggle, loss of eligibility or epoch |
| **Keyboard ownership** (hover grant or explicit mode) | everything above, plus idle timeout, an interrupting key, or the window losing activation outside explicit mode |

- `release_keyboard` returns the keyboard and clears the query but leaves engagement alone; `leave_keyboard_mode` remains the full exit.
- `hovered` is an `Option`: the last entered card wins and a stale leave cannot clear a newer enter.
- The viewport no longer scrolls to focus (`set_scroll_to_focus(false)`). A hover grant focuses the hovered card or a non-scrolling focus sink on the body, never the first card. Explicit entry starts at the hovered card, else the focused window's card, else the first fully visible card; arrow moves scroll explicitly to show the newly focused card.
- Scrolling to a newly focused window and the 15-second regroup are deferred while the pointer is inside or the panel owns the keyboard; the deferred scroll runs when both end.

### Progressive hints

`native/panel/src/hints.rs` owns the wording. The controller reads the chord from the Niri bind that spawns `focus-strip` (`src/native/strip-hotkey.mjs`, override `PI_ACTIVITY_STRIP_HOTKEY`) and sends it as `view.hotkey`.

1. Card and brand tooltips name the shortcut; the brand tooltip adds the key map.
2. The expanded list's status line says what the keyboard can do now (`Click or Super+Shift+A to type`).
3. Keyboard mode replaces the brand's project/folder lines with `⌨ KEYBOARD MODE` / `←→ move · ⏎ open · Esc`.

No chord is invented when none is bound.

## Verification

- Node unit suite: presence classification and env grammar (`tests/presence-focus.test.mjs`), hotkey discovery (`tests/strip-hotkey.test.mjs`), catalog recognition, NULL-focus retention in projection.
- Rust unit tests: hint wording and width budget.
- Isolated nested-Niri GUI harness (`tests/support/isolated-niri-check.mjs`, Rust `app_gui_tests.rs`): a 1Password-id fixture keeps the strip visible and admits the shortcut; idle and interrupt release keep the hovered ribbon open; explicit entry starts at the focused card.
