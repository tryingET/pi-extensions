---
summary: "Current state of the self tool."
read_when:
  - "Checking what exists."
  - "Before extending."
system4d:
  container: "State snapshot."
  compass: "What works. What's next. What's missing."
  engine: "Single source of truth for capability."
  fog: "Stale state = wrong decisions."
---

# Status

## TRUE INTENT

The `self` tool is a mirror. The LLM queries, perceives, decides.

## WHAT EXISTS

### Tools Registered

| Tool | Location | Purpose | Status |
|------|----------|---------|--------|
| `self` | this extension | Introspection mirror | ✅ Working |
| `dispatch_subagent` | this extension | Spawn specialized agents | ✅ Wired |
| `dispatch_subagent` prompt envelope | this extension + vault-client | Apply retrieved prompts with provenance | ✅ Phase 1 |
| `dispatch_subagent` envelope fallback guard | this extension | Soft-fail partial/invalid envelopes with guidance | ✅ Phase 2 slice |
| `prompt_eval` | vault-client | A/B test prompts | ✅ Moved |

### Query Domains (self tool)

| Domain | Example | What It Does |
|--------|---------|--------------|
| **PERCEPTION** | "What files have I touched?" | See yourself |
| **DIRECTION** | "I need help with X" | Move yourself |
| **CRYSTALLIZATION** | "Remember: [pattern]" | Improve yourself |
| **PROTECTION** | "Mark as trap: [pattern]" | Protect yourself |
| **ACTION** | "Create checkpoint before X" | Act |

### Implementation

```
extensions/self.ts              — entry point (wires self + dispatch_subagent)
extensions/self/subagent.ts     — dispatch_subagent tool
extensions/self/subagent-dashboard-data.ts — dashboard data adapter over session/status artifacts
extensions/self/subagent-dashboard.ts — read-only operator widget + inspection commands
extensions/self/memory.ts       — memory store interface + in-memory reference implementation
extensions/self/memory-lifecycle.ts — scoped persistence lifecycle (load/hydrate/persist/validate)
extensions/self/query-resolver.ts — intent classification + resolution
extensions/self/perception.ts   — operation tracking + pattern detection
extensions/self/prompt-vault-compat.ts — runtime compatibility probe for autonomy × vault-client × schema
extensions/self/cross-extension-harness.ts — live cross-extension readiness + output parsing helpers
extensions/self/edge-contract-kernel.ts — shared boundary normalization, invariant checks, and tool-result shaping
extensions/self/subagent-edge-contract.ts — dispatch-specific boundary normalization/invariant adapters built on ECK
extensions/self/types.ts        — type definitions
extensions/self/state.ts        — state factories
extensions/self/infrastructure/ — utilities (tracing, watchdog, entry-utils)
tests/self/*.test.mjs           — resolver + registration tests (quality gate path)
tests/self-memory-persistence.test.mjs — scoped memory persistence round-trip + malformed-payload safety tests
tests/canary/failure-memory.test.mjs — card-driven failure-memory canary lane (quality gate path)
tests/canary/cards/*.json       — durable regression cards consumed by canary harness
tests/edge-contract-kernel.test.mjs — ECK deterministic behavior + malformed-input guard tests
tests/dispatch-subagent.test.mjs — prompt-envelope + fallback contract tests (quality gate path)
tests/prompt-vault-dispatch-integration.test.mjs — mocked vault payload integration test (quality gate path)
tests/prompt-vault-db-integration.test.mjs — live prompt-vault DB envelope integration test (quality gate path; skips if vault DB unavailable)
tests/prompt-vault-compat.test.mjs — compatibility matrix evaluation tests (quality gate path)
tests/prompt-vault-cross-extension-live.test.mjs — live cross-extension vault-client -> dispatch harness test (quality gate path; skips when env/deps unavailable)
```

**Notes:**
- `prompt_eval` moved to `vault-client` extension.
- Canonical home is now the monorepo package at `packages/pi-autonomous-session-control`.
- Default package entrypoint (`extensions/self.ts` default export) now registers `dispatch_subagent`, subagent commands, and the read-only subagent operations dashboard using `PI_SUBAGENT_SESSIONS_DIR` or `./.pi-subagent-sessions`.
- Subagent model selection priority: `PI_SUBAGENT_MODEL` env var → latest `model_select` choice → `openai-codex/gpt-5.3-codex-spark` fallback.
- Scoped memory lifecycle now loads at tool runtime start and persists on crystallization/protection writes.
- Memory snapshot path can be overridden with `PI_SELF_MEMORY_PATH`; default is `<sessionsDirBase>.self-memory.json` adjacent to the subagent sessions directory.
- Persistence contract is schema-versioned (`schemaVersion: 1`) and validates payload structure before hydration; malformed payloads fail safe.
- Added `self-prompt-vault-compat` command to report runtime compatibility across autonomy version, vault-client version, and prompt-vault schema version.
- Added `self-runtime-invariants` command and `self-status` invariant summary to surface counter/session sanity issues early.
- Added live cross-extension harness utilities and test coverage (`vault_query` -> `vault_retrieve` -> `dispatch_subagent`) with explicit readiness skip gates (including package-layout-aware vault-client entry discovery).
- Bash perception now tracks actual command text from `tool_call`/`tool_result` correlation (instead of tool call IDs).
- `dispatch_subagent` sanitizes prompt header metadata and session names; thrown spawner errors are returned as structured tool errors.
- Added rollout flags `PI_SUBAGENT_RESERVE_SESSION_NAMES=false` (disable all name-reservation mechanisms) and `PI_SUBAGENT_FILE_LOCK_SESSION_NAMES=false` (disable cross-process file locks only, while keeping in-memory reservation) for rollback/debugging.
- Added an explicit failure-memory canary lane (`tests/canary/failure-memory.test.mjs` + `tests/canary/cards/*.json`) and wired `scripts/quality-gate.sh` to fail CI when the lane is missing.
- Introduced Edge Contract Kernel (`extensions/self/edge-contract-kernel.ts`) with a dispatch adapter (`extensions/self/subagent-edge-contract.ts`) and adopted it in `dispatch_subagent`, direction resolver context handling, and monotonic ID issuance across action/crystallization/protection/direction domains.

### Infrastructure

- `tracing.ts` — debug logging for hangs
- `watchdog.ts` — timeout guard for long operations
- `entry-utils.ts` — session entry utilities

## VALIDATION

```
npm run check       → passes
npm run lint        → passes
node --test tests/**/*.test.mjs  → pass
Package size        → 47.8 kB
```

## FAILURE-MEMORY CANARY LANE

Card files live in `tests/canary/cards/*.json` and are executed by `tests/canary/failure-memory.test.mjs`.

### Card format

```json
{
  "id": "string",
  "title": "string",
  "target": "self | dispatch_subagent | subagent_sessions",
  "query": "string",
  "context": { "optional": "payload" },
  "setup": [{ "query": "string", "context": {} }],
  "calls": [{ "profile": "reviewer", "objective": "..." }],
  "seedFiles": [{ "name": "same.lock", "content": "busy" }],
  "assertions": [
    {
      "path": "result.intent",
      "equals": "direction"
    },
    {
      "path": "result.answer",
      "includes": "Comparison snapshot"
    }
  ]
}
```

### Policy

- Add a new card for every production regression before/with the fix.
- Keep cards deterministic (no network, no external services).
- `scripts/quality-gate.sh` now fails CI when canary harness/cards are missing.
- Prefer expressing expected behavior as assertions over implementation detail.

## WHAT'S MISSING

| Gap | Impact | Priority |
|-----|--------|----------|
| Scoped persistence coverage | Perception, direction, and action state still reset between sessions | High |
| Snapshot backend limitations | Local JSON persistence lacks multi-process merge/conflict guarantees | Medium |
| Goal management | Can't declare/track own goals | Medium |
| Causal reasoning | Sees patterns, not why | Low |

## KNOWN UPSTREAM BEHAVIORS

| Surface | Behavior | Notes |
|---------|----------|-------|
| `vault_rate` FK fallback | Fails when no execution exists; fallback to `execution_id=0` rejected by FK constraint | **Proposal drafted**: `docs/upstream-proposals/vault-rate-fk-fallback-proposal.md` |
| Live harness test skip | Skips outside Pi runtime due to ESM module resolution | **Proposal drafted**: `docs/upstream-proposals/vault-client-json-output-proposal.md` |
| Text output parsing | Fragile cross-extension integration via text parsing | **Proposal drafted**: JSON output format |

## UPSTREAM PROPOSALS (pending)

| Proposal | Target | Status |
|----------|--------|--------|
| vault_rate FK fallback fix | vault-client | Drafted, ready for submission |
| Structured JSON output | vault-client | Drafted, ready for submission |

## RESOLVED ISSUES (0.1.4)

| Issue | Resolution |
|-------|------------|
| No subagent timeout | Added `timeout` parameter (seconds), 5-minute default |
| Session name collision | Auto-generate unique suffixes when files exist |
| Silent unlink errors | Now logged to stderr instead of swallowed |
| No rate limiting | Added `maxConcurrent` (default: 5), returns error when exceeded |
| Session file accumulation | Added `subagent-cleanup` command (age/count-based) |
| No session visibility | Enhanced `subagent-status` shows file count and oldest age; read-only dashboard widget + inspection commands surface recent sessions |

## NEW COMMANDS (0.1.4)

| Command | Description |
|---------|-------------|
| `subagent-cleanup [maxAgeDays] [maxCount]` | Remove old session files (default: 7 days, 100 max) |
| `subagent-dashboard` | Open the read-only subagent operations summary |
| `subagent-inspect <session-name>` | Inspect raw status/session artifact pointers for a specific session |

## FILE REFERENCE

- Architecture: `docs/design/TRANSCENDENT_AUTONOMY.md`
- Session handoff: `NEXT_SESSION_PROMPT.md`
