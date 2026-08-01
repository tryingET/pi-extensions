---
summary: "Changelog for the pi-autoresearch package."
read_when:
  - "Preparing a release or reviewing package history."
system4d:
  container: "Release log for this extension package."
  compass: "Track meaningful deltas as the experiment-loop capability matures."
  engine: "Record shell -> runtime -> integration milestones as they land."
  fog: "Early versions may move quickly while package boundaries stabilize."
---

# Changelog

All notable changes to this project should be documented here.

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-autoresearch-v0.2.0...pi-autoresearch-v0.2.1) (2026-08-01)


### Bug Fixes

* **autoresearch:** declare trigger runtime dependency ([0a4025a](https://github.com/tryingET/pi-extensions/commit/0a4025a6b895b65e2128b972be8169cc99640428))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-autoresearch-v0.1.0...pi-autoresearch-v0.2.0) (2026-07-13)


### Features

* **autoresearch:** add vllm campaign cockpit ([6e97a1f](https://github.com/tryingET/pi-extensions/commit/6e97a1f5cdca9f538ab68be62c857e71146ddb14))
* **extensions:** harden runtime quality across packages ([1ff1eb0](https://github.com/tryingET/pi-extensions/commit/1ff1eb0cf10a3f8f60cf391ccf246b238951a848))
* migrate pi extensions to pi 0.76 ([93dd0e0](https://github.com/tryingET/pi-extensions/commit/93dd0e0fdc9e23b0fc36661cc0e33972f365bf98))
* route ASC autoresearch launches through slash UX ([f0b7606](https://github.com/tryingET/pi-extensions/commit/f0b7606ad146e73ffdf8f57c8ea58d791a87e871))


### Bug Fixes

* align extension runtimes with Pi 0.80 ([1702c25](https://github.com/tryingET/pi-extensions/commit/1702c25f9d31bf4f619fdaa6f7a7f898ca5ee48e))
* **autoresearch:** add gated stale candidate cleanup ([ec5e05f](https://github.com/tryingET/pi-extensions/commit/ec5e05ffc671b7a4a616795ee1461d1fdf19e24d))
* **autoresearch:** add open candidate review shortcut ([8a161ab](https://github.com/tryingET/pi-extensions/commit/8a161abe8732d27845774eb4bcb3a0378c594d4c))
* **autoresearch:** align vllm cockpit benchmark seed ([0655683](https://github.com/tryingET/pi-extensions/commit/0655683e536320f49fc20c46eb17a1f8d3abfc42))
* **autoresearch:** clarify widget run counts ([4f9e4ef](https://github.com/tryingET/pi-extensions/commit/4f9e4ef671c580917df660c0814ecfb4daf46f35))
* **autoresearch:** detect stale candidate artifacts ([9979c22](https://github.com/tryingET/pi-extensions/commit/9979c2281a6d684cc6ec208f8670c998401da9ca))
* **autoresearch:** expose useful candidate integration handoff ([3a11f71](https://github.com/tryingET/pi-extensions/commit/3a11f7132c1044d82ea540358f654ec4856b05d2))
* **autoresearch:** prioritize open candidate review next ([5da58d2](https://github.com/tryingET/pi-extensions/commit/5da58d2f2fac70aca1cb96df9856f2cc0b26902a))
* **autoresearch:** seed review calls with packet paths ([c1969ea](https://github.com/tryingET/pi-extensions/commit/c1969ea01ce7c779346c04b41cebb9a138623f3e))
* **autoresearch:** surface open candidate review posture ([013bb01](https://github.com/tryingET/pi-extensions/commit/013bb016a64a08fc864bde5fe5a073e3a8ef1a52))

## [Unreleased]

## [0.1.0] - 2026-05-17

### Added

- Scaffold `@tryinget/pi-autoresearch` as the initial package shell.
- Add `/autoresearch` shell command and `autoresearch_runtime_status` tool.
- Add minimal local receipt-entry helpers and runtime tests.
- Add the bounded runtime kernel in `src/core/runtime.ts`.
- Add `autoresearch_runtime_run` for one bounded local benchmark/check execution path with append-only receipts.
- Add JSONL receipt loading/appending, baseline tracking, confidence scoring, and bounded runtime execution tests.
- Harden candidate-result adapter packet validation so malformed candidate binding fields and non-finite candidate-run metrics fail closed before downstream review/evidence adapters consume them.
