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
- Documentation updated to reflect scoped cross-session persistence and new memory contract surfaces

### Fixed

- Malformed persisted memory payloads now degrade safely (no crash) and are repaired on next successful scoped persistence write

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
