---
summary: "Problem-intent for using matrix-shaped pi-autoresearch dogfood campaigns as the implementation-wave substrate while AK remains the strategy/task spine."
read_when:
  - "Before widening matrix campaign support in pi-society-orchestrator."
  - "When deciding whether implementation waves can be executed through pi-autoresearch candidate-wave dogfooding instead of hand-authored step lists."
type: "problem-intent"
system4d:
  container: "Package-local problem-intent for matrix campaign dogfooding in pi-society-orchestrator."
  compass: "Make implementation-wave execution observable through AK-anchored matrix cells while preserving owner boundaries."
  engine: "State the missing process capability -> separate authority from measurement -> define the smallest truthful first slice -> keep non-goals explicit."
  fog: "The main risks are creating strategy theater, bypassing AK direction/decision authority, or turning matrix planning into hidden execution autonomy."
---

# Problem-intent — matrix campaigns as implementation-wave substrate

## Problem in one sentence

`pi-society-orchestrator` can now choreograph candidate waves around `pi-autoresearch`, but it still lacks a governed way to make a broader **scenario × hypothesis matrix** act as the implementation-wave substrate while AK remains the strategy/task authority spine.

## Why this problem exists now

The first candidate/autoresearch loop is complete enough to expose the next gap:

- candidate lanes can be planned without hidden peer launch;
- candidate worktrees can be measured by `pi-autoresearch` from the candidate cwd;
- candidate-result packets can be exported and reviewed;
- orchestrator can rank/recommend without becoming promotion authority;
- owner choice now routes primarily through `/autoresearch review` with `interview(...)` as fallback.

That proves one candidate wave can work.
It does **not** yet prove that a larger implementation wave can be driven by measured dogfood cells instead of by hand-authored step lists.

The missing process capability is:

> Use AK direction/task as the spine, then execute the implementation wave through matrix cells whose evidence comes from `pi-autoresearch` candidate packets and owner-reviewed decisions.

## What is actually missing

The missing layer is **matrix choreography above candidate waves**:

- define scenario axis values;
- define hypothesis axis values;
- generate exact matrix-cell candidate-wave plans;
- keep packet paths cell-scoped and deterministic;
- surface the first exact cell call as the next implementation-wave unit;
- keep owner decision in the existing `pi-autoresearch` UI;
- preserve AK task/direction authority instead of letting the matrix become a shadow task system.

## Why existing surfaces are not enough

`plan_candidate_wave` is intentionally lane-local.
It answers:

> “How should we run several candidates for this one objective?”

It does not answer:

> “How should a whole implementation wave be decomposed into scenario × hypothesis cells, and which cell should be the next AK-anchored execution unit?”

AK direction and tasks answer authority and lineage questions.
`pi-autoresearch` answers measurement and empirical packet questions.
The gap is the orchestrator-owned choreography that connects those two without collapsing them.

## Brownfield constraints

### 1. AK remains the authority spine

Matrix cells must not become canonical tasks by themselves.
They are execution-planning cells under an exact AK task and, where accepted, an AK-native strategic frame / work wave.

### 2. `pi-autoresearch` owns empirical truth

Metrics, receipts, candidate-result packets, candidate lifecycle planning, and candidate worktree measurement semantics remain in `pi-autoresearch`.

### 3. `pi-society-orchestrator` owns choreography only

The orchestrator may plan matrix cells, call out exact candidate-wave/review calls, and recommend owner gates.
It must not secretly spawn peers, run benchmarks, merge, promote, mutate worktrees, write KES, or rewrite AK direction.

### 4. The owner UI path stays unified but staged

Owner situational awareness should start with `/autoresearch export` for the HTML dashboard with run history, receipts, metrics, and candidate context.
`/autoresearch overlay` remains the live TUI fallback when browser export is not desirable.
Owner final decision should continue through `/autoresearch review` as the explicit keep/discard/rewind/more-samples surface.
`interview(...)` remains portable fallback decision UI data only.

## Smallest truthful success state

The first slice is solved when the package can:

1. expose a plan-only `plan_matrix_campaign` action under `autoresearch_live_supervision`;
2. require exact `taskId`, `cwd`, non-empty objective, at least one scenario, and at least one hypothesis;
3. generate deterministic matrix cell ids and packet directories under `.autoresearch/matrix-campaign/<cell>/`;
4. emit cell-scoped `plan_candidate_wave` and `review_candidate_wave` calls;
5. surface `/autoresearch export` as the primary dashboard, `/autoresearch overlay` as the live TUI fallback, and `/autoresearch review` as the final owner decision UI;
6. explain that the matrix is an implementation-wave substrate, not an AK/direction mutation or hidden executor;
7. validate the implementation against an accepted ADR before treating the slice as process proof.

## Non-goals for the first slice

This problem-intent does **not** ask for:

- automatic peer spawning;
- automatic candidate measurement;
- automatic matrix-wide execution;
- automatic AK direction/task creation per cell;
- automatic evidence/KES/Oracle writes;
- promotion or merge authority;
- a generic matrix engine outside `pi-society-orchestrator`;
- replacing `pi-autoresearch` dashboards or candidate decision UI.

## Why this is the right next bounded move

The product thesis is not just “add a matrix tool.”
The thesis is:

> implementation waves can become measured dogfood campaigns while AK remains the authority spine.

A plan-only matrix action is the smallest truthful way to test that thesis because it exposes the full process shape without claiming hidden autonomy.
