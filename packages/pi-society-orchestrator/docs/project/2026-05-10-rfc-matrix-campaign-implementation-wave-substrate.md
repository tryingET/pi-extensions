---
summary: "RFC for adopting plan-only matrix campaign choreography as the AK-anchored implementation-wave substrate for pi-autoresearch dogfooding."
read_when:
  - "You are reviewing or extending plan_matrix_campaign in pi-society-orchestrator."
  - "You need the process rationale for using matrix cells as implementation-wave units."
type: "proposal"
system4d:
  container: "Package-local RFC for matrix campaign choreography above candidate-wave/pi-autoresearch surfaces."
  compass: "Adopt a thin matrix planner that turns implementation waves into owner-reviewed candidate-wave cells without claiming execution or authority ownership."
  engine: "Restate problem -> compare options -> choose the thin choreography layer -> define contract, guardrails, and acceptance criteria."
  fog: "The main risk is allowing a convenient matrix plan to become a shadow task/evidence authority or hidden executor."
---

# RFC — matrix campaigns as implementation-wave substrate

## Decision in one sentence

Add a **plan-only matrix campaign choreography surface** to `pi-society-orchestrator` that decomposes an AK-anchored implementation wave into scenario × hypothesis cells, where each cell delegates execution to existing candidate-wave and `pi-autoresearch` packet/review surfaces.

## Scope

In scope:

- one `autoresearch_live_supervision` action: `plan_matrix_campaign`;
- exact `taskId` + `cwd` anchoring;
- required objective, scenarios, and hypotheses;
- deterministic cell ids and packet directories;
- cell-scoped `plan_candidate_wave` calls;
- cell-scoped `review_candidate_wave` calls;
- `/autoresearch review` as the primary owner decision UI;
- clear non-mutating boundaries;
- tests and documentation proving the contract.

Out of scope:

- automatic peer launch;
- automatic candidate measurement;
- automatic matrix-wide execution;
- AK direction mutation from the tool;
- KES/evidence/Oracle writes;
- worktree merge/delete/reset;
- promotion authority;
- generic matrix framework extraction.

## Current boundary

Current package truth:

- AK owns task, direction, decision, and evidence authority.
- `pi-autoresearch` owns empirical measurement, runtime receipts, candidate-result packets, and candidate lifecycle planning.
- `pi-society-orchestrator` owns above-seam choreography, review, recommendation, and owner-decision surfacing.
- `/autoresearch review` is the primary candidate owner-decision UI; `interview(...)` is fallback.

This RFC preserves that split.

## Options considered

| Option | Description | Strengths | Risks / reasons not preferred |
|---|---|---|---|
| **A. Thin plan-only matrix choreography over candidate waves** **(preferred)** | Orchestrator emits matrix cells, each with exact candidate-wave and review calls | Uses existing proven seams, keeps AK as spine, enables dogfood implementation waves, easy rollback | Requires discipline not to treat cells as canonical tasks |
| B. Create AK tasks for every matrix cell immediately | Materialize each cell as task truth up front | Strong lineage | Too heavy for first slice; risks task explosion before matrix shape is proven |
| C. Add matrix execution loop that runs all cells | One command runs the campaign | Feels powerful | Violates no-hidden-autonomy and bypasses owner gates |
| D. Keep using hand-authored implementation waves | No new surface | Low change | Does not test the product thesis that dogfood campaigns can replace wave step lists |
| E. Move matrix planning into `pi-autoresearch` | Empirical owner holds matrix | Close to receipts/metrics | Above-seam work-wave choreography and AK spine belong in orchestrator, not empirical runtime |

Preferred direction: **Option A**.

## Proposed contract

### Request

`autoresearch_live_supervision({ action: "plan_matrix_campaign", ... })` accepts:

- `taskId`: exact AK task id;
- `cwd`: exact repo cwd;
- `objective`: non-empty wave objective;
- `direction`: metric direction, default `lower`;
- `scenarios`: one or more scenario-axis values;
- `hypotheses`: one or more hypothesis-axis values;
- `candidateCountPerCell`: 1–6, default 3;
- optional `filesInScope`, `offLimits`, `constraints`, `parentPeerTarget`, and per-candidate budgets.

### Result

The result has kind `autoresearch.matrix_campaign_plan.v1` and returns:

- scenario/hypothesis axes;
- `candidateCountPerCell`;
- matrix cells with stable ids like `cell-01-01`;
- packet directories under `.autoresearch/matrix-campaign/<cell>/`;
- candidate-result packet paths for each candidate lane;
- exact `plan_candidate_wave` call per cell;
- exact `review_candidate_wave` call per cell;
- `/autoresearch review` as the owner UI after review;
- first exact cell call as the next implementation-wave action;
- non-action boundaries.

## Stable invariants

1. The action is plan-only.
2. It requires exact AK task id and cwd.
3. It requires at least one scenario and at least one hypothesis.
4. Matrix packet paths stay under `.autoresearch/matrix-campaign/`.
5. It delegates cell execution to `plan_candidate_wave`; it does not fork a separate execution system.
6. It delegates empirical proof to `pi-autoresearch` candidate-result packets.
7. It delegates owner decision to `/autoresearch review` as the primary UI.
8. It does not mutate AK direction, write evidence, write KES, spawn peers, run benchmarks, merge, promote, or apply worktree lifecycle actions.

## Relationship to AK strategy/design protocol

The correct process shape is:

```text
AK strategic_frame
-> AK work_wave
-> problem-intent
-> RFC/design
-> ADR
-> scoped AK task
-> matrix cells as implementation-wave execution units
-> candidate packets / review
-> owner decision
-> evidence / closeout
```

This RFC explicitly rejects treating the implementation as complete merely because a tool exists.
The implementation must be checked against the ADR before the matrix behavior is treated as accepted process.

## Acceptance criteria

The first slice is acceptable when:

- AK has a native strategic frame and work wave for the matrix dogfood concern;
- an AK decision records the ADR lifecycle;
- `plan_matrix_campaign` exists in the public tool schema;
- tests prove schema exposure and matrix-cell output shape;
- tests prove the first exact cell call delegates to `plan_candidate_wave` and cell review delegates to `review_candidate_wave`;
- docs state the plan-only boundary and owner-surface split;
- implementation conformance is checked against the ADR;
- package validation passes.

## Rollback

Rollback is simple:

- stop using `plan_matrix_campaign`;
- continue using `plan_candidate_wave` directly;
- keep AK task/direction authority unaffected;
- remove the action and tests if the matrix substrate does not prove useful.
