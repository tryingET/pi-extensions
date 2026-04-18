---
summary: "Living current-vs-target map for @tryinget/pi-autoresearch, including the bounded runtime that exists today, the verified target control-plane state, and the AK task tree that reached that target."
read_when:
  - "Before starting any new pi-autoresearch task in a fresh context window."
  - "When deciding what is already landed vs what still belongs to future bounded slices."
  - "When closing a pi-autoresearch workstream and needing to update the package's current-vs-target truth."
type: "reference"
system4d:
  container: "Package-local living plan/status anchor for the pi-autoresearch runtime, its reached target control-plane state, and any later widening beyond that bounded target."
  compass: "Keep bounded runtime truth separate from future ambition, and keep any post-target work decomposed into fresh-context-sized slices."
  engine: "State current reality -> preserve the target done-state truth -> map the landed task chain -> require doc updates when later widening starts."
  fog: "The main risks are stale planning, over-claiming the current package as a broader autonomous plane than it is, or losing fresh-context continuity after the target rollout is already complete."
---

# Current vs target — `@tryinget/pi-autoresearch`

## Purpose

This file is the **fresh-context anchor** for `packages/pi-autoresearch`.

Read this first when starting new work on the package.
It answers three questions:

1. what is already real today
2. what the actual target done-state is
3. which scoped AK umbrellas/tasks reached that target and now define the post-target baseline

## Update rule

When a task changes any row in this file, update this file in the **same pass**.
At minimum, update:

- the capability matrix row(s)
- the task-tree row(s)
- the "current truthful state" paragraph if the package phase changed materially

## Current truthful state

Today `pi-autoresearch` is in the **live-supervised bounded target-control-plane** phase.

That means the repo now has:

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
- an orchestrator-side live supervision runner with bounded polling/session policy above exact package runtime truth
- complete-only AK task lifecycle automation after verified package-local completion
- an operator-facing `autoresearch_live_supervision` surface for exact `status` / `observe` / `start` / `stop`
- durable status/proof notes for all four workstreams

This now satisfies the target done-state defined in this file.
It also now has one bounded **post-target widening slice** landed locally:

- a typed llama.cpp benchmark campaign manifest contract
- a bounded `autoresearch_llamacpp_campaign` tool for deterministic `plan_matrix` and `prepare_fork` behavior
- package-local problem-intent/RFC notes for manifest-driven brownfield benchmark orchestration

The next active widening slice is now contract-defined but **not yet landed**:

- explicit per-build `buildBinDir` bindings for executable manifest builds
- one explicit `workflow.executionBinding.receiptRootPath` for build-scoped 41/42/43 outputs
- one stage-scoped execution surface above the existing workstation scripts

What it still does **not** have is any wider daemonized autonomy, auto-fail framework, remote-review control plane, or direct manifest-driven 41/42/43 campaign execution beyond that bounded planning/prep surface.

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
3. [target control-plane master status](../../../../docs/project/pi-autoresearch-target-control-plane-status.md)
4. [runtime machine and event-ledger status](../../../../docs/project/2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md)
5. [supervision and AK projection status](../../../../docs/project/2026-04-16-pi-autoresearch-supervision-and-ak-projection-status.md)
6. [live supervision and AK lifecycle status](../../../../docs/project/pi-autoresearch-live-supervision-ak-lifecycle-status.md)
7. [architecture correction](../../../../docs/project/pi-autoresearch-architecture-correction.md)
8. [llama.cpp benchmark campaign manifest problem-intent](./2026-04-18-llamacpp-benchmark-campaign-manifest-problem-intent.md)
9. [llama.cpp benchmark campaign manifest RFC](./2026-04-18-llamacpp-benchmark-campaign-manifest-rfc.md)
10. the contract/status note for the specific active follow-on work, if any

## Capability matrix

| Capability | Current | Target done when | Primary owner(s) | Main verification |
|---|---|---|---|---|
| Package-local runtime machine + ledger | Landed | stays stable as the runtime kernel under all later work | `packages/pi-autoresearch` | package tests + runtime status note |
| Machine-invoked Prompt Vault decisions | Landed (Workstream A) | stays stable as the first governed decision layer above the bounded runtime kernel | `packages/pi-autoresearch` | decision tests + runtime integration tests + decision status note |
| Resume / autonomy lifecycle | Landed (bounded Workstream B) | campaigns can reload control state, resume lawfully, and preserve decision context across fresh sessions | `packages/pi-autoresearch` | resume tests + control-surface tests + resume status note |
| Safer finalization orchestration | Landed (bounded Workstream C) | finalization is planned, grouped, materialized, and safety-fenced through explicit runtime/branch workflow | `packages/pi-autoresearch` | finalization tests + materialization tests + finalization status note |
| Live supervision / polling | Landed (Workstream D) | orchestrator can observe the runtime continuously through a bounded runner/polling policy | `packages/pi-society-orchestrator` | supervisor-runner tests + live supervision/lifecycle status note |
| AK task lifecycle automation | Landed (bounded Workstream D) | bounded lifecycle actions are contract-bound, idempotent, fail-closed, and proven end to end | `packages/pi-society-orchestrator` | lifecycle tests + live supervision/lifecycle status note |
| Operator-facing control plane | Landed (package + orchestrator) | operator can inspect and drive continue / rebaseline / finalize / stop from truthful package and live-supervision surfaces above the bounded kernel | package + orchestrator | control-surface tests + live control-plane tests + live supervision/lifecycle status note |
| Manifest-driven llama.cpp benchmark planning | Landed (post-target widening) | branch lineage, stage 41/42/43 matrix, and fork prep are explicit through a checked manifest plus the bounded `autoresearch_llamacpp_campaign` tool | `packages/pi-autoresearch` | package tests + problem-intent/RFC docs + README/current-vs-target updates |
| Manifest-driven 41/42/43 execution binding | Contracted next slice (not landed) | one manifest-listed build can plan/apply an exact stage 41, 42, or 43 workstation-script invocation through explicit build-bin + build-scoped receipt bindings | `packages/pi-autoresearch` + workstation `phasee/41-43` scripts | RFC/example contract + package tests + README/current-vs-target proof update |

## Scoped AK task tree

### Master umbrella

- `#1526` — **[UMBRELLA] Reach pi-autoresearch target control plane beyond the bounded runtime kernel**

Primary status artifact:
- `docs/project/pi-autoresearch-target-control-plane-status.md`

Current status:
- Master umbrella `#1526` is landed; the repo now has the bounded target control plane described in this file, all domain umbrellas below are complete, and the closure is recorded in `docs/project/pi-autoresearch-target-control-plane-status.md` without claiming daemonized autonomy, auto-fail policy, or remote review automation.

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

Current status:
- Workstream D / umbrella `#1542` is landed through `#1546`; the orchestrator now exposes exact `autoresearch_live_supervision` `status` / `observe` / `start` / `stop` actions, can supervise exact anchored campaigns live through bounded polling, can complete the anchored AK task after verified package-local completion, and records the closure in `docs/project/pi-autoresearch-live-supervision-ak-lifecycle-status.md` without claiming a hidden daemon, auto-fail policy, or remote review control plane.

## Dependency shape

The task tree is intentionally staged:

- Workstream A first: runtime decision integration
- Workstreams B and C build on the runtime becoming decision-aware
- Workstream D comes last because live supervision/lifecycle automation should target the fuller package truth, not the earlier bounded kernel alone

## Post-target widening note

### Manifest-driven llama.cpp benchmark campaign planning

A bounded post-target widening slice is now landed locally for brownfield llama.cpp benchmarking:

- checked manifest contract for branch / cherry-pick / lane / evidence intent
- explicit `phasee/41-43` workflow anchors in the manifest
- bounded `autoresearch_llamacpp_campaign` tool with `plan_matrix` and `prepare_fork`

This slice is intentionally still **planning/prep only**.
It does **not** yet mean the package owns direct 41/42/43 execution, campaign receipt projection for this concern, or AK-backed campaign truth.

### Next active slice — bounded 41/42/43 execution binding

Active umbrella:

- `#1635` — **[UMBRELLA] Bind manifest-driven llama.cpp campaigns to bounded 41/42/43 execution**
  - `#1636` — Write manifest-driven 41/42/43 execution-binding contract and done-state
  - `#1640` — Implement bounded manifest-driven 41/42/43 execution surface in pi-autoresearch
  - `#1642` — Prove manifest-driven 41/42/43 execution binding and update current-vs-target

Current status:

- `#1636` freezes the execution-binding contract in the RFC/example/current-vs-target surfaces
- the slice is still **not landed**
- it remains stage-scoped on purpose and does **not** yet include receipt/status projection or AK-backed campaign truth

## What must stay true while implementing

Do **not** let future tasks silently collapse boundaries:

- Prompt Vault still owns durable decision procedures
- `packages/pi-autoresearch` still owns executable runtime state
- AK still owns durable campaign/task truth
- local receipts/ledger remain projections, not the only durable control-plane truth
- orchestrator-side automation remains bounded and fail-closed until explicitly widened

## If you are starting the next task fresh

1. read this file plus `docs/project/pi-autoresearch-target-control-plane-status.md`
2. decide whether the work is a genuine post-target widening rather than unfinished Workstreams A-D
3. identify or create the active AK task id for that new bounded slice
4. inspect the scoped required paths from AK before coding
5. keep the implementation within that bounded scope and update this file when the post-target baseline changes materially
