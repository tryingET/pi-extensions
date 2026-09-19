---
summary: "Changelog for scaffold evolution."
read_when:
  - "Preparing a release or reviewing history."
system4d:
  container: "Release log for this extension package."
  compass: "Track meaningful deltas per version."
  engine: "Document changes at release boundaries."
  fog: "Versioning policy may evolve with team preference."
---

# Changelog

All notable changes to this project should be documented here.

## Unreleased

### Features

- Show each card's Niri window id as a quiet `#43` chip, so a window an agent or tool names by id can be found on the ribbon; a hidden tab shows the window hosting it. The card detail adds the window and the workspace number the operator sees (`idx`, not the internal workspace id). The workspace number travels as a new optional card field under child protocol 1, so older panels ignore it.
- Draw the ribbon in Ghostty's own theme and follow the desktop between light and dark. The `theme` setting is resolved per colour scheme from the same files Ghostty reads, state colours reuse the terminal's meanings, and a change reloads one stylesheet rather than restarting the panel. `PI_ACTIVITY_STRIP_COLOR_SCHEME` pins one scheme.
- Draw the ribbon's surface fully opaque, so it stays the one fixed ground while inactive windows are dimmed by the compositor.
- Inset the surface by the compositor's own window gap on three sides and round it to the same radius as tiled windows, so the ribbon reads as a peer of them instead of a bar fused to the screen edge. The reservation grows from 84px to 92px accordingly.
- Replace the two floating panels with a single bar: one continuous surface with a hairline edge, a quiet identity block, and flat cards whose left edge carries their state.
- Report live Codex state on its cards: the running tool and its command, turn count, approval and sandbox policy, prompt and reply. Sessions are bound to processes through Codex's own thread index by an open rollout descriptor, or by being the only session created in that directory after the process started.
- Retire hook records left behind by sessions that ended without firing their end hook, once no live tab claims them and they have stopped being recent.
- Report live Claude Code state on its cards: topic, current tool and target, last prompt, latest reply, turn count and activity clock, read from the tail of the session transcript with no configuration. Optional hooks add the blocked-waiting-for-you state a transcript cannot express; `claude-hooks` prints the settings fragment and only low-frequency events are hooked, so nothing runs per tool call.
- Show cards for terminal agents other than Pi, discovered from the process table. Claude Code tabs are identified exactly through the per-session scratchpad the process holds open and the title it recorded, so they place in their window like Pi tabs; `PI_ACTIVITY_STRIP_AGENT_TABS=0` disables discovery.
- Restore tiled windows left at the previous working-area height when the ribbon's reserved band appears or disappears. Only windows still sitting at a height other windows just vacated are reset to automatic, so a deliberately chosen height is never touched; `PI_ACTIVITY_STRIP_HEIGHT_REPAIR=0` disables it.
- Show Pi sessions running in hidden Ghostty tabs on the workspace of their window. A surface is placed through its proven Ghostty host process when that process owns one window, or through the window remembered for that tab; multi-window hosts without that memory stay unplaced instead of guessed.
- Learn tab-to-window memory from a bounded read-only AT-SPI inventory of Ghostty tab labels, so tabs that were never shown while the strip ran are also placed. `doctor` reports whether that capability exists, and `PI_ACTIVITY_STRIP_TAB_INVENTORY=0` disables it.
- Remember both the Ghostty surface id and the 32-hex session token from each title, because a long-lived Pi process keeps the surface id it captured at startup while Ghostty can hand the same tab a new one; lookups still prefer the exact surface.
- Activate hidden-tab cards by presenting the surface through the host process's `org.gtk.Actions` `present-surface` action before focusing its window, and report success only after the window title proves the tab became visible.
- Mark hidden-tab cards with a `⧉` prefix, a `hidden tab` pid note, and matching tooltip/accessible text; `status` reports hidden-tab card, remembered-window, and unplaced-tab counts.
- Reconcile immediately on Niri window open/change/close and focus events so tab switches teach window memory between polls.
- Add calm 15-second active-first ordering with live keyed card updates and manual keyboard movement.
- Add rich hover/focus detail, accessible card navigation, exact fail-closed Ghostty focus, and a compositor-bindable `focus-strip` command.
- Follow the focused Niri workspace with a native Rust/Relm4/GTK4 layer-shell panel.
- Replace Electron and dynamic Niri-config struts with a compositor-owned 84px exclusive zone that disappears automatically when the panel hides or crashes.
- Add source-bound Linux x64 native artifacts, bounded child restart, parent-death cleanup, click-through input regions, and GTK accessible announcements.

### Changes

- `stop` now returns only once the runtime has exited and released its lock, so `strip:stop && strip:open` no longer loses the lock race and leaves no ribbon running. `open` names a lock still held by another runtime, and a controller that cannot be launched at all, instead of printing `stopped` and a timeout.
- Scope the native panel's GTK uniqueness to its Wayland display. A panel in a nested compositor, such as the built-in demo, now runs beside the live ribbon instead of handing itself to it and exiting 0 having drawn nothing, and a second panel on the same display fails with an error.
- Split transport liveness (`updatedAt`) from real activity (`lastEventAt`); heartbeat republishes no longer mask a frozen event stream, and cards with no lifecycle events for 15 minutes render as dimmed `stalled` instead of live activity.
- Classify provider-level run failures (`turn_end` with `stopReason: "error"`) as `error`/`Needs attention` instead of settling as `done`, and settle aborted runs as `Stopped`.
- Key broker publisher records by `(sessionId, publisherId)` while projecting one stable card per admitted Ghostty terminal surface; unbound duplicate publishers collapse to one logical-session containment card.
- Separate publisher, logical-session, terminal-surface, and renderer-card identities so duplicate session IDs cannot trigger perpetual Niri conceal/reveal reconciliation or shadow active work behind an idle publisher.
- Serialize publisher delivery, add monotonic publisher sequences, expire leases by broker receipt time, bound broker input/cardinality, and retry lost state transitions without allowing late writes to regress or resurrect state.
- Make publisher-record membership comparison reflexive, fix the latest-only worker finalization race, bound every Niri action, and prevent passive focus probes or main-issued collapse events from feeding redundant reconciliation.
- Collapse expanded detail when pointer leaves the strip or another desktop window becomes active; retain GTK focus only during explicit keyboard entry, clear stale engagement on Escape/hide/activation, and keep the 252px expanded surface on a fixed 84px exclusive zone.
- Make `focus-strip` a keyboard-mode toggle with wraparound Left/Right navigation and movement, Enter-only activation, and explicit pointer-hover isolation.
- Bind the native panel lifetime to its Node controller, coalesce backpressured view updates, and restart unexpected panel exits without leaving a reserved band.
- Recover exact Pi identities for already-running tabs only through validated process-bound `pi-session-presence` sidecars; otherwise retain the `/reload` fail-closed path.
- Prefer full hyphenless 32-hex Ghostty session identities while retaining 8-hex titles only when no legacy duplicate or migrated full title shares that prefix; mixed-version collisions fail closed until reload.

- Make interaction the default and retain `PI_ACTIVITY_STRIP_CLICK_THROUGH=1` as the explicit mouse-transparent escape hatch.

## [0.6.0](https://github.com/tryingET/pi-extensions/compare/pi-activity-strip-v0.5.0...pi-activity-strip-v0.6.0) (2026-09-19)


### Features

* **activity-strip:** clickable read-only AK task references on the ribbon (AK 5701) ([7e73557](https://github.com/tryingET/pi-extensions/commit/7e735572dd7aa4bb3eefc3be12260e1f3c48b09d))
* **activity-strip:** draw the ribbon fully opaque ([d40b39e](https://github.com/tryingET/pi-extensions/commit/d40b39ee15f4e4faaa4dbaa15942d6abd031fa1c))
* **activity-strip:** draw the ribbon fully opaque ([ecbc51d](https://github.com/tryingET/pi-extensions/commit/ecbc51da7edab969b7157c4405485a5fb759b12e))
* **activity-strip:** render session pid in card hover details and reset exclusive zone on hide ([6975a9c](https://github.com/tryingET/pi-extensions/commit/6975a9cea88ed88a602dd58414b3f32255c22e8c))
* **activity-strip:** show every agent tab, in Ghostty's own theme ([6823274](https://github.com/tryingET/pi-extensions/commit/68232749f64a6e9dc7b7775d5bea6f3603491445))
* **activity-strip:** show every agent tab, in Ghostty's own theme ([691807a](https://github.com/tryingET/pi-extensions/commit/691807a6f185150c54a2360c37e32131516ee0d6))


### Bug Fixes

* **activity-strip:** sit on the compositor's tighter gap rhythm ([4a6bd33](https://github.com/tryingET/pi-extensions/commit/4a6bd33955c23a417457da66286c9c27846ea619))
* **activity-strip:** sit on the compositor's tighter gap rhythm ([aab10b1](https://github.com/tryingET/pi-extensions/commit/aab10b1cd62bd85a9444ac4a96ddb0916ae19b63))

## [0.5.0](https://github.com/tryingET/pi-extensions/compare/pi-activity-strip-v0.4.0...pi-activity-strip-v0.5.0) (2026-09-01)


### Features

* **activity-strip:** replace Electron with native layer shell ([080dc4f](https://github.com/tryingET/pi-extensions/commit/080dc4f421757143d04124b2b3aaecbd659e6d0e))


### Bug Fixes

* **activity-strip:** make keyboard mode predictable ([b628192](https://github.com/tryingET/pi-extensions/commit/b628192a917680cc3d43f67f5de505e6aef3c506))
* **activity-strip:** persist shell on empty workspaces ([6168707](https://github.com/tryingET/pi-extensions/commit/616870788a3fc61dcc0059533aec65b9a8d4f301))
* **activity-strip:** release stale expansion focus ([5ed2613](https://github.com/tryingET/pi-extensions/commit/5ed2613291e0e4c1196b488a48b33259a7050421))
* **activity-strip:** stabilize terminal identity projection ([eb4abad](https://github.com/tryingET/pi-extensions/commit/eb4abad14e5dcfa7cdd5d7c707ce6f05b3122268))

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-activity-strip-v0.3.0...pi-activity-strip-v0.4.0) (2026-08-29)


### Features

* **file-budget:** exception remaining repo debt and ratchet every gate ([89b9faa](https://github.com/tryingET/pi-extensions/commit/89b9faa30bf47ef9f7d17730aa2c771d12bfca4f))


### Bug Fixes

* **activity-strip:** stop wedged streams from rendering as live activity ([d4f36e6](https://github.com/tryingET/pi-extensions/commit/d4f36e668cd68187289d34667c088a9283d96404))
* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **orchestrator:** promote governed runtime pins to the 0.84.3 host line ([9b2fda4](https://github.com/tryingET/pi-extensions/commit/9b2fda4721d37cbfbfc161cd79a971addabe58ea))
* **pi-activity-strip:** make packed smoke provider-free ([35c611e](https://github.com/tryingET/pi-extensions/commit/35c611e7b8a1caf2dc8b573e9358347467f77358))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-activity-strip-v0.2.0...pi-activity-strip-v0.3.0) (2026-08-15)


### Features

* **activity-strip:** add calm interactive session navigation ([812579c](https://github.com/tryingET/pi-extensions/commit/812579ca9d309df38a08baa5f4759eaad2bd04ee))
* **pi-activity-strip:** mark focused terminal and lead with monitoring cards ([0447756](https://github.com/tryingET/pi-extensions/commit/0447756af3c396b32b1f4fc73f4098d09e2d6025))
* **pi-activity-strip:** project focused-workspace Niri view with concealed self-recovery ([8fc1946](https://github.com/tryingET/pi-extensions/commit/8fc19464eed91b323a9cb8f93c46e9f4bab4f68a))


### Bug Fixes

* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-activity-strip-v0.1.0...pi-activity-strip-v0.2.0) (2026-07-11)


### Features

* **activity-strip:** show session freshness ([38489df](https://github.com/tryingET/pi-extensions/commit/38489dfb083b94bb1c146875799186e03fb79a9e))
* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* ignore activity strip client resets ([0384780](https://github.com/tryingET/pi-extensions/commit/0384780a3787080ca53d6c4c94d2b099e03fe619))

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.
