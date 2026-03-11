---
summary: "AK-backed execution backlog for Vault Execution Receipts and Receipt Replay Harness in pi-vault-client."
read_when:
  - "Seeding Agent Kernel tasks for the vault receipts / replay project."
  - "Launching a fresh worker session for one backlog item."
  - "Running the supervisor/worker loop without re-explaining task scope each time."
system4d:
  container: "Repo-local canonical backlog spec for an AK-backed brownfield implementation program."
  compass: "Keep task payloads stable, make worker sessions self-sufficient, and preserve additive rollout."
  engine: "Task anchor -> scope -> acceptance -> validation -> rollback -> dependency graph."
  fog: "Main risk is stuffing too much hidden context into AK task titles instead of keeping durable task truth in this document."
---

# Vault Execution Receipts + Replay Harness — AK backlog

## Purpose

This document is the durable task-spec companion for the AK-backed work queue for `pi-vault-client`.

- **Canonical queue state:** Agent Kernel (`ak`) task rows in the active `AK_DB`
- **Canonical detailed task payload for this repo:** this document
- **AK task title convention:** `[VRE-XX] <short title>`
- **Worker rule:** read the matching task anchor here before making changes

## Repo + execution context

- Repo path: `/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`
- Canonical AK wrapper path: `/home/tryinget/ai-society/softwareco/owned/agent-kernel/scripts/ak-v2.sh`
- Canonical AK env file: `/home/tryinget/ai-society/softwareco/owned/agent-kernel/.ak-env-v2`

This package does **not** currently carry a package-local `.ak-env-v2` or `scripts/ak-v2.sh` wrapper.
Use the central `agent-kernel` wrapper directly until/unless the monorepo package template standardizes a local helper.

## Loop contract

Every worker task runs this sequence unless blocked earlier:

1. Read task anchor in this file
2. Implement the smallest coherent task-complete slice
3. Run validation commands
4. Run deep review
5. Apply nexus implementation for the highest-leverage findings only
6. Run atomic-completion closeout
7. Re-run validation
8. Commit if and only if the task is complete and validations pass
9. Return structured result to supervisor

## Stop rules

A worker must stop with `needs_human` when:
- a privacy/persistence boundary needs a new policy decision
- a Prompt Vault schema change becomes necessary for the current slice
- work must spill outside `packages/pi-vault-client` beyond clearly local docs/tests
- there are multiple materially different design choices with no dominant answer

A worker must stop as `blocked` when:
- a dependency task is incomplete
- baseline is already red and cannot be isolated
- required runtime/environment tooling is unavailable
- acceptance criteria cannot be reached without widening scope

## Validation baseline

Default commands unless overridden in a task:

```bash
npm run typecheck
npm run check
```

## Evidence check-type suggestions

- `planning:task-spec`
- `implementation:code`
- `review:deep`
- `review:nexus`
- `review:atomic-completion`
- `validation:typecheck`
- `validation:package`
- `validation:manual`
- `commit:created`

## Task graph

```text
VRE-00 -> VRE-01 -> VRE-02
VRE-02 -> VRE-03
VRE-02 -> VRE-04
VRE-03 + VRE-04 -> VRE-05
VRE-03 + VRE-04 -> VRE-06
VRE-05 + VRE-06 -> VRE-07
VRE-05 + VRE-06 -> VRE-08 -> VRE-09
VRE-07 + VRE-09 -> VRE-10
```

---

## VRE-00 — Add AK tasking guidance + backlog anchors for pi-vault-client

### Objective
Create the durable repo-local backlog spec and reusable operator prompts so future fresh sessions can execute the receipts/replay project without repeated manual re-explanation.

### In scope
- `docs/dev/plans/vault-receipts-ak-backlog.md`
- `prompts/task-supervisor-loop.md`
- `prompts/task-worker-loop.md`
- `NEXT_SESSION_PROMPT.md` as the repo-local handoff for the queue-driven next slice
- package-local docs only if needed to reference the new workflow

### Out of scope
- receipt runtime code
- replay runtime code
- AK CLI feature changes

### Acceptance criteria
- This backlog document exists with stable anchors `VRE-00` through `VRE-10`
- Supervisor and worker prompt files exist and are reusable
- Worker prompt encodes the loop `implement -> validate -> deep-review -> nexus -> atomic-completion -> revalidate -> commit`
- Task refs, acceptance criteria, validation, and rollback notes are present for all backlog items

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Revert the added docs/prompt files.

---

## VRE-01 — Author Vault Execution Receipt architecture note

### Objective
Freeze the v1 architecture for execution receipts before implementation begins.

### In scope
- `docs/dev/vault-execution-receipts.md`
- terminology and phased rollout definition

### Out of scope
- runtime code
- storage implementation

### Acceptance criteria
- doc defines the receipt purpose, schema v1, sink abstraction, privacy boundary, replay contract, rollout phases, and open decisions
- terminology is explicit for `invocation_surface`, `invocation_channel`, `selection_mode`, `company_source`, and `llm_tool_call`
- doc explains why phase 1 avoids a Prompt Vault schema migration

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Revert the architecture note.

---

## VRE-02 — Add receipt types and builder/sink interfaces

### Objective
Create the canonical receipt type model and builder contract used by all later slices.

### In scope
- `src/vaultTypes.ts` as the canonical home for public receipt model and contract interfaces
- `src/vaultReceipts.ts` for builder/sink helpers and receipt-local implementation logic
- `tests/vault-receipts.test.mjs` for focused receipt builder/type behavior

### Out of scope
- command wiring
- persistence sink implementation beyond interfaces/helpers

### Acceptance criteria
- `VaultExecutionReceiptV1` and other public receipt contract interfaces live in `src/vaultTypes.ts`
- `src/vaultReceipts.ts` contains the builder/sink helper logic against those types
- receipt builder input/output types exist
- sink interface exists
- replay-safe input summary shape is defined
- `tests/vault-receipts.test.mjs` verifies builder shape and minimal normalization

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Revert type additions and receipt builder module.

---

## VRE-03 — Implement local JSONL receipt sink and read helpers

### Objective
Add a local additive sink for receipts that requires no Prompt Vault DB schema change.

### In scope
- JSONL sink implementation
- latest/by-execution read helpers
- deterministic spool path policy

### Out of scope
- command wiring
- DB persistence in Prompt Vault

### Acceptance criteria
- receipts can be appended safely to local JSONL storage
- helper can read latest receipt
- helper can read receipt by execution ID
- tests prove deterministic local sink behavior and isolated test paths

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Disable/remove local receipt sink and helpers.

---

## VRE-04 — Return execution metadata from logExecution()

### Objective
Make execution logging return enough metadata to bind receipts to real execution rows.

### In scope
- `src/vaultDb.ts`
- any receipt-facing runtime types
- tests for execution metadata return value

### Out of scope
- receipt writing
- replay

### Acceptance criteria
- execution logging returns concrete execution metadata including execution ID
- existing execution behavior remains intact
- tests prove stable binding to real execution rows

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Revert to the previous logging contract.

---

## VRE-05 — Emit receipts for /vault and live /vault:

### Objective
Instrument the primary vault execution surfaces so they emit receipts after successful prompt preparation/execution logging.

### In scope
- `src/vaultCommands.ts`
- `src/vaultPicker.ts`
- receipt builder/sink integration
- tests for `/vault` and live `/vault:`

### Out of scope
- `/route`
- grounding
- replay

### Acceptance criteria
- `/vault` emits receipts with exact template/version/company/render metadata
- live `/vault:` emits equivalent receipts
- selection mode is captured accurately (`exact`, `picker-fzf`, `picker-fallback`)
- tests cover emitted receipt content and execution binding

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Disable receipt emission for `/vault` and live `/vault:`.

---

## VRE-06 — Emit receipts for /route and grounding

### Objective
Extend receipt emission to secondary vault-derived execution paths.

### In scope
- `src/vaultCommands.ts`
- `src/vaultGrounding.ts`
- tests for `/route` and grounding flows

### Out of scope
- replay command/tool
- DB persistence

### Acceptance criteria
- `/route` emits receipts with `invocation_surface=/route`
- grounding emits receipts with `invocation_surface=grounding`
- company source and render metadata remain explicit
- tests cover route/grounding receipts and failure-path behavior

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Disable receipt emission on `/route` and grounding paths.

---

## VRE-07 — Add receipt inspection command/tool

### Objective
Make receipts practically inspectable so they become useful to operators immediately.

### In scope
- one minimal command (for example `/vault-last-receipt` or `/vault-receipt <execution_id>`)
- optional tool surface if low-risk
- docs for inspection workflow

### Out of scope
- replay engine
- analytics/reporting dashboard

### Acceptance criteria
- operator can inspect latest or exact receipt deterministically
- inspection output shows template/version/company/surface/render metadata and replay-safe inputs
- headless use is possible if a tool surface is added

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Remove inspection command/tool and keep sink internals private.

---

## VRE-08 — Implement replay core and drift classification

### Objective
Make receipts executable by reconstructing prompt preparation from stored provenance and classifying drift.

### In scope
- `src/vaultReplay.ts`
- replay input normalization
- drift report model
- tests for match vs drift

### Out of scope
- full model-output replay
- dashboard/reporting UI

### Acceptance criteria
- replay can rebuild prepared prompt text from a stored receipt
- replay reports `match | drift | unavailable`
- drift reasons include at least template missing, version mismatch, render mismatch, company mismatch, and missing input contract
- tests prove same-version replay and controlled-drift behavior

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Remove replay core and keep receipts as passive provenance only.

---

## VRE-09 — Add replay command/tool surface

### Objective
Expose replay as an operator-facing capability.

### In scope
- `/vault-replay <execution_id>` and/or `vault_replay_receipt`
- deterministic replay output formatting
- docs/examples

### Out of scope
- batch replay
- replay analytics

### Acceptance criteria
- operator can invoke replay by execution ID
- output includes replay status, regenerated prompt, and drift report if applicable
- command/tool stays within current privacy boundaries

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Remove replay surface and leave replay core internal.

---

## VRE-10 — Add receipt/replay tests and operator docs

### Objective
Finish the project with strong tests and truthful docs so the additive system is maintainable and usable.

### In scope
- tests for receipt emission and replay across surfaces
- `README.md`
- `docs/dev/status.md`
- optional next-session/handoff updates

### Out of scope
- DB persistence migration
- historical backfill

### Acceptance criteria
- tests cover receipts for primary and secondary execution surfaces
- docs explain what receipts are, where they live, how to inspect them, and how to replay them
- package gate remains green

### Validation
```bash
npm run typecheck
npm run check
```

### Rollback
Revert docs/tests tied only to the receipts/replay subsystem.

---

## Suggested AK seeding commands

```bash
cd /home/tryinget/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2

REPO=/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client

./scripts/ak-v2.sh task create --repo "$REPO" -P 4 "[VRE-00] Add AK tasking guidance + backlog anchors for pi-vault-client"
./scripts/ak-v2.sh task create --repo "$REPO" -P 4 "[VRE-01] Author Vault Execution Receipt architecture note"
./scripts/ak-v2.sh task create --repo "$REPO" -P 4 "[VRE-02] Add receipt types and builder/sink interfaces"
./scripts/ak-v2.sh task create --repo "$REPO" -P 3 "[VRE-03] Implement local JSONL receipt sink and read helpers"
./scripts/ak-v2.sh task create --repo "$REPO" -P 4 "[VRE-04] Return execution metadata from logExecution()"
./scripts/ak-v2.sh task create --repo "$REPO" -P 4 "[VRE-05] Emit receipts for /vault and live /vault:"
./scripts/ak-v2.sh task create --repo "$REPO" -P 3 "[VRE-06] Emit receipts for /route and grounding"
./scripts/ak-v2.sh task create --repo "$REPO" -P 3 "[VRE-07] Add receipt inspection command/tool"
./scripts/ak-v2.sh task create --repo "$REPO" -P 4 "[VRE-08] Implement replay core and drift classification"
./scripts/ak-v2.sh task create --repo "$REPO" -P 3 "[VRE-09] Add replay command/tool surface"
./scripts/ak-v2.sh task create --repo "$REPO" -P 4 "[VRE-10] Add receipt/replay tests and operator docs"
```

Wire dependencies after task IDs are known with `./scripts/ak-v2.sh task add-deps <id> --deps <ids>`.
