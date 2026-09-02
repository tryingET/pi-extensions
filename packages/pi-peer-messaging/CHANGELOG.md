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

## [0.4.0](https://github.com/tryingET/pi-extensions/compare/pi-peer-messaging-v0.3.0...pi-peer-messaging-v0.4.0) (2026-09-02)


### Features

* land supervision-ux candidate work — company provenance, observer suppression, bounded intercom ledger (AK 5324) ([6ebdc26](https://github.com/tryingET/pi-extensions/commit/6ebdc26fc3ddd9593462c6183a2715215bb61a2b))

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-peer-messaging-v0.2.2...pi-peer-messaging-v0.3.0) (2026-08-29)


### Features

* **file-budget:** exception remaining repo debt and ratchet every gate ([89b9faa](https://github.com/tryingET/pi-extensions/commit/89b9faa30bf47ef9f7d17730aa2c771d12bfca4f))


### Bug Fixes

* **monorepo:** isolate provider-free release checks ([2a7c28c](https://github.com/tryingET/pi-extensions/commit/2a7c28cce24a8791f02db404eecdc56e4f8e558c))
* **orchestrator:** promote governed runtime pins to the 0.84.3 host line ([9b2fda4](https://github.com/tryingET/pi-extensions/commit/9b2fda4721d37cbfbfc161cd79a971addabe58ea))

## [0.2.2](https://github.com/tryingET/pi-extensions/compare/pi-peer-messaging-v0.2.1...pi-peer-messaging-v0.2.2) (2026-08-15)


### Bug Fixes

* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-peer-messaging-v0.2.0...pi-peer-messaging-v0.2.1) (2026-08-01)


### Bug Fixes

* **peer-messaging:** survive socket resets ([2c82368](https://github.com/tryingET/pi-extensions/commit/2c823683e38e4e2941acc14ce6dac992122ebaf4))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-peer-messaging-v0.1.0...pi-peer-messaging-v0.2.0) (2026-07-13)


### Features

* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* **peer-messaging:** preview pending inbox ([d298338](https://github.com/tryingET/pi-extensions/commit/d2983389611eb4f57bf992af686a52a5e5733f3b))
* **peer-messaging:** surface peer freshness cues ([5a3b749](https://github.com/tryingET/pi-extensions/commit/5a3b7495ea45cff5880e8018c229359521a4be11))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))

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
