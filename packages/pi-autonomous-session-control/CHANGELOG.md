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

- `self` action state now supports `action summary` / checkpoint / follow-up listing for restart-aware dogfood loops.
- Scoped self-memory persistence now round-trips action checkpoints and follow-ups alongside crystallization/protection memories.
- `self` perception now diagnoses malformed bash tool-call inputs and suspicious relative `dev/null` redirects instead of inventing unprovable command history.

### Changed

- `self` persists scoped memory after action writes so Level-4 handoff/dogfood checkpoints survive extension restarts.
- `dispatch_subagent` now defaults child session traces to Pi's native `~/.pi/agent/sessions/--<encoded-cwd>--/` JSONL store, while keeping ASC status/lock sidecars for lifecycle metadata and preserving `PI_SUBAGENT_SESSIONS_DIR` as an explicit separate-store override.

## [0.1.5] - 2026-05-12

### Added

- Scoped self-memory lifecycle wiring in `extensions/self/memory-lifecycle.ts` (load, hydrate, persist, validate)
- Environment override `PI_SELF_MEMORY_PATH` for deterministic memory snapshot location
- Persistence safety coverage in `tests/self-memory-persistence.test.mjs`:
  - cross-lifecycle round-trip for crystallization + protection domains
  - malformed payload fail-safe recovery
- ASC-owned rewind core scaffold under `extensions/self/rewind/`:
  - temp-index git snapshot capture
  - tree-SHA deduplicated snapshot creation
  - single-ref keepalive storage helpers
  - exact restore + undo core
  - owned session-ledger schema guards
  - pure retention-planning helper
- ASC-owned rewind runtime wiring in `extensions/self/rewind/runtime.ts`:
  - session bootstrap and reconstruction for ASC-owned rewind metadata
  - exact rewind-point capture on `turn_start` / `turn_end` / `agent_end`
  - compaction alias recording on `session_compact`
  - integration with Pi's built-in `/fork` and `/tree` flows via `session_before_fork`, `session_start` (`reason: "fork"`), `session_before_tree`, and `session_tree`
  - footer/status publication for rewind point visibility in interactive sessions
- Optional Replay Fabric recovery projection in `extensions/self/rewind/replay-fabric-projection.ts`:
  - bounded `restore.started`, `restore.completed`, `restore.failed`, and `restore.undo` milestone emission
  - repo-local `.git/pi-rewind/manifests/*.json` artifact manifests for replay follow-through
  - opt-in activation through `ASC_REWIND_REPLAY_FABRIC_URL`
- Focused rewind tests:
  - `tests/rewind-git-snapshot.test.mjs`
  - `tests/rewind-exact-restore.test.mjs`
  - `tests/rewind-session-ledger.test.mjs`
  - `tests/rewind-retention.test.mjs`
  - `tests/rewind-runtime.test.mjs`
- Rewind integration design note: `docs/project/2026-04-22-rewind-salvage-and-integration-plan.md`
- Explicit live prompt-vault test script `npm run test:live:prompt-vault`, gated by `ASC_RUN_LIVE_PROMPT_VAULT_TESTS=1`.

### Changed

- `self` runtime now awaits memory hydration before query resolution
- README docs map now links to the rewind salvage/integration plan so the new rewind slice work stays discoverable from the package entrypoint
- `self` persists scoped domains (`crystallization`, `protection`) after successful domain writes
- `dispatch_subagent` now routes raw `pi --mode json` output through a package-local assistant-only filter helper before ASC parses the stream, dropping aggregate Pi events that the runtime does not semantically need and treating the helper protocol as the only accepted parent-side seam
- Subagents now inherit the current session-selected model when available; `PI_SUBAGENT_MODEL` still overrides, and `openai-codex/gpt-5.4` remains the fallback when no live model is available
- `dispatch_subagent` now records selected child model plus explicit child bootstrap details (`requestedModel`, `effectiveModel`, `loadedExtensions`, `extensionWarnings`) on execution results
- `self-prompt-vault-compat` now uses a feature/manifest policy for the ASC autonomy floor instead of certifying arbitrary low checked manifest versions, and its Dolt schema probe is timeout-bounded.
- Documentation updated to reflect scoped cross-session persistence, filtered subagent transport, and new memory contract surfaces
- Default `npm run check` now keeps prompt-vault parser/unit contract tests while host-dependent live prompt-vault DB/vault-client probes live in explicit `.live.mjs` files run only by `npm run test:live:prompt-vault`, so default checks report zero live prompt-vault skips.

### Fixed

- Malformed persisted memory payloads now degrade safely (no crash) and are repaired on next successful scoped persistence write
- Oversized aggregate Pi JSON lines no longer trip ASC's main subagent parser before assistant output can be recovered; raw upstream buffering is now isolated inside the filter helper with separate raw vs filtered buffer controls
- Timeout/abort shutdown now tears down the raw `pi` child before the parent-side helper force kill window closes, preventing orphaned subprocesses
- Subagents no longer fail at startup when the live session model comes from a numeric-suffix extension provider alias such as `openai-codex-2`; ASC now preserves the alias and explicitly bootstraps `pi-multi-pass` into the child runtime instead of collapsing to the base provider
- Extensionless raw-child runs now use an isolated Pi agent dir with sanitized child settings, so unrelated global default-model warnings from extension-backed provider aliases no longer leak into subagent stderr
- `self-prompt-vault-compat` no longer reports the current ASC package below its own autonomy-version floor when source feature shape proves prompt-envelope support, but it also no longer certifies arbitrary low package manifests such as `0.0.1`.
- Empty or whitespace-only subagent model selections now fail before spawn as structured `model_selection_failed` results without leaking `activeCount` / `maxConcurrent`.
- `DispatchSubagentRequest.env` is now fail-closed to `PI_PROVENANCE_*` keys so request callers cannot override child control-plane env such as `PATH`, `NODE_OPTIONS`, or `PI_CODING_AGENT_DIR`; rejected env fails before spawn as `env_policy_failed` without leaking `activeCount`.
- Capability-map wording inside explicit crystallization/protection directives (for example `Remember: capability map stale` or `Mark as trap: capability map ...`) no longer hijacks routing into capability discovery.
- `tests/public-execution-contract.test.mjs` now resolves package paths from the test module location so it can pass from the repo root as well as the package root.
- Live prompt-vault harness readiness now discovers the monorepo sibling `pi-vault-client` package when the legacy installed extension path is absent, avoids treating non-runtime `@mariozechner/pi-coding-agent` package-root exports as unavailable, and parses current `vault_retrieve` output that omits a closing content fence.
- Exact rewind restore now attempts to roll back to the captured undo snapshot if the destructive delete/restore flow fails, and ASC rewind ledger guards reject malformed snapshot arrays and out-of-bounds binding/current/undo indices.

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
  - live prompt-vault DB path (currently `tests/prompt-vault-db-integration.live.mjs`)

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
  - live integration test `tests/prompt-vault-cross-extension.live.mjs` chaining real vault-client tools (`vault_query` + `vault_retrieve`) into `dispatch_subagent`
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
