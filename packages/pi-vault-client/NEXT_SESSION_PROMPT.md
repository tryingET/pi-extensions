---
summary: "Current handoff after the zero-defect runtime hardening pass in pi-vault-client."
read_when:
  - "Starting the next focused session in packages/pi-vault-client."
  - "Before changing vault runtime, render preparation, query error handling, or execution/feedback provenance."
system4d:
  container: "Canonical handoff for the post-hardening state of pi-vault-client."
  compass: "Do not reopen solved ambiguity; only continue on the explicitly remaining contracts."
  engine: "Reacquire quickly -> verify current truth -> continue only on the remaining bounded items."
  fog: "Main risk is treating completed correctness work as still-open, or reintroducing ambient magic while chasing rollout convenience."
---

# Next session prompt for `pi-vault-client`

## One-line handoff

The package-level correctness pass is complete and verified: render preparation is explicit, tool/query error handling is per-call rather than global-state-driven, execution provenance is exact, feedback binds to `execution_id`, and the only unresolved correctness item is **DB-enforced uniqueness for one feedback row per execution**, which requires Prompt Vault schema-owner action outside this package.

## What landed in the 2026-03-09 zero-defect follow-up

### Render contract hardening
- explicit `pi-vars` templates now fail clearly if the execution path does not supply the required positional args
- mutation-time content validation now rejects:
  - blank content
  - frontmatter-only bodies
  - unsupported explicit `render_engine` values
- framework grounding appendices now use the same shared preparation contract as normal template execution
- framework grounding now receives explicit render inputs:
  - `currentCompany`
  - synthesized `context`
  - positional `args`
  - structured `data`

### Query/read-path hardening
- active reliance on module-global query-error state was removed from live command/tool/picker/grounding paths
- per-call detailed result helpers now exist and are used on the live surfaces:
  - `queryVaultJsonDetailed(...)`
  - `getTemplateDetailed(...)`
  - `listTemplatesDetailed(...)`
  - `searchTemplatesDetailed(...)`
  - `queryTemplatesDetailed(...)`
  - `retrieveByNamesDetailed(...)`
- `/vault-search`, `/vault-check`, `/vault-stats`, picker flows, and grounding lookups now surface concrete query/lookup failures instead of silently degrading

### Provenance and feedback hardening
- execution logging already used the real template version; that contract remains intact
- feedback is now execution-bound rather than template-name-bound
- new tool: `vault_executions`
  - exposes exact `execution_id`
  - exposes `entity_version`
- `vault_rate(...)` now requires `execution_id`
- duplicate feedback is rejected at the runtime layer and covered by integration testing

### Scale/safety adjustments
- Dolt query buffer was increased to reduce scale-related truncation failures during ranking
- `intent_text` ranking now truncates scoring-only content reads (`LEFT(content, 4096)`) instead of pulling full template bodies unnecessarily

## Current package truth

### Runtime behavior
- generic `/vault` and live `/vault:` remain intentionally strict
- no generic-path legacy auto-detect was restored
- exact-match lookup, picker flows, and grounding all use explicit context handoff
- shared render preparation remains the canonical execution path

### Tool surface
- `vault_query` uses explicit tool-call execution context
- `vault_retrieve` uses explicit tool-call execution context
- `vault_insert` and `vault_update` require explicit mutation context and fail closed on ambiguity
- `vault_executions` is the required discovery step before `vault_rate`
- `vault_rate({ execution_id, ... })` is now the only supported feedback path

### Validation status
- package check passes cleanly
- current verification baseline:
  - `npm run check`
- test suite status at handoff:
  - `78` tests passing
  - `0` failing

## Remaining workstreams

### 1. Remaining correctness debt: Prompt Vault schema uniqueness for feedback
This is the only live correctness item still open.

Current package behavior already rejects duplicate feedback rows in runtime logic.
What is still missing is a **schema-level uniqueness guarantee** so concurrent multi-process writers cannot race past the client guard.

### 2. Separate operational backlog: Prompt Vault render-engine data migration
This is **not** a package-runtime ambiguity bug anymore.
It is an operator/data migration problem in Prompt Vault.

Last measured inventory (still the latest known number for the data backlog):
- active templates using legacy pi-vars tokens: `78`
- active templates with explicit `render_engine:` frontmatter: `0`

Treat that as Prompt Vault rollout work, not as a reason to weaken package runtime strictness.

## Deferred with contract

| Finding | Rationale | Owner | Trigger | Deadline | Blast Radius |
|---------|-----------|-------|---------|----------|--------------|
| DB-enforced uniqueness for one feedback row per execution | This pass added runtime duplicate rejection and a real temp-Dolt integration test, but absolute uniqueness under concurrent multi-process writers requires a Prompt Vault schema migration plus schema-owner approval on feedback cardinality. | Prompt Vault schema maintainers in `~/ai-society/core/prompt-vault`, coordinated with the `pi-vault-client` maintainer | Formal decision that feedback cardinality is **one row per execution** and a migration window opens | 2026-03-31 or before any concurrent/shared rollout of `vault_rate`, whichever comes first | Concurrent writers could still create duplicate feedback rows and skew analytics despite client-side guards |

## If the next session stays in `pi-vault-client`

Do **not** reopen solved design questions.
Only work in this package if one of these becomes true:
- a regression appears in the detailed-result query path
- Prompt Vault schema changes require client adaptation
- `vault_rate` semantics must be updated to match a schema decision
- a newly migrated template reveals a real renderer/preparation bug

If none of those are true, package correctness work is done enough for now.

## If the next session moves into Prompt Vault

Focus on one of these bounded tracks:

### Feedback schema track
- decide whether feedback cardinality is truly **one row per execution**
- if yes, add schema enforcement in Prompt Vault (for example, a uniqueness constraint or equivalent migration strategy)
- align package/runtime docs with that decision

### Render-engine rollout track
- re-measure the live inventory
- classify legacy templates into:
  - plain `none`
  - explicit `nunjucks`
  - true args-supplying `pi-vars`
- migrate only the smallest safe batch first
- keep generic `/vault` and live `/vault:` strict

## 15-minute reacquisition protocol

Read these in order before touching code:
1. `AGENTS.md`
2. `README.md`
3. `NEXT_SESSION_PROMPT.md`
4. `src/templateRenderer.js`
5. `src/vaultDb.ts`
6. `src/vaultTools.ts`
7. `src/vaultCommands.ts`
8. `src/vaultPicker.ts`
9. `src/vaultGrounding.ts`
10. `src/vaultTypes.ts`
11. `tests/template-renderer.test.mjs`
12. `tests/vault-grounding.test.mjs`
13. `tests/vault-dolt-integration.test.mjs`
14. `tests/vault-update.test.mjs`
15. `tests/vault-query-regression.test.mjs`

Then run:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
```

## Files most relevant to the current truth

### Core runtime
- `src/templateRenderer.js`
- `src/vaultDb.ts`
- `src/vaultTools.ts`
- `src/vaultCommands.ts`
- `src/vaultPicker.ts`
- `src/vaultGrounding.ts`
- `src/vaultTypes.ts`

### High-value tests
- `tests/template-renderer.test.mjs`
- `tests/vault-grounding.test.mjs`
- `tests/vault-dolt-integration.test.mjs`
- `tests/vault-update.test.mjs`
- `tests/vault-query-regression.test.mjs`

### Operator docs
- `README.md`
- `docs/dev/live-render-engine-validation.md`
- `docs/dev/legacy-render-engine-rollout.md`

## Non-goals and hard noes

- do **not** restore generic legacy pi-vars auto-detect on `/vault` or live `/vault:`
- do **not** reintroduce module-global query-error state as the primary error channel
- do **not** weaken explicit mutation-context requirements
- do **not** turn Prompt Vault data migration pressure into package-runtime ambiguity
- do **not** broaden feedback semantics casually; either keep exact execution binding or change it explicitly with schema-owner approval

## Verification baseline that already passed

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run check
```

That passing gate includes:
- renderer tests
- grounding tests
- query regression tests
- update/mutation tests
- temp-Dolt integration coverage for exact execution-bound feedback

## Success condition for the next session

A next focused session is successful if it does **one** of the following cleanly:

1. lands the Prompt Vault schema decision/migration for feedback uniqueness
2. executes a small, explicit Prompt Vault render-engine migration batch without weakening runtime strictness
3. fixes a newly observed regression without reopening solved ambiguity

If none of those happen, the right action is to leave the package alone rather than churn completed correctness work.
