---
summary: "Living current-vs-target map for @tryinget/pi-autoresearch, including the bounded runtime that exists today, the verified target control-plane state, and the AK task tree that closes the remaining gaps."
read_when:
  - "Before starting any new pi-autoresearch task in a fresh context window."
  - "When deciding what is already landed vs what still belongs to future bounded slices."
  - "When closing a pi-autoresearch workstream and needing to update the package's current-vs-target truth."
type: "reference"
system4d:
  container: "Package-local living plan/status anchor for the pi-autoresearch runtime and its remaining control-plane gaps."
  compass: "Keep bounded runtime truth separate from target-state ambition, and keep future work decomposed into fresh-context-sized slices."
  engine: "State current reality -> define target done-state -> map gaps to umbrellas/child tasks -> require doc updates as slices land."
  fog: "The main risks are stale planning, over-claiming the current package as a full control plane, or losing fresh-context continuity across long-running implementation waves."
---

# Current vs target — `@tryinget/pi-autoresearch`

## Purpose

This file is the **fresh-context anchor** for `packages/pi-autoresearch`.

Read this first when starting new work on the package.
It answers three questions:

1. what is already real today
2. what the actual target done-state is
3. which scoped AK umbrellas/tasks close the remaining gaps

## Update rule

When a task changes any row in this file, update this file in the **same pass**.
At minimum, update:

- the capability matrix row(s)
- the task-tree row(s)
- the "current truthful state" paragraph if the package phase changed materially

## Current truthful state

Today `pi-autoresearch` is in the **resume-aware bounded finalization-orchestration** phase.

That means the repo already has:

- a package-local XState campaign machine
- a typed event model
- an append-only local event ledger
- bounded runtime integration through `/autoresearch`, `autoresearch_runtime_status`, `autoresearch_runtime_run`, `autoresearch_runtime_control`, and `autoresearch_runtime_finalize`
- three governed one-shot Prompt Vault templates (`setup`, `next-hypothesis`, `finalize`)
- live machine-invoked Prompt Vault decisions for setup, post-run next-hypothesis, and finalize proposal flows through the public prompt-plane seam
- one checked package-local runtime snapshot for resumable control posture
- explicit operator intent for continue / rebaseline / finalize / stop with runtime-side gating and consumption
- one checked `autoresearch.finalization.json` plan artifact with fresh-plan reuse/discard rules
- explicit plan / approve / materialize finalization orchestration with approval, clean-tree, branch-collision, and verification fences
- package-local runtime completion after successful verified local review-branch materialization
- an orchestrator-side bounded supervisor + AK milestone projector + end-to-end evidence proof

What it still does **not** have is the full target control plane above that now decision-aware, resume-aware, finalization-orchestrating bounded runtime.

## Target done-state

The target is **not** "just more runtime code."
The target is a verified control-plane state where all of the following are true:

1. the live package runtime can invoke governed Prompt Vault decision steps lawfully
2. campaign state can resume cleanly across fresh sessions with explicit/autonomous control-state continuity
3. finalization is orchestrated through a safer grouped/materialized workflow instead of ad hoc branch handling
4. orchestrator-side supervision can run live with bounded polling policy
5. AK lifecycle automation can act on campaigns within an explicit, fail-closed contract
6. the operator has a truthful control surface for continue / rebaseline / finalize / stop decisions
7. each workstream has tests and a durable proof/status note

## Fresh-context read order

When starting in a clean context, read in this order:

1. [package README](../../README.md)
2. [current-vs-target](./current-vs-target.md)
3. [runtime machine and event-ledger status](../../../../docs/project/2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md)
4. [supervision and AK projection status](../../../../docs/project/2026-04-16-pi-autoresearch-supervision-and-ak-projection-status.md)
5. [architecture correction](../../../../docs/project/pi-autoresearch-architecture-correction.md)
6. the contract/status note for the specific active workstream below

## Capability matrix

| Capability | Current | Target done when | Primary owner(s) | Main verification |
|---|---|---|---|---|
| Package-local runtime machine + ledger | Landed | stays stable as the runtime kernel under all later work | `packages/pi-autoresearch` | package tests + runtime status note |
| Machine-invoked Prompt Vault decisions | Landed (Workstream A) | stays stable as the first governed decision layer above the bounded runtime kernel | `packages/pi-autoresearch` | decision tests + runtime integration tests + decision status note |
| Resume / autonomy lifecycle | Landed (bounded Workstream B) | campaigns can reload control state, resume lawfully, and preserve decision context across fresh sessions | `packages/pi-autoresearch` | resume tests + control-surface tests + resume status note |
| Safer finalization orchestration | Landed (bounded Workstream C) | finalization is planned, grouped, materialized, and safety-fenced through explicit runtime/branch workflow | `packages/pi-autoresearch` | finalization tests + materialization tests + finalization status note |
| Live supervision / polling | Missing | orchestrator can observe the runtime continuously through a bounded runner/polling policy | `packages/pi-society-orchestrator` | supervisor-runner tests + live supervision status note |
| AK task lifecycle automation | Missing | bounded lifecycle actions are contract-bound, idempotent, fail-closed, and proven end to end | `packages/pi-society-orchestrator` | lifecycle tests + live lifecycle proof note |
| Operator-facing control plane | Landed (package-local surface); wider live supervision/operator surfaces still remain | operator can inspect and drive continue / rebaseline / finalize / stop from a truthful surface above the bounded kernel | package + orchestrator | control-surface tests + live control-plane proof |

## Scoped AK task tree

### Master umbrella

- `#1526` — **[UMBRELLA] Reach pi-autoresearch target control plane beyond the bounded runtime kernel**

This umbrella closes only when all domain umbrellas below are complete and this file plus the final master status note are updated truthfully.

### Workstream A — Prompt Vault decision integration

- `#1527` — **[UMBRELLA] Wire machine-invoked Prompt Vault decisions into pi-autoresearch runtime**
  - `#1528` — Write pi-autoresearch live Prompt Vault decision contract and target state
  - `#1529` — Implement pi-autoresearch decision runtime adapter for governed Prompt Vault templates
  - `#1530` — Integrate machine-driven Prompt Vault decisions into pi-autoresearch runtime surfaces
  - `#1531` — Prove live pi-autoresearch Prompt Vault decision flow and update current-vs-target

Primary status artifact:
- `packages/pi-autoresearch/docs/project/prompt-vault-runtime-decision-status.md`

Current status:
- Workstream A / umbrella `#1527` is landed through `#1531`; the package now prepares exact governed setup / next-hypothesis / finalize templates, consumes them through bounded runtime surfaces, and proves the live next-hypothesis seam without widening into AK binding or router work.

### Workstream B — Resume/autonomy lifecycle + package control surface

- `#1532` — **[UMBRELLA] Land pi-autoresearch resume/autonomy lifecycle and operator control surface**
  - `#1533` — Write pi-autoresearch resume/control-surface contract and artifact model
  - `#1534` — Implement pi-autoresearch resumable runtime snapshot and control-state loader
  - `#1535` — Add pi-autoresearch operator control surface for continue/rebaseline/finalize/stop
  - `#1536` — Prove pi-autoresearch resume/control lifecycle and update current-vs-target

Primary status artifact:
- `packages/pi-autoresearch/docs/project/resume-control-surface-status.md`

Current status:
- Workstream B / umbrella `#1532` is landed through `#1536`; the package now writes and validates a checked runtime snapshot, exposes the explicit `autoresearch_runtime_control` surface, proves action legality plus runtime gating plus fresh-session resume behavior, and records the closure in `packages/pi-autoresearch/docs/project/resume-control-surface-status.md` without claiming full autonomy, AK lifecycle automation, or finalization materialization.

### Workstream C — Safer finalization orchestration

- `#1537` — **[UMBRELLA] Land safer pi-autoresearch finalization orchestration**
  - `#1538` — Write pi-autoresearch finalization orchestration contract and safety fences
  - `#1539` — Implement pi-autoresearch finalization planner and grouped artifact runtime
  - `#1540` — Implement safe pi-autoresearch finalization materialization and branch workflow
  - `#1541` — Prove safer pi-autoresearch finalization orchestration and update current-vs-target

Primary status artifact:
- `packages/pi-autoresearch/docs/project/finalization-orchestration-status.md`

Current status:
- Workstream C / umbrella `#1537` is landed through `#1541`; the package now writes a checked `autoresearch.finalization.json` plan artifact, exposes explicit `autoresearch_runtime_finalize` plan / approve / materialize actions, proves freshness and git-safety fences plus successful independent branch materialization, and records the closure in `packages/pi-autoresearch/docs/project/finalization-orchestration-status.md` without claiming AK lifecycle automation, remote review choreography, or branch cleanup.

### Workstream D — Live supervision + AK lifecycle automation

- `#1542` — **[UMBRELLA] Land live pi-autoresearch supervision, polling, and AK lifecycle automation**
  - `#1543` — Write live pi-autoresearch supervision/polling and AK lifecycle automation contract
  - `#1544` — Implement orchestrator live pi-autoresearch supervisor runner and polling policy
  - `#1545` — Implement bounded AK task lifecycle automation for pi-autoresearch campaigns
  - `#1546` — Add operator-facing supervision surface and prove live pi-autoresearch lifecycle automation

Primary status artifact:
- `docs/project/pi-autoresearch-live-supervision-ak-lifecycle-status.md`

## Dependency shape

The task tree is intentionally staged:

- Workstream A first: runtime decision integration
- Workstreams B and C build on the runtime becoming decision-aware
- Workstream D comes last because live supervision/lifecycle automation should target the fuller package truth, not the earlier bounded kernel alone

## What must stay true while implementing

Do **not** let future tasks silently collapse boundaries:

- Prompt Vault still owns durable decision procedures
- `packages/pi-autoresearch` still owns executable runtime state
- AK still owns durable campaign/task truth
- local receipts/ledger remain projections, not the only durable control-plane truth
- orchestrator-side automation remains bounded and fail-closed until explicitly widened

## If you are starting the next task fresh

1. identify the active AK task id from the task tree above
2. read this file plus the active workstream's contract/status note
3. inspect the scoped required paths from AK before coding
4. keep the implementation within that bounded scope
5. update this file when the workstream status changes
