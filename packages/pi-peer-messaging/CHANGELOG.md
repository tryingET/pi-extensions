---
summary: "Changelog for the pi-peer-messaging package."
read_when:
  - "Preparing a release or reviewing package history."
system4d:
  container: "Release log for the same-machine peer-session messaging package."
  compass: "Track meaningful deltas while keeping communication separate from authority."
  engine: "Document stable core, adapter, and release-boundary changes."
  fog: "Intercom compatibility can be mistaken for orchestration or evidence authority."
---

# Changelog

All notable changes to this project should be documented here.

## [Unreleased]

### Fixed

- Keep the registered peer client's transport-error listener attached until socket close so a Unix-socket `ECONNRESET` follows the existing disconnect/reconnect path instead of escaping as a Pi-level uncaught exception.

## [0.1.0] - 2026-05-17

### Added

- Add the stable same-machine peer-session messaging core with presence, exact targeting, fail-closed duplicate-name delivery, direct `send`, and correlated bounded `ask` semantics.
- Add the deterministic local broker/client runtime and package-local `intercom` adapter surface.
- Add runtime identity preflight via `intercom({ action: "status" })` with runtime-only identity proof details.
- Add canonical `PEER_ACK` / `PEER_FINAL` protocol status and watch support by `peerRunId`, plus legacy `QUEST_ACK` / `QUEST_FINAL` compatibility by `questId`.

### Fixed

- Isolate canonical peer and legacy quest protocol ledgers so colliding `peerRunId` / `questId` strings cannot satisfy the wrong watch/status vocabulary.
