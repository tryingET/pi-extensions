---
summary: "Phased implementation plan for prompt-vault integration in autonomous-session-control."
read_when:
  - "Before starting implementation slices."
  - "When validating completion and rollback readiness."
system4d:
  container: "Execution plan."
  compass: "Smallest safe slice first, explicit contracts, reversible steps."
  engine: "Phase 0 -> Phase 1 -> Phase 2."
  fog: "Cross-repo contract changes can fail silently without tests."
---

# Prompt-vault Integration Implementation Plan

## Strategy

- Keep prompt management in vault-client.
- Keep autonomy orchestration in this repo.
- Add an explicit integration seam (Prompt Envelope contract).
- Ship in slices with rollback paths.

## Compatibility guard notes (current contract)

| autonomous-session-control | vault-client | prompt-vault schema | Status | Guard behavior |
|---|---|---|---|---|
| `>=0.1.3` | `>=1.2.0` | `schema_version = 1` | ✅ supported | Prompt envelope supported; fallback warnings emitted when envelope metadata is partial/invalid |
| `<0.1.3` | `>=1.2.0` | `schema_version = 1` | ⚠️ limited | No explicit prompt-envelope fields; use legacy `systemPrompt` path only |

Runtime guards in this repo:
- If prompt envelope metadata is present without `prompt_content`, dispatch continues with legacy prompt and returns `prompt_warning`.
- If `prompt_content` is blank/whitespace, dispatch continues with legacy prompt and returns `prompt_warning`.
- If prompt envelope is absent, behavior is unchanged from pre-integration path.

## Telemetry handshake recommendations

1. Retrieve prompt via vault-client (`vault_retrieve`) and pass envelope fields to `dispatch_subagent`.
2. Only call `vault_rate` after subagent execution actually runs and output is consumed.
3. If `prompt_applied=false`, do not emit a positive prompt-effect rating; treat as retrieval/integration issue first.
4. Preserve prompt provenance (`prompt_name`, `prompt_source`, `prompt_tags`) in any downstream evidence record.

## Phase 0 — Contract + wiring readiness (docs + interfaces)

## Goals
1. Define prompt-envelope schema for delegation.
2. Define end-to-end call pattern (`self -> vault -> dispatch_subagent`).
3. Add version compatibility notes.

## Deliverables
- This plan + assessment + decision log.
- New contract section in `dispatch_subagent` docs/description (no behavior break).

## Acceptance criteria
- Contract is documented in-repo.
- Responsibilities are explicit by repository.
- Rollback strategy for each phase documented.

## Validation
```bash
cd ~/programming/pi-extensions/pi-autonomous-session-control
npm run check
```

## Rollback
- Revert docs/contract changes only.

---

## Phase 1 — First implementation slice (high-leverage)

## Goals
Implement minimal end-to-end contract wiring without duplicating vault logic.

## Scope
1. Extend `dispatch_subagent` parameters with an optional prompt envelope:
   - `prompt_name?: string`
   - `prompt_content?: string`
   - `prompt_tags?: string[]`
   - `prompt_source?: string` (default `vault-client`)
2. If `prompt_content` is provided, prepend/append it deterministically to subagent system prompt.
3. Return prompt provenance in `details`.
4. Keep existing `systemPrompt` and profile behavior unchanged.
5. Add focused tests for new parameter behavior.

## Intended runtime pattern
1. Use vault-client retrieval:
   - `vault_retrieve({ names: ["meta-orchestration"], include_content: true })`
2. Pass content to delegation:
   - `dispatch_subagent({ profile: "reviewer", objective: "...", prompt_name: "meta-orchestration", prompt_content: "..." })`

## Acceptance criteria
- `dispatch_subagent` accepts prompt envelope fields.
- Subagent receives combined system prompt when envelope exists.
- Tool result includes provenance fields (`prompt_name`, `prompt_source`, `prompt_applied`).
- Existing calls without prompt envelope behave exactly as before.
- Tests cover prompt and no-prompt paths.

## Validation
```bash
cd ~/programming/pi-extensions/pi-autonomous-session-control
npm run check
```

Manual smoke (optional):
```bash
# In pi session with both extensions loaded
# 1) retrieve a cognitive prompt via vault-client
# 2) pass it into dispatch_subagent
# 3) verify result.details includes prompt provenance
```

## Rollback
- Remove new optional fields from `dispatch_subagent` schema/logic.
- Retain old profile/systemPrompt behavior.

---

## Phase 2 — Reliability + observability hardening

## Goals
1. Make cross-repo contract robust under failure and drift.
2. Improve evidence quality.

## Scope
1. Add explicit fallback messaging when prompt envelope is partial/invalid.
2. Add compatibility guard notes (vault-client version + schema version expectations).
3. Add integration test harness for tool-chain contract (mocked vault payload).
4. Document telemetry handshake recommendations:
   - when to call `vault_rate`
   - how to avoid feedback-without-execution mismatches

## Acceptance criteria
- Invalid envelope fails soft with actionable guidance.
- At least one integration-oriented test covers prompt provenance and fallback.
- Integration includes a live prompt-vault DB path test when vault DB is available (`tests/prompt-vault-db-integration.test.mjs`).
- Docs include compatibility matrix and rollback steps.

## Validation
```bash
cd ~/programming/pi-extensions/pi-autonomous-session-control
npm run check
```

## Rollback
- Disable hardening branches behind feature flag or revert phase commits in order.

## Phase status checkpoint (2026-03-03)

### Completed

- ✅ Phase 0 completed:
  - Prompt-envelope contract documented.
  - Repository boundaries and decisions captured.
- ✅ Phase 1 completed:
  - `dispatch_subagent` prompt envelope parameters implemented.
  - Deterministic prompt injection + provenance fields implemented.
  - Backward compatibility with legacy `systemPrompt` path preserved.
- ✅ Phase 2 hardening slice completed:
  - Soft-fail fallback messaging implemented via `prompt_warning`.
  - Compatibility guard notes and telemetry handshake docs added.
  - Integration tests added:
    - mocked vault payload flow (`tests/prompt-vault-dispatch-integration.test.mjs`)
    - live prompt-vault DB flow (`tests/prompt-vault-db-integration.test.mjs`)
  - Additional runtime hardening completed:
    - bash command tracking now captures real command text
    - session-name sanitization for subagent session files
    - thrown spawner errors converted to structured tool results
    - subagent state refresh when sessions directory changes
  - Runtime compatibility self-check added:
    - `self-prompt-vault-compat` command now reports autonomy × vault-client × schema compatibility matrix
    - runtime probe implemented in `extensions/self/prompt-vault-compat.ts`
    - compatibility evaluation covered by `tests/prompt-vault-compat.test.mjs`
  - Live cross-extension harness added:
    - `tests/prompt-vault-cross-extension-live.test.mjs` registers real vault-client tools and chains `vault_query` -> `vault_retrieve` -> `dispatch_subagent`
    - harness readiness probe in `extensions/self/cross-extension-harness.ts` provides explicit skip gating when environment/dependencies are unavailable
    - vault-client entry discovery now supports both legacy `index.ts` and package-based entrypoints (e.g., `./extensions/vault.ts`)
    - retrieval envelope parser now preserves prompt content containing internal markdown `---` separators
    - harness specification documented in `docs/project/prompt-vault-cross-extension-harness.md`

### Remaining (Phase 2 follow-through)

- Align upstream telemetry edge cases (`vault_rate` FK fallback behavior) once upstream fixes land.
- Live harness test execution outside Pi runtime: documented recipe, but ESM resolution limits standalone execution.

### Current validation snapshot

- `npm run check` passes.
- Recursive test discovery active (`tests/**/*.test.*`).
- Prompt-envelope contract, fallback behavior, and integration paths are covered in-repo.

---

## Known upstream risks and deferred items

Not blocked, but should be tracked:
1. `vault_rate` fallback currently conflicts with FK behavior when no execution exists.
2. `prompt_eval` variant/test persistence is not migration-managed in base schema.
3. `vault_retrieve` structured response details may need enrichment for cleaner autonomous chaining.

These are **not** blockers for Phase 1 in this repo.
