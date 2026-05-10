---
summary: "Review synthesis for the matrix-campaign implementation-wave RFC before accepting the ADR."
read_when:
  - "Before accepting the matrix-campaign implementation-wave ADR."
  - "When checking whether the RFC preserves AK, pi-autoresearch, and orchestrator owner boundaries."
type: "review"
system4d:
  container: "Package-local review synthesis for the matrix-campaign implementation-wave RFC."
  compass: "Confirm the RFC admits the matrix surface only as plan-only choreography and not as hidden execution or authority."
  engine: "Check owner boundaries -> evaluate alternatives -> identify required ADR constraints -> state review outcome."
  fog: "The main uncertainty is whether operators will later pressure the matrix plan into whole-campaign auto-execution."
---

# Review synthesis — matrix campaigns as implementation-wave substrate

## Reviewed artifacts

- Problem-intent: [`2026-05-10-matrix-campaign-implementation-wave-problem-intent.md`](2026-05-10-matrix-campaign-implementation-wave-problem-intent.md)
- RFC: [`2026-05-10-rfc-matrix-campaign-implementation-wave-substrate.md`](2026-05-10-rfc-matrix-campaign-implementation-wave-substrate.md)
- Existing candidate-wave implementation in `src/runtime/autoresearch-supervisor-runner.ts`
- Existing owner UI path in `packages/pi-autoresearch` via `/autoresearch review`

## Review outcome

Outcome: **approve for ADR with constraints**.

The RFC correctly identifies the gap:

- one candidate wave is not enough to replace implementation-wave planning;
- a matrix surface can provide the missing scenario × hypothesis decomposition;
- the matrix surface must remain above candidate-wave execution and below AK authority.

The preferred option is acceptable only if the ADR preserves the following constraints.

## Required ADR constraints

1. **Plan-only surface**
   - `plan_matrix_campaign` must not spawn peers, run benchmarks, export packets, write evidence, merge, promote, or apply worktree lifecycle actions.

2. **AK spine**
   - The matrix must require exact `taskId` + `cwd` and remain subordinate to AK-native direction/work-wave/task truth.

3. **No shadow task system**
   - Matrix cells are execution-planning cells, not canonical AK tasks.
   - Creating per-cell AK tasks may be a later explicit decision, not an implied side effect.

4. **Empirical owner boundary**
   - Metrics, receipts, candidate-result packets, candidate lifecycle planning, and candidate worktree measurement stay in `pi-autoresearch`.

5. **Owner UI route**
   - Owner situational awareness should point first to `/autoresearch export` for the HTML run-history/metrics dashboard.
   - `/autoresearch overlay` remains the live TUI fallback.
   - Owner final decision after review must point to `/autoresearch review`.
   - `interview(...)` remains fallback decision payload only.

6. **Deterministic packet paths**
   - Matrix-cell packet paths must stay under `.autoresearch/matrix-campaign/<cell>/`.
   - Candidate-wave custom packet directories must fail closed if they escape `.autoresearch/`.

7. **One-cell next action**
   - The implementation-wave substrate should surface the first exact cell call as the next action rather than encouraging whole-matrix execution.

8. **Conformance check**
   - The current implementation must be checked against the ADR and validation evidence recorded before claiming the process layer is accepted.

## Concerns and mitigations

### Concern: matrix becomes a hidden executor

Mitigation: keep the action named `plan_matrix_campaign`, return calls as text/data, and never execute them in that action.

### Concern: cells become shadow tasks

Mitigation: require exact AK task id, but do not create tasks per cell. If task-per-cell materialization becomes needed, require a separate decision.

### Concern: owner UI fragments again

Mitigation: matrix cells must flow through existing pi-autoresearch dashboard/review surfaces (`/autoresearch export`, `/autoresearch overlay`, then `/autoresearch review`) instead of adding a new primary matrix decision UI.

### Concern: packet directories become arbitrary write targets

Mitigation: generated matrix directories are fixed under `.autoresearch/matrix-campaign/`; custom candidate-wave packet directories must stay under `.autoresearch/`.

## Recommendation

Accept the ADR for a **thin plan-only matrix campaign choreography surface**.

Do not approve any automatic matrix execution, per-cell AK task materialization, or new matrix-specific owner UI in this decision.
