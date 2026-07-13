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

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-context-overlay-v0.1.0...pi-context-overlay-v0.2.0) (2026-07-13)


### Features

* adopt engineering-core package surfaces ([c4a28c1](https://github.com/tryingET/pi-extensions/commit/c4a28c12c6077ba5b17909bcde3354bb1249e8d0))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))

## [Unreleased]

### Added

- Promoted the former local `~/.pi/agent/extensions/context-overlay` implementation into the standalone `@tryinget/pi-context-overlay` package under `packages/pi-context-overlay`.
- Added the `/c` command, overlay component, snapshot store, token estimation helpers, grouping logic, and `context-report` prompt as package-owned assets.
- Added package-local live-smoke and handoff artifacts so the overlay can be revalidated after Pi host/runtime changes.

### Changed

- Reworked live snapshot sync to rebuild from `ctx.sessionManager` on `session_start`, `session_tree`, and `session_compact` instead of depending on legacy `session_switch` behavior.
- Hardened host compatibility for current Pi 0.65-era key-hint and launcher/file-open behavior while keeping the package operator-focused and standalone.

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.
