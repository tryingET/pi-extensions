---
summary: "Accepted ADR for plan-only matrix campaign choreography as an AK-anchored implementation-wave substrate in pi-society-orchestrator."
status: accepted
read_when:
  - "You are implementing or reviewing plan_matrix_campaign."
  - "You need to know whether matrix cells are tasks, evidence, execution, or plan-only choreography."
  - "You are deciding whether to auto-run matrix campaigns or add a separate matrix owner UI."
type: "adr"
system4d:
  container: "Package-local ADR for matrix campaign choreography in pi-society-orchestrator."
  compass: "Adopt matrix cells as implementation-wave planning units while AK, pi-autoresearch, and owner UI boundaries remain intact."
  engine: "Distill problem/RFC/review -> assign ownership -> record invariants -> define implementation conformance requirements."
  fog: "The main risk is later expanding a plan-only matrix into hidden execution or a shadow authority system."
---

# ADR — Matrix campaigns as implementation-wave substrate

## Status

Accepted as the package-local ADR for the first matrix-campaign dogfood slice.

Canonical decision-runtime closure is recorded in `AK decision 35`:

- `Adopt plan-only matrix campaign choreography as implementation-wave substrate`

Supporting packet:

- Problem-intent: [`../project/2026-05-10-matrix-campaign-implementation-wave-problem-intent.md`](../project/2026-05-10-matrix-campaign-implementation-wave-problem-intent.md)
- RFC: [`../project/2026-05-10-rfc-matrix-campaign-implementation-wave-substrate.md`](../project/2026-05-10-rfc-matrix-campaign-implementation-wave-substrate.md)
- Review synthesis: [`../project/2026-05-10-review-matrix-campaign-implementation-wave-rfc.md`](../project/2026-05-10-review-matrix-campaign-implementation-wave-rfc.md)

## Decision

`pi-society-orchestrator` will own a **thin plan-only matrix campaign choreography surface** above the existing candidate-wave and `pi-autoresearch` runtime seams.

The first accepted public action is:

```text
autoresearch_live_supervision({ action: "plan_matrix_campaign", ... })
```

It decomposes an exact AK-task-anchored implementation-wave objective into scenario × hypothesis cells.
Each cell returns exact calls for:

1. planning a candidate wave for that cell;
2. exporting/using cell-scoped candidate-result packet paths through the existing candidate-wave measurement flow;
3. reviewing the cell through `review_candidate_wave`;
4. using `/autoresearch export` as the primary run-history/metrics dashboard, `/autoresearch overlay` as the live TUI fallback, and `/autoresearch review` only as the final owner decision UI after review.

## Ownership assignment

| Concern | Owner |
|---|---|
| Strategy/work-wave/task/decision/evidence authority | AK |
| Metrics, receipts, candidate-result packets, candidate lifecycle planning, candidate worktree measurement | `pi-autoresearch` |
| Above-seam matrix/candidate-wave choreography and owner-decision surfacing | `pi-society-orchestrator` |
| Primary run-history/metrics UI | `/autoresearch export` from `pi-autoresearch` |
| Live TUI fallback | `/autoresearch overlay` from `pi-autoresearch` |
| Final candidate owner decision UI | `/autoresearch review` from `pi-autoresearch` |
| Portable fallback owner UI payload | `interview(...)` |

## Architectural rule

Matrix cells are **implementation-wave planning cells**, not execution authority and not canonical tasks.

The matrix surface may point at an AK task.
It may not silently create, complete, or mutate AK tasks, direction, decisions, or evidence.

## Contract requirements

`plan_matrix_campaign` must:

- require exact `taskId` and `cwd`;
- require a non-empty objective;
- require at least one scenario and one hypothesis;
- default metric direction to `lower` when unspecified;
- bound `candidateCountPerCell` to the same 1–6 range used by candidate waves;
- produce deterministic cell ids such as `cell-01-01`;
- keep generated packet paths under `.autoresearch/matrix-campaign/<cell>/`;
- emit exact `plan_candidate_wave` calls per cell;
- emit exact `review_candidate_wave` calls per cell;
- surface `/autoresearch export` as the primary run-history/metrics UI;
- surface `/autoresearch overlay` as the live TUI fallback;
- surface `/autoresearch review` only as the final owner decision UI;
- return a first exact cell call as the next implementation-wave action;
- state non-action boundaries in the result.

`plan_matrix_campaign` must not:

- spawn peers;
- run benchmarks;
- bind candidates;
- export packets;
- write AK/KES/evidence/Oracle artifacts;
- mutate AK direction or decisions;
- merge, promote, delete, rewind, or reset worktrees;
- select winners;
- auto-run the full matrix.

## Candidate-wave packet directory rule

Because matrix cells depend on cell-scoped packet paths, the underlying candidate-wave planner may accept an optional packet directory, but it must fail closed unless the directory is repo-relative and under `.autoresearch/`.

Generated matrix paths should use:

```text
.autoresearch/matrix-campaign/<cell-id>/candidate-XX.candidate-result.json
```

## Relationship to implementation-wave protocol

The accepted process order for this capability is:

```text
AK strategic_frame
-> AK work_wave
-> problem-intent
-> RFC / design
-> review synthesis
-> ADR
-> scoped AK task
-> implementation
-> implementation check against ADR
-> validation evidence
-> owner dogfood of first matrix cell
```

The already-landed implementation must be treated as provisional until checked against this ADR.

## Consequences

Positive:

- implementation waves can be dogfooded through measured matrix cells;
- existing candidate-wave and owner UI surfaces are reused instead of fragmented;
- AK remains the authority spine;
- rollback is simple because the action is plan-only.

Costs:

- the matrix does not yet execute anything by itself;
- operators still need to approve/launch cells and candidates explicitly;
- per-cell AK task materialization remains deferred.

## Deferred decisions

This ADR does not decide:

- whether to create AK tasks per matrix cell;
- whether to add whole-matrix execution;
- whether to add matrix-specific dashboard UI;
- whether to extract a shared matrix campaign package;
- whether to persist matrix campaign status beyond existing packet/AK evidence surfaces.

Any of those require a later explicit decision.

## Implementation conformance checklist

The implementation conforms only if:

- `AutoresearchMatrixCampaignPlan` is typed and exported from the runtime;
- `AutoresearchLiveSupervisionRunner.planMatrixCampaign(...)` delegates to pure planning logic;
- the extension schema exposes `plan_matrix_campaign`, `scenarios`, `hypotheses`, and `candidateCountPerCell`;
- result details include `matrixCampaign`;
- rendered output shows implementation-wave substrate, exact cell calls, packet dirs, boundaries, and next step;
- tests prove the happy-path matrix shape;
- tests or source inspection prove custom packet directories cannot escape `.autoresearch/`;
- README/current truth documents the plan-only boundary.
