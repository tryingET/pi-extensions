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

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-context-overlay-v0.1.0...pi-context-overlay-v0.2.0) (2026-04-14)


### Features

* harden Pi 0.65 compatibility and AK launcher ([b0a922c](https://github.com/tryingET/pi-extensions/commit/b0a922c25aa7a9f36c05a1e336306ed3b4ad96ef))
* **monorepo:** add packaged helpers and host-compat hardening ([0ec674c](https://github.com/tryingET/pi-extensions/commit/0ec674c9985875b315bae0929b102b04c1f4c666))


### Bug Fixes

* **context-overlay:** sync live snapshot from session_start ([f5a1043](https://github.com/tryingET/pi-extensions/commit/f5a10434c4cee0339747bd75b91146e69a584629))

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
