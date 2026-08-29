---
summary: "Release history for pi-eval-kernel."
read_when:
  - "Preparing a release or reviewing package behavior changes."
system4d:
  container: "Release log for the code-mode extension package."
  compass: "Keep runtime, security, and adapter changes visible."
  engine: "Land verified behavior -> record release delta -> publish through root component flow."
  fog: "Arbitrary-code authority changes can disappear inside generic package notes."
---

# Changelog

All notable changes to this project are documented here.

## [0.3.0](https://github.com/tryingET/pi-extensions/compare/pi-eval-kernel-v0.2.1...pi-eval-kernel-v0.3.0) (2026-08-29)


### Features

* **file-budget:** exception remaining repo debt and ratchet every gate ([89b9faa](https://github.com/tryingET/pi-extensions/commit/89b9faa30bf47ef9f7d17730aa2c771d12bfca4f))


### Bug Fixes

* **monorepo:** raise fast-xml-parser security floor ([5bc4017](https://github.com/tryingET/pi-extensions/commit/5bc40171be113473b75429e8519dfc5f30e81e7f))
* **orchestrator:** promote governed runtime pins to the 0.84.3 host line ([9b2fda4](https://github.com/tryingET/pi-extensions/commit/9b2fda4721d37cbfbfc161cd79a971addabe58ea))
* **pi-eval-kernel:** make packed smoke provider-free ([d549b8c](https://github.com/tryingET/pi-extensions/commit/d549b8c46c753c1de58cbfe8eb415c76c31df2f3))
* **pi-eval-kernel:** remove legacy Pi peer aliases ([50f60f3](https://github.com/tryingET/pi-extensions/commit/50f60f3c35c9e6bd896f0233f95021f631970369))

## [0.2.1](https://github.com/tryingET/pi-extensions/compare/pi-eval-kernel-v0.2.0...pi-eval-kernel-v0.2.1) (2026-08-15)


### Bug Fixes

* **agent-vent,pi-eval-kernel:** scope scratch-root guards to environment truth ([d9b0cdb](https://github.com/tryingET/pi-extensions/commit/d9b0cdb8267f0f3b93875f0e212b11a1ded8843b))

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-eval-kernel-v0.1.0...pi-eval-kernel-v0.2.0) (2026-08-15)


### Features

* **eval-kernel:** persistent python kernel behind engine flag (Phase-1 Wave 1A) ([17e6fc9](https://github.com/tryingET/pi-extensions/commit/17e6fc91a06d7020d04b9bf2f4a1115b88b8d3d3))
* **eval-kernel:** preserve Python state across SIGINT ([af064d4](https://github.com/tryingET/pi-extensions/commit/af064d412deca7dfbc95bb34d6153e0f5f2aad59))


### Bug Fixes

* **eval-kernel:** bind Python interrupts to eval results ([e90ee09](https://github.com/tryingET/pi-extensions/commit/e90ee093820622c06c4124005ce4c4a42bf907e7))
* **pi-eval-kernel:** normalize npm pack JSON across npm 10/11/12 ([5c1554e](https://github.com/tryingET/pi-extensions/commit/5c1554e443319604d989637c7f2549ef5800fc8c))
* **pi-eval-kernel:** serialize persistent worker retirement ([f17cef7](https://github.com/tryingET/pi-extensions/commit/f17cef757fdaa2bba174db002538e44ab73a7ed6))

## [0.1.0] - 2026-07-31

### Added

- Template-derived simple-package scaffold with component release metadata.
- Model-facing `eval` tool without replacing Bash.
- Disposable Python and JavaScript workers with host-persisted logical state, timeout, cancellation, reset, and session lifecycle cleanup.
- Disposable bounded protocol broker, runtime frame validation, and host-finalized result commit.
- Explicit package-owned capability registry with effect admission.
- Default bounded `read_text`, `list_directory`, and no-shell `run_process` capabilities.
- Concurrent host capability calls through Python and JavaScript `tool.parallel` helpers.
- Per-call interactive confirmation and fail-closed non-interactive behavior.
- Unit coverage for registration, admission, persistence, concurrency, timeout recovery, and lifecycle cleanup.
- Public package-entrypoint contract coverage for `.` and `./runtime`.
- Exact Pi 0.83.0 extension-factory compatibility coverage through the root host canary, with TypeBox 1.3.7 as the package-local schema contract.
- Live `pi -p` dogfood coverage for multi-capability fan-out, JavaScript state reuse, Python state isolation, and process execution.
- Packed-tarball release smoke that installs into isolated `TMPDIR`-backed Pi/npm state and executes both JavaScript and Python `eval` through Pi.

### Fixed

- Accept strict JSON objects created inside the JavaScript VM realm when committing persistent state; live multi-file exploration exposed the cross-realm prototype mismatch.
- Preserve repeated JSON-object references by value instead of misclassifying aliases as cycles; live retained dependency-graph analysis exposed the distinction.
- Align the package-owned structural Pi API with the exact 0.83.0 `ExtensionFactory`, including required tool labels, TypeBox schema generics, result details, and asynchronous command handlers.
- Remove unused Pi host dev dependencies whose published coding-agent shrinkwrap forced vulnerable `brace-expansion` 5.0.7; exact host packages are now materialized only by the root compatibility canary.
- Scope packed smoke assertions to the actual `eval` result and final assistant response, always remove copied Pi authentication from retained diagnostics, and reject root-canary path escapes before package or command effects.
- Reuse the operator's authenticated default provider/model for full release smokes instead of routing through a stale hard-coded catalog default, while retaining explicit test-provider overrides and surfacing provider errors in smoke failures.
