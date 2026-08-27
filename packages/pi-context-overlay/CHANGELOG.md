---
summary: "Changelog for package evolution and release notes."
read_when:
  - "Preparing a release or reviewing package history."
system4d:
  container: "Release log for the context-overlay package."
  compass: "Track meaningful operator-visible and maintenance-relevant deltas."
  engine: "Capture pre-release change history -> cut release -> preserve a usable audit trail."
  fog: "The main risk is leaving the changelog at scaffold-only fidelity after real package work has landed."
---

# Changelog

All notable changes to this project should be documented here.

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-context-overlay-v0.2.1...pi-context-overlay-v0.3.0) (2026-08-27)


### Features

* **context-core:** child-arena rollup — direct-child fork costs attributed, arenas never merged ([577b57a](https://github.com/tryingET/pi-extensions/commit/577b57accac1fb611fe43cb752aeae23d4770e5b))
* **context-core:** declare strata.json IR contract + resolve RFC review round 2 ([703f69b](https://github.com/tryingET/pi-extensions/commit/703f69bad6f1e143e2348fbff31eed8511d36c95))
* **context-core:** discharge the wire-order evidence gate — measured drift bound across 5 provider identities ([85afdcf](https://github.com/tryingET/pi-extensions/commit/85afdcff23ac07774bfa6b76bfac615ba185677c))
* **context-core:** P3 compaction tradeoff calculator — first wire-order-licensed instrument ([5666800](https://github.com/tryingET/pi-extensions/commit/566680040f69addd4396308a741cf0f241573cec))
* **context-core:** resolve ADR conditions — unsupported-major IR gate, estimator convention, wire-order gate, ADR ([afaad77](https://github.com/tryingET/pi-extensions/commit/afaad776084725ef8982ff58f024cb7b4d5ce114))
* **context-core:** ship meta.cwd measured provenance; verified by dogfooding ([748ae33](https://github.com/tryingET/pi-extensions/commit/748ae33034de504d015ff6f6b0221153292790aa))
* **corpus:** fork-spend labeling decided and shipped — quantities separated, inclusive computed-at-query ([11f45e5](https://github.com/tryingET/pi-extensions/commit/11f45e556a3c10888c097f400ba0ef56734cafac))
* **pi-context-corpus:** measured provenance + build-time ordering from adjudication follow-up ([390d7bd](https://github.com/tryingET/pi-extensions/commit/390d7bd2102eaf95fb71bbdedbb4b3b7d7d44230))
* **pi-context-overlay:** context core prototype — session JSONL allocator replay + stratigraphy artifact ([6757a32](https://github.com/tryingET/pi-extensions/commit/6757a328e7b02b2b9ec1e02b8089ccbac13513a8))
* **pi-context-overlay:** open file-backed items in $EDITOR from /c ([c0cd52a](https://github.com/tryingET/pi-extensions/commit/c0cd52ad7fcf4616fd464b6f87692e432c5f7b15))
* **pi-context-overlay:** P2 live TUI — occupancy strip and icicle inspector ([4d615b7](https://github.com/tryingET/pi-extensions/commit/4d615b7d95c17b57a7696e4cdcbf7134e3a24104))


### Bug Fixes

* **monorepo:** isolate install-only release checks ([e83c9bd](https://github.com/tryingET/pi-extensions/commit/e83c9bdefbcf5406e8eb4be6beef7245ed0eb655))
* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **pi-context-overlay:** close forensic debt — path-qualified liveness, post-fault runway ([2dc3994](https://github.com/tryingET/pi-extensions/commit/2dc39943f9647f1040f176282a1c59221188551a))
* **pi-context-overlay:** honest editor launch — killed is failure, -e detaches ([7ad6790](https://github.com/tryingET/pi-extensions/commit/7ad67903a361d22a329b35624426593e29f7b2b5))
* **pi-context-overlay:** keep file-list arrows in icicle mode ([8e028d9](https://github.com/tryingET/pi-extensions/commit/8e028d9117a09ec407ca87e631cef3ac789a5f5c))
* **pi-context-overlay:** review the context-core prototype — conservation, chain walk, tests ([79d01f9](https://github.com/tryingET/pi-extensions/commit/79d01f92e867cd1a4c8680ca28ac2005a62cc9b0))
* **pi-context-overlay:** Tab cycles groups → icicle → files ([dd076b8](https://github.com/tryingET/pi-extensions/commit/dd076b8f9d8a5a061ba0865539450ac8acb3a8ed))

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-context-overlay-v0.2.0...pi-context-overlay-v0.2.1) (2026-08-15)


### Bug Fixes

* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-context-overlay-v0.1.0...pi-context-overlay-v0.2.0) (2026-07-13)


### Features

* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))

## [Unreleased]

### Added

- P2 live TUI: `/c` occupancy strip from host `ContextUsage`, icicle mode (`Tab`/`g`/`i`) for category → tool/file → item, and optional `turnIndex`/`ordinal` on context items. No runway (no live snapshot ring) and no fabricated cache warmth.
- Promoted the former local `~/.pi/agent/extensions/context-overlay` implementation into the standalone `@tryinget/pi-context-overlay` package under `packages/pi-context-overlay`.
- Added the `/c` command, overlay component, snapshot store, token estimation helpers, grouping logic, and `context-report` prompt as package-owned assets.
- Added package-local live-smoke and handoff artifacts so the overlay can be revalidated after Pi host/runtime changes.

### Fixed

- `/c` keeps both languages: `i` uses icicle `←`/`→` frames and `↑`/`↓` depth; `Tab` hops to the file list so `↑`/`↓` select files again.
- `Enter` opens a file-backed item in `$VISUAL`/`$EDITOR` via zellij when present, otherwise Ghostty.
- Editor launch honesty: a host timeout kill is now a failure (never "opened"), `ghostty -e` is launched detached so the editor session is never signalled, the contract-violating `+new-window -e` payload was removed, and `/c` stays open on failure. Icicle frames are labeled `est` to keep estimated shares distinct from measured occupancy.

### Changed

- Reworked live snapshot sync to rebuild from `ctx.sessionManager` on `session_start`, `session_tree`, and `session_compact` instead of depending on legacy `session_switch` behavior.
- Hardened host compatibility for current Pi 0.65-era key-hint and launcher/file-open behavior while keeping the package operator-focused and standalone.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.
