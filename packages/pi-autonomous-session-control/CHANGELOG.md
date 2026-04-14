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

## [0.2.0](https://github.com/tryingET/pi-extensions/compare/pi-autonomous-session-control-v0.1.0...pi-autonomous-session-control-v0.2.0) (2026-04-14)


### Features

* add bounded ops-plane history surfaces ([ea0a1e1](https://github.com/tryingET/pi-extensions/commit/ea0a1e1b89e0365c6b7e2a0ef19afc8b69ddc2f9))
* add compatibility canary test contracts to scenario packages ([7841b89](https://github.com/tryingET/pi-extensions/commit/7841b89141126e01a02f2bd27f5c3f79ae044af6))
* add pi-autonomous-session-control package ([1865002](https://github.com/tryingET/pi-extensions/commit/1865002c7d5483ab0524d43e70ac499b3d218b76))
* **asc:** harden execution plane with assistant protocol, abort, and transport safety ([e68f3ed](https://github.com/tryingET/pi-extensions/commit/e68f3edb2a01fc8120d78f2acf6ed43444510564))
* deepen subagent inspection and deprecation workflow ([032f366](https://github.com/tryingET/pi-extensions/commit/032f3669f6272374627a1df098e9439bc823d115))
* **extensions:** add prompt snippets for pi 0.59+ tool discoverability ([e516af2](https://github.com/tryingET/pi-extensions/commit/e516af2e3505e2901d6cb5b0c31581cda38eacad))
* harden Pi 0.65 compatibility and AK launcher ([b0a922c](https://github.com/tryingET/pi-extensions/commit/b0a922c25aa7a9f36c05a1e336306ed3b4ad96ef))
* **monorepo:** add packaged helpers and host-compat hardening ([0ec674c](https://github.com/tryingET/pi-extensions/commit/0ec674c9985875b315bae0929b102b04c1f4c666))
* normalize ASC execution failure taxonomy ([2a43c58](https://github.com/tryingET/pi-extensions/commit/2a43c58e0012bcdc6f4ea6bfcb75ca770b04c60c))
* **pi-autonomous-session-control:** expose public execution contract ([2287d6c](https://github.com/tryingET/pi-extensions/commit/2287d6caedcf2802b2cb8deb9329e69fca46ce20))
* **pi-autonomous-session-control:** inherit current session model for subagent dispatch ([0ffdeeb](https://github.com/tryingET/pi-extensions/commit/0ffdeebdc38e3e26eb90592f90c16fe014e8a310))
* **pi-autonomous-session-control:** scope dashboard widget to current session with time-bounded visibility ([ea3f21b](https://github.com/tryingET/pi-extensions/commit/ea3f21b5a2135274e268a108c3399bf62fa2f8fc))
* **pi-autonomous-session-control:** scope subagent dashboard to current repo root and add grace-based hide logic ([ed78e8e](https://github.com/tryingET/pi-extensions/commit/ed78e8e9d8ad809b02a4868b356294782a76fda0))
* reduce asc to no local tech-stack surface ([56e0434](https://github.com/tryingET/pi-extensions/commit/56e043435551f783a19e5166765efb68b2eeb44d))


### Bug Fixes

* **pi-autonomous-session-control:** isolate extensionless child settings ([9485c16](https://github.com/tryingET/pi-extensions/commit/9485c167d76e2ebbfedd360b46df777d45830623))

## [Unreleased]

### Added

- Scoped self-memory lifecycle wiring in `extensions/self/memory-lifecycle.ts` (load, hydrate, persist, validate)
- Environment override `PI_SELF_MEMORY_PATH` for deterministic memory snapshot location
- Persistence safety coverage in `tests/self-memory-persistence.test.mjs`:
  - cross-lifecycle round-trip for crystallization + protection domains
  - malformed payload fail-safe recovery

### Changed

- `self` runtime now awaits memory hydration before query resolution
- `self` persists scoped domains (`crystallization`, `protection`) after successful domain writes
- `dispatch_subagent` now routes raw `pi --mode json` output through a package-local assistant-only filter helper before ASC parses the stream, dropping aggregate Pi events that the runtime does not semantically need and treating the helper protocol as the only accepted parent-side seam
- Subagents now inherit the current session-selected model when available; `PI_SUBAGENT_MODEL` still overrides, and `openai-codex/gpt-5.4` remains the fallback when no live model is available
- `dispatch_subagent` now records selected child model plus explicit child bootstrap details (`requestedModel`, `effectiveModel`, `loadedExtensions`, `extensionWarnings`) on execution results
- Documentation updated to reflect scoped cross-session persistence, filtered subagent transport, and new memory contract surfaces

### Fixed

- Malformed persisted memory payloads now degrade safely (no crash) and are repaired on next successful scoped persistence write
- Oversized aggregate Pi JSON lines no longer trip ASC's main subagent parser before assistant output can be recovered; raw upstream buffering is now isolated inside the filter helper with separate raw vs filtered buffer controls
- Timeout/abort shutdown now tears down the raw `pi` child before the parent-side helper force kill window closes, preventing orphaned subprocesses
- Subagents no longer fail at startup when the live session model comes from a numeric-suffix extension provider alias such as `openai-codex-2`; ASC now preserves the alias and explicitly bootstraps `pi-multi-pass` into the child runtime instead of collapsing to the base provider
- Extensionless raw-child runs now use an isolated Pi agent dir with sanitized child settings, so unrelated global default-model warnings from extension-backed provider aliases no longer leak into subagent stderr

## [0.1.4] - 2026-03-04

### Added

- Reproducible recipe for live cross-extension harness execution in `docs/project/prompt-vault-cross-extension-harness.md`
- `vault_rate` FK behavior contract documentation with integration guidance
- **Subagent timeout**: New `timeout` parameter (seconds) on `dispatch_subagent` with 5-minute default
- **Unique session names**: Session name collision now auto-generates unique suffixes to prevent overwrites
- **Rate limiting**: `maxConcurrent` limit (default: 5) prevents resource exhaustion from unbounded spawning
- **Session cleanup**: New `subagent-cleanup` command removes old sessions (age/count-based)
- **Session stats**: Enhanced `subagent-status` command shows session count and oldest age
- **Subagent model env var**: `PI_SUBAGENT_MODEL` environment variable for custom subagent model selection
- **Upstream proposals**: Draft proposals for vault-client improvements:
  - `docs/upstream-proposals/vault-rate-fk-fallback-proposal.md`
  - `docs/upstream-proposals/vault-client-json-output-proposal.md`

### Fixed

- Session file cleanup errors are now logged instead of silently swallowed
- Session name collision prevention (`a/b` and another `a/b` now get unique files)
- Subagent model selection now uses `openai-codex/gpt-5.3-codex-spark` with explicit provider prefix to avoid pi model resolver ambiguity

### Changed

- `docs/dev/status.md` now includes Known Upstream Behaviors table for cross-repo contract tracking
- Extracted `subagent-profiles.ts`, `subagent-session.ts`, and `subagent-commands.ts` modules to reduce file size
- `createSubagentState` now accepts optional `{ maxConcurrent }` parameter

## [0.1.3] - 2026-03-03

### Added

- `dispatch_subagent` prompt envelope contract:
  - New optional params: `prompt_name`, `prompt_content`, `prompt_tags`, `prompt_source`
  - Prompt envelope content is now injected deterministically into subagent system prompts
  - Tool result `details` now includes prompt provenance (`prompt_name`, `prompt_source`, `prompt_tags`, `prompt_applied`)
- Focused top-level tests for dispatch contract behavior:
  - prompt-envelope + no-envelope dispatch paths
  - fallback behavior for partial/invalid envelopes
  - integration-oriented mocked vault payload flow
  - `tests/dispatch-subagent.test.mjs`
  - `tests/prompt-vault-dispatch-integration.test.mjs`
  - `tests/prompt-vault-db-integration.test.mjs`

### Changed

- Refactored prompt-envelope logic into `extensions/self/subagent-prompt-envelope.ts` for a stable integration seam and testability.
- `registerSubagentTool(...)` now supports an injectable spawner (defaults to runtime `spawnSubagent`) to enable deterministic tests.
- Invalid/partial prompt envelopes now fail soft with actionable `prompt_warning` guidance in both tool output and result details.
- Quality gate test discovery now includes nested suites (`tests/**/*.test.*`), and the self harness now stubs subagent imports so self test suites run in CI.
- Package `files` manifest now includes `extensions/self/` so published builds ship required runtime modules imported by `extensions/self.ts`.
- Default extension entrypoint now registers delegation runtime (`dispatch_subagent` + subagent commands) by default, with sessions dir resolved from `PI_SUBAGENT_SESSIONS_DIR` or `./.pi-subagent-sessions`.
- README quickstart/package file references now point at `extensions/self.ts` and `extensions/self/`.
- SOP prompt maintenance check now targets `extensions/self.ts` (instead of legacy `extensions/autonomy-control.ts`).
- Legacy architecture/explorer docs now include explicit historical-path notes for `autonomy-control/*` references.
- Fixed bash command perception tracking to store the real command string (instead of tool call IDs).
- Subagent state now refreshes when `createExtension(...)` is called with a different sessions directory.
- `dispatch_subagent` now sanitizes session names before creating session files to prevent path traversal via `name`.
- `dispatch_subagent` now converts thrown spawner exceptions into structured tool error results.
- Prompt envelope metadata is sanitized to single-line header values, and empty `prompt_tags` no longer trigger false-positive fallback warnings.
- Added runtime compatibility self-check command (`self-prompt-vault-compat`) that reports autonomy version × vault-client version × prompt-vault schema version matrix status.
- Added compatibility probe module (`extensions/self/prompt-vault-compat.ts`) and focused matrix tests (`tests/prompt-vault-compat.test.mjs`).
- Added live cross-extension harness support:
  - harness helpers in `extensions/self/cross-extension-harness.ts`
  - live integration test `tests/prompt-vault-cross-extension-live.test.mjs` chaining real vault-client tools (`vault_query` + `vault_retrieve`) into `dispatch_subagent`
  - deterministic skip gating when vault-client runtime dependencies/environment are unavailable
  - package-layout-aware vault-client entry discovery (`index.ts` and package-defined extension paths)
  - prompt envelope extraction now preserves template bodies containing internal `---` markdown separators

## [0.1.2] - 2026-03-02

### Changed

- **Extracted `prompt_eval` to vault-client extension**
  - Removed `prompt-eval.ts` and `prompt-eval-core.ts`
  - Prompt A/B testing now lives in `~/.pi/agent/extensions/vault-client/evaluator.ts`
  - Reduces duplication (vault client code was duplicated)
  - Cleaner separation: autonomy tools here, prompt tools in vault-client

### Removed

- `extensions/self/prompt-eval.ts`
- `extensions/self/prompt-eval-core.ts`

## [0.1.1] - 2026-02-21

### Added

- Wired `prompt_eval` tool into `createExtension` entry point
- Added `SubagentSpawner` adapter for prompt evaluation with local vLLM
- Configurable evaluator via optional `evalConfig` parameter

### Changed

- `createExtension` now accepts optional `evalConfig` parameter for customization
- Updated imports in self.ts to include prompt-eval types and functions

## [0.1.0] - 2026-02-08

### Added

- Initial production-ready scaffold generated from template v2.
