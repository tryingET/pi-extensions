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
