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

- Add calm 15-second active-first ordering with live keyed card updates and manual keyboard movement.
- Add rich hover/focus detail, accessible card navigation, exact fail-closed Ghostty focus, and a compositor-bindable `focus-strip` command.
- Follow the focused Niri workspace with a native Rust/Relm4/GTK4 layer-shell panel.
- Replace Electron and dynamic Niri-config struts with a compositor-owned 84px exclusive zone that disappears automatically when the panel hides or crashes.
- Add source-bound Linux x64 native artifacts, bounded child restart, parent-death cleanup, click-through input regions, and GTK accessible announcements.

### Changes

- Split transport liveness (`updatedAt`) from real activity (`lastEventAt`); heartbeat republishes no longer mask a frozen event stream, and cards with no lifecycle events for 15 minutes render as dimmed `stalled` instead of live activity.
- Classify provider-level run failures (`turn_end` with `stopReason: "error"`) as `error`/`Needs attention` instead of settling as `done`, and settle aborted runs as `Stopped`.
- Key broker publisher records by `(sessionId, publisherId)` while projecting one stable card per admitted Ghostty terminal surface; unbound duplicate publishers collapse to one logical-session containment card.
- Separate publisher, logical-session, terminal-surface, and renderer-card identities so duplicate session IDs cannot trigger perpetual Niri conceal/reveal reconciliation or shadow active work behind an idle publisher.
- Serialize publisher delivery, add monotonic publisher sequences, expire leases by broker receipt time, bound broker input/cardinality, and retry lost state transitions without allowing late writes to regress or resurrect state.
- Make publisher-record membership comparison reflexive, fix the latest-only worker finalization race, bound every Niri action, and prevent passive focus probes or main-issued collapse events from feeding redundant reconciliation.
- Collapse expanded detail when pointer/focus leaves the strip or another desktop window becomes active; expanded detail remains 252px while the exclusive zone stays fixed at 84px.
- Bind the native panel lifetime to its Node controller, coalesce backpressured view updates, and restart unexpected panel exits without leaving a reserved band.
- Recover exact Pi identities for already-running tabs only through validated process-bound `pi-session-presence` sidecars; otherwise retain the `/reload` fail-closed path.
- Prefer full hyphenless 32-hex Ghostty session identities while retaining 8-hex titles only when no legacy duplicate or migrated full title shares that prefix; mixed-version collisions fail closed until reload.

- Make interaction the default and retain `PI_ACTIVITY_STRIP_CLICK_THROUGH=1` as the explicit mouse-transparent escape hatch.

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
