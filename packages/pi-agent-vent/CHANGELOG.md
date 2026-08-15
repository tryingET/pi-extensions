---
summary: "Changelog for pi-agent-vent package releases."
read_when:
  - "Preparing a release or reviewing pi-agent-vent history."
system4d:
  container: "Release log for the pi-agent-vent extension package."
  compass: "Track meaningful package deltas at release boundaries."
  engine: "Summarize shipped behavior -> align package version -> release through monorepo component flow."
  fog: "Scaffold changelog text can hide the real first-release payload."
---

# Changelog

All notable changes to this project should be documented here.

## [0.2.2](https://github.com/tryingET/pi-extensions/compare/pi-agent-vent-v0.2.1...pi-agent-vent-v0.2.2) (2026-08-15)


### Bug Fixes

* **agent-vent,pi-eval-kernel:** scope scratch-root guards to environment truth ([d9b0cdb](https://github.com/tryingET/pi-extensions/commit/d9b0cdb8267f0f3b93875f0e212b11a1ded8843b))
* **agent-vent:** align self diagnostic handoff ([827ea92](https://github.com/tryingET/pi-extensions/commit/827ea92ecec5f0f0d3771beb364e07622ecbf9aa))
* **agent-vent:** isolate release probes under TMPDIR ([6ddc5a7](https://github.com/tryingET/pi-extensions/commit/6ddc5a74314caca81ccdcfcbc10c5e12f1e6e117))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-agent-vent-v0.2.0...pi-agent-vent-v0.2.1) (2026-08-15)


### Bug Fixes

* **agent-vent:** align self diagnostic handoff ([827ea92](https://github.com/tryingET/pi-extensions/commit/827ea92ecec5f0f0d3771beb364e07622ecbf9aa))
* **agent-vent:** isolate release probes under TMPDIR ([6ddc5a7](https://github.com/tryingET/pi-extensions/commit/6ddc5a74314caca81ccdcfcbc10c5e12f1e6e117))
* **release:** normalize package pack JSON under npm 12 ([5b7233b](https://github.com/tryingET/pi-extensions/commit/5b7233bce9ee98cedc95eb8defba91c50b6752d7))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-agent-vent-v0.1.2...pi-agent-vent-v0.2.0) (2026-07-13)


### Features

* **agent-vent:** normalize diagnostic category aliases ([d106565](https://github.com/tryingET/pi-extensions/commit/d10656558a1b972927311905713c86627dc8339e))
* **agent-vent:** preview diagnostic records ([1ff98c5](https://github.com/tryingET/pi-extensions/commit/1ff98c53feb7a17bc8b3b4e4bcee1bd5c31de30e))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))


### Bug Fixes

* **agent-vent:** avoid alias schema reload failure ([f1d5f16](https://github.com/tryingET/pi-extensions/commit/f1d5f16179dd61f70ace094a6ab6dd821c9f2f57))
* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* **pi-agent-vent:** pin host contract and isolate release npm policy ([dce9586](https://github.com/tryingET/pi-extensions/commit/dce9586f9389b7283b6195f3ba0ba1319943f070))

## [0.1.2] - 2026-05-22

### Fixed

- Hardened extension load so review-state command schema construction has a local fallback if the Pi extension loader sees a stale `REVIEW_STATES` import during reload.

## [0.1.1] - 2026-05-22

### Changed

- Removed the `/agent-vent` command compatibility alias; runtime-facing tool, command, and toolbox bundle naming is now singularly `agent_vent`.

## [0.1.0] - 2026-05-21

### Added

- Added the `agent_vent` Pi tool for local agent frustration capture.
- Added `/agent_vent` inspection command.
- Added local append-only JSONL storage at `~/.pi/agent/agent-vent/vents.jsonl`, overridable with `PI_AGENT_VENT_DIR`.
- Added recurrence grouping, advisory candidate-incident heuristics, malformed-line tolerance, and conservative secret redaction.
- Added `node:test` coverage for redaction, JSONL round trips, recurrence summaries, and validation errors.
- Added engineering-core-aligned design and implementation-plan docs.
- Integrated discovery through the `pi-toolbox-discovery` `agent_vent` bundle while preserving ASC/self ownership boundaries.
