---
summary: "Fresh-context anchor for @tryinget/pi-autoresearch: landed baseline, live boundaries, and the few docs you should read next."
read_when:
  - "Before starting any new pi-autoresearch task in a fresh context window."
  - "When deciding what is already landed vs what still belongs to future bounded slices."
  - "When closing a pi-autoresearch workstream and needing to update the package's current-vs-target truth."
type: "reference"
system4d:
  container: "Package-local status anchor for pi-autoresearch."
  compass: "Keep current truth short, bounded, and easy to reload in a fresh context."
  engine: "State landed baseline -> state live boundaries -> point to the canonical follow-on docs."
  fog: "The main risk is stale or overclaimed scope that makes the package sound broader than it is."
---

# Current vs target — `@tryinget/pi-autoresearch`

## What this file is for

Use this as the fastest truthful answer to:

1. what is landed
2. what is still out of scope
3. which doc set to read next

If a task changes landed baseline, boundaries, or the read map, update this file in the same pass.

## Current truthful state

- phase: `live-supervised bounded target-control-plane`
- target control-plane done-state is reached; that is now the baseline
- new work should usually be framed as:
  - post-target widening
  - hardening
  - docs/status cleanup
- do **not** reopen Workstreams A-D unless the task is clearly fixing regression or drift

## Landed baseline

Operator/runtime surfaces:

- `/autoresearch`
- `autoresearch_runtime_status`
- `autoresearch_runtime_run`
- `autoresearch_runtime_control`
- `autoresearch_runtime_finalize`
- `autoresearch_runtime_autoplan`
- `autoresearch_runtime_setup`
- `autoresearch_runtime_peer_assist`
- `autoresearch_runtime_loop`
- `autoresearch_live_supervision`

Core truths now landed:

- package-local XState campaign machine
- typed event model + append-only local ledger
- governed Prompt Vault decision flow for `setup`, `next-hypothesis`, and `finalize`
- checked resumable control posture with explicit `continue` / `rebaseline` / `finalize` / `stop`
- safer finalization with plan / approve / materialize plus freshness and git-safety fences
- bounded orchestrator-side live supervision and AK lifecycle automation above exact package truth
- bounded repo/problem autoplan that proposes campaign config, benchmark/check commands, scope, risks, exact setup call, optional metric-emitting `autoresearch.sh` scripts for safe generic benchmark mismatches, measurement-contract gating for whether a proposed metric may drive baseline optimization, duplicate benchmark/check command detection for package-script aliases, noise-aware duration-metric interpretation with calibration run support, `calibration_signal` labeling for calibration-only faster samples, optional DSPx `program-gen` handoff intent, and evidence-only DSPx behavior advisory proposals for an `AutoresearchSetupPlanner` candidate
- run receipts can now carry first-class hypothesis/result lineage so a bounded run records what hypothesis/intervention was tested, expected primary effect, target files, experiment risk, and controller-verified visible candidate binding metadata without becoming AK evidence by itself
- run and segment output now carries an explicit empirical decision class so `baseline` / `candidate` / `checks_failed` operational status does not masquerade as measured meaning
- `autoresearch_runtime_status` can now emit a package-local `autoresearch.closeout.v1` segment closeout packet that summarizes run lineage, candidate bindings, empirical decision, recommended action, and the explicit boundary before AK evidence or KES learning promotion
- `autoresearch_runtime_status action=ak_evidence` can derive a non-mutating exact-task `autoresearch.ak_evidence.v1` AK evidence packet plus suggested explicit `evidence_record(...)` controller call without writing AK directly
- `autoresearch_runtime_status action=learning` can derive an adapter-ready `autoresearch.learning.v1` knowledge export packet for KES/KMS/notes consumers without making pi-autoresearch the owner of those systems
- `autoresearch_runtime_status action=adapter_contracts` can list the current `autoresearch.adapter_contracts.v1` catalog so downstream adapters can discover supported packet kinds without scraping prose docs
- `docs/project/adapter-contracts.md` defines the portable packet/adapter boundary so AK, Beads, KES, notes, issue trackers, and custom KMS integrations can live as separate Pi extensions instead of being absorbed into pi-autoresearch
- setup materializer that can plan/apply a config receipt or bootstrap a baseline without forcing a human slash-command wizard
- plan-only visible peer-assist handoff through canonical `scout_peer_spawn` / `candidate_peer_spawn` / `fork_peer_spawn` calls
- bounded in-call autoresearch loop with required iteration budget, optional wall-clock/posture gates, live progress updates, governed next-hypothesis bridge, and explicit peer-launch handoff policy

Canonical closure:

| Area | Status | Canonical note |
|---|---|---|
| Master target control plane | Landed | `docs/project/pi-autoresearch-target-control-plane-status.md` |
| Workstream A — Prompt Vault decisions | Landed | `packages/pi-autoresearch/docs/project/prompt-vault-runtime-decision-status.md` |
| Workstream B — resume/control surface | Landed | `packages/pi-autoresearch/docs/project/resume-control-surface-status.md` |
| Workstream C — finalization orchestration | Landed | `packages/pi-autoresearch/docs/project/finalization-orchestration-status.md` |
| Workstream D — live supervision + AK lifecycle | Landed | `docs/project/pi-autoresearch-live-supervision-ak-lifecycle-status.md` |

AK anchor:

- umbrella `#1526` complete

## Landed post-target slices

### Manifest-driven llama.cpp campaign stack

Landed bounded surfaces:

- `autoresearch_llamacpp_campaign`
  - manifest planning / fork prep
  - stage-scoped `41` / `42` / `43` execution binding
  - receipt/status projection
  - non-mutating AK binding
  - one-step campaign-local autonomy
- `autoresearch_llamacpp_campaign_control`
  - bounded public status + one-step advance
  - optional live AK task verification semantics

Canonical docs:

- `packages/pi-autoresearch/docs/project/llamacpp-execution-binding-status.md`
- `packages/pi-autoresearch/docs/project/llamacpp-campaign-projection-status.md`
- `packages/pi-autoresearch/docs/project/llamacpp-campaign-ak-binding-status.md`
- `packages/pi-autoresearch/docs/project/llamacpp-campaign-autonomy-status.md`
- `packages/pi-autoresearch/docs/project/llamacpp-campaign-control-surface-status.md`
- `packages/pi-autoresearch/docs/adr/2026-04-18-public-ak-task-verification-semantics.md`

AK/decision anchors:

- umbrella `#1634` complete
- decision `17` accepted

### Self-hosting first bounded slice

Landed bounded surfaces:

- `autoresearch_self_hosting_run`
  - bounded public status / prepare-candidate / run / start_and_watch / rollback surface for the supervised self-hosting contract
  - `start_and_watch` streams in-call progress for one bounded wave without creating a hidden background daemon or package-local watcher
  - optional promotion-record planning/apply only after default-promotion classification; still no package-local self-promotion
- validated self-hosting contract + evaluator lock
- controller/candidate isolation
- snapshot-owned evaluator entrypoints
- typed applicability classification
- explicit promotion/rollback record
- no package-local self-promotion

Canonical docs:

- `packages/pi-autoresearch/docs/adr/2026-04-22-supervised-self-hosting-contract.md`
- `packages/pi-autoresearch/docs/project/2026-04-22-plan-self-hosting-contract-first-slice.md`
- `packages/pi-autoresearch/docs/project/2026-04-22-validation-rollout-rollback-self-hosting-contract.md`

AK/decision anchors:

- decision `18` accepted
- umbrella `#1806` complete

## Still out of scope

These are **not** landed baseline behavior:

- hidden daemonized autonomy
- direct AK mutation from package surfaces
- whole-campaign execution above exact bounded stage/control steps
- semantic winner interpretation
- remote-review control plane
- package-local self-promotion
- automatic controller rotation
- automatic visible peer spawning from pi-autoresearch; explicit `launch_*` peer modes return a canonical handoff for controller/operator dispatch rather than invoking peer tools internally
- DSPx program-gen outputs as setup authority; DSPx remains a local evidence/program-synthesis handoff and pi-autoresearch still owns applying setup and running loops

## Ownership boundaries

- `packages/pi-autoresearch`: executable runtime state, bounded orchestration, optional posture-gated run/loop execution, and canonical visible peer-lane handoff planning after status/run/loop inspection
- `packages/pi-little-helpers`: visible peer launch surfaces (`fork_peer_spawn`, `scout_peer_spawn`, `candidate_peer_spawn`)
- `packages/pi-peer-messaging`: intercom communication and ACK/FINAL protocol snapshots, not authority
- Prompt Vault: durable decision procedures
- AK: durable campaign/task truth
- orchestrator: bounded live supervision / lifecycle automation above package truth
- local receipts, snapshots, and projection files: projections, not sole durable truth

## Fresh-context read map

Always read:

1. `packages/pi-autoresearch/README.md`
2. this file
3. `docs/project/pi-autoresearch-target-control-plane-status.md`

Then read only the concern-local set you need:

| If your task is about... | Read next |
|---|---|
| core runtime baseline | `docs/project/2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md`; `docs/project/pi-autoresearch-live-supervision-ak-lifecycle-status.md`; `docs/project/pi-autoresearch-architecture-correction.md` |
| manifest-driven campaigns | `packages/pi-autoresearch/docs/project/llamacpp-execution-binding-status.md`; `packages/pi-autoresearch/docs/project/llamacpp-campaign-projection-status.md`; `packages/pi-autoresearch/docs/project/llamacpp-campaign-ak-binding-status.md`; `packages/pi-autoresearch/docs/project/llamacpp-campaign-autonomy-status.md`; `packages/pi-autoresearch/docs/project/llamacpp-campaign-control-surface-status.md` |
| public AK task verification semantics | `packages/pi-autoresearch/docs/adr/2026-04-18-public-ak-task-verification-semantics.md`; `packages/pi-autoresearch/docs/project/2026-04-18-plan-public-ak-task-verification.md`; `packages/pi-autoresearch/docs/project/2026-04-18-validation-rollout-rollback-public-ak-task-verification.md` |
| self-hosting first slice | `packages/pi-autoresearch/docs/adr/2026-04-22-supervised-self-hosting-contract.md`; `packages/pi-autoresearch/docs/project/2026-04-22-plan-self-hosting-contract-first-slice.md`; `packages/pi-autoresearch/docs/project/2026-04-22-validation-rollout-rollback-self-hosting-contract.md` |
| self-hosting architecture changes | the self-hosting ADR + the problem/evidence/RFC/review chain under `packages/pi-autoresearch/docs/project/2026-04-22-*self-hosting*` |

## Update rule

When baseline truth changes, update:

- current truthful state
- landed/out-of-scope bullets
- read map
- AK/decision anchors if the canonical umbrella or decision changes
