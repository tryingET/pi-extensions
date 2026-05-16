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

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-little-helpers-v0.2.0...pi-little-helpers-v0.3.0) (2026-05-16)

### Added

- Add `html-output-browser` artifact helpers, including auto-open HTML output, clickable file links, `/artifacts`, `/show-artifacts`, and recent-artifact picking.
- Add `session-presence` support for exact Pi session identity, terminal titles, and hot-restore sidecars.
- Add `/sidequest` visible peer launching with Ghostty same-window tab attach and fallback window behavior.
- Add clean visible peer surfaces: `/scoutpeer`, `/parallelquest`, `fork_peer_spawn`, `scout_peer_spawn`, and `candidate_peer_spawn`.
- Add visible peer capability manifest and toolbox bundle projection for peer-spawn tool registration checks.
- Add `/visible-loop` for checkpointed visible iteration loops, with fresh Pi sessions per iteration and canonical intercom progress/final messages.
- Add candidate peer registry sidecars and exact cleanup command packets for worktree review/cleanup.

### Changed

- Prefer exact controller session targets and bounded `PEER_ACK` / `PEER_FINAL` report-back protocol for visible peers.
- Keep peer launch tools as standard Pi tools while retaining toolbox catalog/test alignment.
- Harden package behavior against Pi 0.65 host/typebox API changes.

### Fixed

- Harden Ghostty tab/window launching, title refresh, sidequest launch stability, and stash picker behavior.
- Reject ambiguous intercom parent targets and make disabled peer intercom behavior explicit.
- Gate visible-loop completion so iterations advance only after the intended final prompt finishes.
- Avoid stale peer slash-command guidance and static schema drift in peer-spawn tool surfaces.

## [0.2.0](https://github.com/tryingET/pi-little-helpers/compare/v0.1.3...v0.2.0) (2026-02-27)

### Changed

- **BREAKING**: Renamed package to `@tryinget/pi-little-helpers` (scoped)
- Update your install command: `pi install npm:@tryinget/pi-little-helpers`

## [0.1.3](https://github.com/tryingET/pi-little-helpers/compare/v0.1.2...v0.1.3) (2026-02-27)


### Bug Fixes

* move package-utils out of extensions folder ([c0a1154](https://github.com/tryingET/pi-little-helpers/commit/c0a1154cfb531272b6ce225708c466d45d06e8b8))

## [0.1.2](https://github.com/tryingET/pi-little-helpers/compare/v0.1.1...v0.1.2) (2026-02-27)

### Changed

- Simplified README: removed scaffold template language, added install instructions.
- Fixed EXTENSION_SOP.md: removed reference to deleted plans directory.
- Updated next_session_prompt.md with current state.

## [0.1.1](https://github.com/tryingET/pi-little-helpers/compare/v0.1.0...v0.1.1) (2026-02-27)

### Bug Fixes

- move package-utils out of extensions folder ([c0a1154](https://github.com/tryingET/pi-little-helpers/commit/c0a1154cfb531272b6ce225708c466d45d06e8b8))

## [0.1.0](https://github.com/tryingET/pi-little-helpers/compare/v0.0.0...v0.1.0) (2026-02-27)

### Added

- Initial release with `code-block-picker`, `package-update-notify`, and `stash` extensions.
- Published to npm.
