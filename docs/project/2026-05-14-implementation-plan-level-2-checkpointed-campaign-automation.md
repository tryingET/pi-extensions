---
summary: "Implementation plan for the accepted level-2 checkpointed campaign automation ADR."
read_when:
  - "Starting implementation after ADR 2026-05-14-level-2-checkpointed-campaign-automation."
  - "Choosing the first slice for pi-autoresearch or pi-society-orchestrator level-2 campaign automation."
  - "Checking what remains forbidden after level-2 acceptance."
type: "implementation_plan"
status: "planned"
date: "2026-05-14"
decision: "AK decision #44"
adr: "docs/adr/2026-05-14-level-2-checkpointed-campaign-automation.md"
system4d:
  container: "Post-ADR implementation plan for level-2 checkpointed campaign automation."
  compass: "Implement packet/checkpoint automation in safe slices before any action-consuming automation."
  engine: "Define slices -> assign owners -> set gates -> keep rollback to level-1 runbooks."
  fog:
    risks:
      - "Starting with action execution instead of packet-only preparation."
      - "Forgetting anti-narrowing gates in the first implementation slice."
      - "Touching deferred toolbox work."
---

# Implementation plan — level-2 checkpointed campaign automation

## Scope

Implement the accepted level-2 authorization from:

- ADR: `docs/adr/2026-05-14-level-2-checkpointed-campaign-automation.md`
- AK decision: `#44`

This plan does not itself authorize code mutation. It defines the post-ADR implementation slices and gates.

## Implementation-by-campaign workflow

Use the accepted campaign substrate to implement this plan rather than falling back to a single controller-inline patch.

Because level-2 runtime behavior is not implemented yet, the first implementation campaign is a **bootstrap dogfood campaign**:

```text
level-1 visible campaign mechanics
+ level-2 ADR token vocabulary
+ controller-owned fan-in/review
```

The campaign may use visible candidate lanes and existing orchestrator/autoresearch packet surfaces, but it must not pretend the new level-2 automation exists before Slice 1 lands.

Workflow for each implementation slice:

1. Create or select one bounded AK execution task for the slice.
2. Prepare a campaign packet that names target, matrix cells, candidate lanes, primary blocker metric, files-in-scope, off-limits paths, token requirements, and rollback.
3. Launch only explicit visible candidate lanes when mutation is needed.
4. Bind peer reports to candidate worktrees after `PEER_FINAL`; peer text remains communication only.
5. Run controller-side verification, package tests, and blocker measurement.
6. Review candidate wave and matrix disposition.
7. Apply or synthesize only the owner-approved result in the parent checkout.
8. Record AK evidence after controller verification.
9. Clean candidate worktrees only with an explicit cleanup action after review.

This adds a workflow constraint to the first implementation task: **the implementation of Slice 1 should itself be run as a measured campaign**, but using current level-1 lawful mechanics until the new packet-only level-2 surface exists.

## Non-negotiable boundaries

Do not implement:

- hidden peer launch;
- hidden benchmark/export/review;
- automatic AK/KES/Oracle/DSPx/Prompt Vault/ROCS writes;
- automatic cleanup, merge, push, PR, release, or promotion;
- toolbox changes while toolbox remains deferred.

## Slice 1 — Packet-only level-2 planning surface

Owner: `pi-society-orchestrator`.

Goal: produce a structured level-2 campaign packet without executing actions.

Expected outputs:

- matrix target summary;
- cell/lane table;
- prepared visible candidate launch packet(s);
- required token names and missing-token posture;
- anti-narrowing posture;
- expected `pi-autoresearch` metric/export calls as command packets only.

Required tests:

- no launch call is executed;
- missing launch token is reported as blocked, not bypassed;
- generated packet includes owner boundaries and files-in-scope/off-limits fields.

## Slice 2 — Candidate-result binding and blocker computation

Owners: `pi-society-orchestrator` + `pi-autoresearch`.

Goal: bind controller-verified candidate outputs to matrix lanes and compute blocker metrics.

Expected outputs:

- lane binding table;
- missing-lane blocker list;
- duplicate-lane blocker list;
- candidate-result packet paths;
- metric summary, including target-specific blocker metric.

Required tests:

- missing lane fails closed unless explicit incomplete-matrix exception is present;
- duplicate lane fails closed unless explicit reconciliation record is present;
- peer assertions are separated from controller-verified facts.

## Slice 3 — Review-packet generation

Owner: `pi-society-orchestrator`.

Goal: prepare candidate-wave and matrix-review packets from bound candidate results.

Expected outputs:

- `review_candidate_wave` packet;
- `review_matrix_campaign` packet;
- lane disposition options;
- whole-matrix metric posture;
- explicit owner next actions.

Required tests:

- proof-only or baseline-only result cannot close a real matrix target;
- incomplete-matrix downgrade requires an explicit record;
- generated review packet does not claim promotion authority.

## Slice 4 — Finalizer-token request preparation

Owner: `pi-society-orchestrator`.

Goal: prepare a `finalize_post_fanin` token request, not finalizer action.

Expected outputs:

- candidate-result packet reference;
- review result reference;
- metric posture;
- permitted finalizer scope;
- cleanup/merge/release/promotion boundaries.

Required tests:

- no finalizer action without exact `finalize_post_fanin` token;
- cleanup requires separate `candidate_cleanup` token;
- merge/release/promotion requires separate owner promotion token.

## Slice 5 — Operator UX and dashboard integration

Owners: `pi-autoresearch` + `pi-society-orchestrator`.

Goal: make checkpoint state visible enough that generated packets are not mistaken for authority.

Expected outputs:

- dashboard/readiness summary;
- explicit next legal actions;
- missing token list;
- level-1 fallback route.

Required tests:

- dashboard distinguishes packet export from evidence write;
- dashboard shows peer reports as communication only;
- fallback to level-1 runbooks is visible.

## First implementation campaign recommendation

Start with Slice 1 only, but execute it through a measured implementation campaign:

```text
Campaign target: Add packet-only level-2 campaign planning output to pi-society-orchestrator, with token placeholders and anti-narrowing posture, without launching peers or invoking pi-autoresearch commands.
```

Suggested matrix:

| Cell | Focus | Candidate lane shape |
| --- | --- | --- |
| `cell-01` | packet schema and token vocabulary | Compare minimal vs explicit packet shapes for launch/finalizer/evidence/cleanup tokens. |
| `cell-02` | anti-narrowing and fail-closed gates | Compare blocker models for proof-only, missing-lane, duplicate-lane, and explicit downgrade cases. |
| `cell-03` | operator UX and README/test surface | Compare concise operator output vs detailed dashboard-style output. |

Primary metric:

```text
level2_packet_planning_blockers = 0
```

Rationale: Slice 1 exercises the new ADR boundary with the least authority risk while dogfooding the campaign route on its own implementation.

## Follow-on task creation guidance

Each slice should be an AK task with bounded scope. Prefer package-local paths:

- `packages/pi-society-orchestrator/src/**`
- `packages/pi-society-orchestrator/tests/**`
- `packages/pi-society-orchestrator/README.md`
- `packages/pi-autoresearch/src/**` only when the slice actually needs runtime/export support
- `packages/pi-autoresearch/tests/**`
- package README/docs updates for operator-visible behavior

Do not include `packages/pi-toolbox-discovery/**` unless the toolbox deferral is explicitly lifted.
