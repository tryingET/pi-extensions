---
summary: "Projection-only contract for surfacing pi-autoresearch campaign milestones into AK without turning AK into the runtime microstate owner."
read_when:
  - "Before implementing or reviewing the autoresearch supervisor -> AK projection path."
  - "When deciding what pi-society-orchestrator may write into AK from pi-autoresearch runtime state."
type: "reference"
system4d:
  container: "Repo-root cross-package contract note for pi-autoresearch milestone projection into Agent Kernel."
  compass: "Expose durable campaign progress in AK without mirroring the full package runtime graph."
  engine: "State owners -> define the AK anchor -> define the projected milestone set -> freeze payload and idempotence rules."
  fog: "The main risks are turning AK into a shadow runtime, emitting duplicate/noisy evidence, or letting orchestrator invent campaign truth not grounded in the package runtime."
---

# Contract — `pi-autoresearch` AK milestone projection

## Why this note exists

The package/runtime boundary is now explicit in the existing `pi-autoresearch` notes:

- [pi-autoresearch architecture correction](./pi-autoresearch-architecture-correction.md)
- [2026-04-16 pi-autoresearch runtime machine and event-ledger status](./2026-04-16-pi-autoresearch-runtime-machine-and-ledger-status.md)
- [2026-04-16 pi-autoresearch stack-map boundary status](./2026-04-16-pi-autoresearch-stack-map-boundaries-status.md)

Those notes already froze the key owner split:

- `packages/pi-autoresearch` owns executable experiment-loop state
- AK owns durable campaign/task truth only, not runtime microstate or local replay
- Prompt Vault owns durable one-shot decision procedures
- `pi-society-orchestrator` is the later coordination/supervision seam above the package runtime

What was still missing before `task:1474` was the smallest truthful **projection contract** for the AK side:

- which package states are durable enough to surface into AK
- which ones remain package-local microstate only
- what exact evidence shape the projector should write
- what the projector must **not** do

This note freezes that contract before the orchestrator implementation lands.

## Scope boundary for later manifest-driven campaign work

This note remains the contract for the **runtime-kernel milestone projector** that reads the bounded package machine/ledger seam.

The later manifest-driven llama.cpp campaign concern does **not** silently widen this note.
That newer concern reads a different package-local source seam:

- the checked manifest
- the deterministic stage-binding rules
- the current manifest-campaign projection in `packages/pi-autoresearch/src/core/llamacppCampaign.ts`

So when the active concern is manifest-driven llama.cpp campaign AK binding, use the package-local contract note instead:

- [`packages/pi-autoresearch/docs/project/llamacpp-campaign-ak-binding-contract.md`](../../packages/pi-autoresearch/docs/project/llamacpp-campaign-ak-binding-contract.md)

Interpretation rule:

> Reuse this note for bounded runtime-machine milestone projection.
> Do not apply it wholesale to manifest-campaign stage/projection truth just because both concerns eventually touch AK.

## Governing authority snapshot

| Concern | Current owner | Why |
|---|---|---|
| Executable runtime machine, event ledger, local receipts | `packages/pi-autoresearch` | This is package-local runtime behavior and replay state |
| Milestone projection logic and supervision sequencing | `pi-society-orchestrator` | This is coordination logic above the package runtime |
| Durable campaign task, allowed scope, completion/failure truth | AK | This is repo-native work/campaign authority, not the package runtime itself |
| Setup / next-hypothesis / finalize prompt procedures | Prompt Vault | These are governed decision procedures, not runtime state |

Interpretation rule:

> AK may receive **coarse campaign milestones** from `pi-autoresearch`, but AK does not become the owner of the package machine, local ledger, or per-transition runtime replay semantics.

## Bounded v1 decision

The first AK binding is **projection-only** and **evidence-only**.

V1 means:

1. an exact existing AK task is the campaign anchor
2. `pi-society-orchestrator` derives a coarse milestone snapshot from `pi-autoresearch`
3. the projector records that snapshot into AK as evidence attached to the task
4. the projector does **not** mirror every package transition
5. the projector does **not** auto-create, retarget, complete, or fail AK tasks

This keeps the first binding small enough to be truthful:

- AK becomes able to show durable campaign progress
- the package remains the runtime owner
- supervisor/orchestrator logic remains the only writer above the package
- no second runtime graph is recreated inside AK

## AK campaign anchor contract

### Required anchor

The projector requires an **exact AK task id** for the campaign.

That task is the durable AK-side campaign anchor for the bounded slice.
The projector must not search heuristically for a “likely” task and must not create a new task automatically.

### One task, one campaign objective

V1 assumes one AK task maps to one bounded autoresearch campaign objective.

That means the anchored task should already represent:

- the repo-relative working scope
- the operator-facing goal
- the allowed files / boundaries
- the fact that this campaign exists at all

### Reconfigure rule

A segment reconfigure may stay on the same AK task **only** while the campaign objective remains materially the same.

Examples that may stay on the same task:

- same repo objective, same primary metric family, baseline reset needed
- same campaign, but a benchmark/check command is corrected
- same campaign, but the segment metadata is tightened or renamed for clarity

Examples that should **not** silently stay on the same task:

- the primary goal changes materially
- the repo/file scope changes beyond the original task scope
- the primary metric changes so much that the old campaign objective is no longer the same campaign

When that boundary is crossed, open a new AK task instead of letting the projector blur two campaign truths together.

If a lawful same-task reconfigure resets the runtime back to `ready` with `runCount = 0`, the projector may emit a fresh `configured` milestone only when the resulting `projection_key` changes because the bounded segment/baseline contract materially changed.

## Source seam the projector may trust

The first projector should read package truth from the bounded `pi-autoresearch` runtime seam, specifically the public source-level exports currently re-exported by:

- [`packages/pi-autoresearch/src/runtime.ts`](../../packages/pi-autoresearch/src/runtime.ts)

The relevant bounded facts are:

- [`buildAutoresearchRuntimeStatus(...)`](../../packages/pi-autoresearch/src/core/runtime.ts)
- [`projectAutoresearchLedger(...)`](../../packages/pi-autoresearch/src/core/ledger.ts)

### Why these are enough

Together they provide the bounded truth the projector needs:

- current package machine state
- current segment summary
- run counters and best/baseline metrics
- append-only ledger health
- replay rejection/invalid-line detection

### Integrity rule

The projector may write AK evidence only when the package source is coherent enough to trust.

At minimum, do **not** project a fresh AK milestone when any of the following is true:

- ledger replay reports rejected events
- the ledger has invalid lines that make the current snapshot unreliable
- the expected campaign anchor task is missing or inaccessible
- the projector cannot identify a current bounded segment/campaign context for the write

Those are **projector failures**, not campaign milestones.
They should fail closed locally instead of being rewritten into AK as fake campaign truth.

## Milestone set that may be projected

V1 projects only **stable campaign checkpoints**.
It deliberately ignores transient runtime microstates.

### Projectable milestones

| Package/runtime condition | AK check_type | Evidence result | Meaning |
|---|---|---|---|
| machine state `ready` and `runCount = 0` with a configured segment | `autoresearch:milestone:configured` | `pass` | The campaign is configured and ready for the first bounded run |
| machine state `awaiting_decision` | `autoresearch:milestone:decision-required` | `pass` | A run was recorded and the campaign now needs the next bounded move |
| machine state `rebaseline_needed` | `autoresearch:milestone:rebaseline-needed` | `skip` | Continuation is paused until baseline validity is repaired or explicitly reset |
| machine state `finalize_candidate` | `autoresearch:milestone:finalize-candidate` | `pass` | The campaign appears ready for finalization/grouping rather than more churn |
| machine state `blocked` | `autoresearch:milestone:blocked` | `fail` | The campaign cannot continue lawfully without intervention |
| machine state `completed` | `autoresearch:milestone:completed` | `pass` | The package runtime considers the campaign complete; this is completion evidence, not `ak task complete` |

### Explicitly non-projecting states

The following remain package-local only in v1 and must not be mirrored into AK evidence as independent milestones:

- `idle`
- `segment_unconfigured`
- `running_benchmark`
- `running_checks`
- `recording_receipt`
- `ready` after a local `iterate` decision when no new durable checkpoint has been reached

Reason:

- they are either transient microstates, local runtime plumbing, or decision branches that the earlier boundary notes already said should not become AK-owned runtime truth.

## Evidence payload contract

Every projected milestone should write one AK evidence record with a compact structured `details` payload.
In this note, “AK evidence record” means the existing AK evidence model written through `ak evidence record` with fields such as `check_type`, `result`, and `details`.

### Required shape

```json
{
  "contract_version": 1,
  "projection_owner": "pi-society-orchestrator",
  "runtime_owner": "pi-autoresearch",
  "milestone": "decision-required",
  "projection_key": "decision-required|segment:latency|runs:3|status:keep|best:18.4",
  "cwd": "/absolute/path/to/campaign/repo",
  "segment": {
    "name": "latency",
    "metric_name": "latency_ms",
    "metric_unit": "ms",
    "direction": "lower"
  },
  "runtime": {
    "state": "awaiting_decision",
    "run_count": 3,
    "successful_run_count": 2,
    "baseline_metric": 24.1,
    "best_metric": 18.4,
    "last_run_status": "keep",
    "last_run_metric": 18.4,
    "blocked_reason": null,
    "completion_reason": null
  },
  "ledger": {
    "path": "/absolute/path/to/autoresearch.events.jsonl",
    "event_count": 11,
    "replayed_event_count": 11,
    "invalid_line_count": 0,
    "rejected_event_count": 0
  },
  "receipts": {
    "path": "/absolute/path/to/autoresearch.jsonl"
  },
  "summary": "3 runs recorded; best latency is 18.4 ms; awaiting next bounded decision"
}
```

### Field rules

#### `contract_version`
Start at `1`.
Only bump when the AK evidence payload schema changes materially.

#### `milestone`
Must match the suffix of the `check_type`.
Allowed values in v1:

- `configured`
- `decision-required`
- `rebaseline-needed`
- `finalize-candidate`
- `blocked`
- `completed`

#### `projection_key`
This is the idempotence key.
It must be deterministic from the projected milestone snapshot, not from wall-clock time.

It may be a plain stable string or a hash of a stable string, but the logical ingredients must be the same:

- milestone kind
- bounded segment identity
- run counters
- latest run/result summary fields relevant to that milestone
- terminal reason fields when present

#### `segment`
This is the compact campaign identity inside the repo/runtime seam.
Keep it small.
Do not dump the whole setup packet or benchmark output into AK evidence.

#### `runtime`
This carries only the coarse fields needed for operator-readable campaign progress:

- machine state
- run counters
- baseline/best metrics
- latest recorded run outcome
- terminal/blocking reason when relevant

Do **not** embed full benchmark stdout/stderr, full receipt history, or prompt bodies here.

#### `ledger`
This is just enough provenance to prove the AK write came from a replayable package snapshot.
The projector should report counts, not raw event payload history.

#### `summary`
A short human-readable sentence for quick AK inspection.
Keep it small and stateful, not aspirational.

## Idempotence rule

The projector will often be called repeatedly by a supervisor or polling loop.
So v1 must be explicitly idempotent.

Rule:

1. derive the milestone snapshot
2. derive its `check_type`
3. derive its deterministic `projection_key`
4. inspect existing evidence already attached to the AK task
5. if the newest evidence for that `check_type` already carries the same `projection_key`, write nothing
6. otherwise append one fresh evidence row

This prevents AK evidence spam from repeated unchanged polls.

## What the projector must not do

V1 must **not** do any of the following:

- auto-create AK tasks
- choose a task by fuzzy title matching
- mutate AK task scope or allowed paths
- rewrite task title/description to mirror every runtime update
- auto-run `ak task complete` or `ak task fail`
- treat AK evidence as the canonical replay/history surface for the experiment loop
- mirror every benchmark/check/event transition into AK
- embed prompt text, benchmark stdout, or whole receipt logs into AK evidence details

Those are separate bounded decisions if they are ever needed later.

## Verification contract for later implementation tasks

The follow-on implementation is good enough when it proves all of the following:

1. **mapping proof**
   - unit tests show each projectable milestone maps to the expected `check_type`, `result`, and compact details payload
2. **negative-path proof**
   - non-projecting states do not emit AK evidence
   - invalid/rejected ledger states fail closed instead of writing fake campaign truth
3. **idempotence proof**
   - repeated projection of an unchanged runtime snapshot does not append duplicate evidence rows
4. **end-to-end proof**
   - a real bounded autoresearch campaign can produce at least one attached AK milestone evidence row through the orchestrator path

## Bottom line

The first truthful AK binding for `pi-autoresearch` is:

- **bounded**
- **projection-only**
- **evidence-only**
- **coarse-milestone only**

That is enough to make campaign progress durable in AK without violating the already-adopted owner split where:

- the package owns runtime state
- AK owns campaign/task truth only, not runtime replay or microstate
- orchestrator owns higher-order supervision/projection logic
