---
summary: "Release history for pi-code-mode."
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
