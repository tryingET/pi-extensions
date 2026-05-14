---
summary: "Canonical Target 3 controller runbook synthesized from the visible candidate matrix lanes."
read_when:
  - "Running a level-1 visible-candidate whole-matrix implementation wave."
  - "Closing out Target 3 whole-matrix execution glue after PEER_FINAL fan-in."
  - "Needing the controller-owned launch, bind, measure, review, and finalizer sequence."
type: "runbook"
status: "controller-synthesized"
date: "2026-05-14"
scope: "Target 3 visible candidate launch, lineage handoff, candidate-result binding, closeout review, and finalizer gate"
primary_metric: "whole_matrix_execution_glue_blockers"
metric_target: 0
level: 1
system4d:
  container: "Repo-scoped controller runbook for whole-matrix visible-candidate execution glue."
  compass: "Make candidate lanes visible, verifiable, reviewable, and safely disposable without hidden automation or source-owner drift."
  engine: "Spawn visible candidates -> watch ACK/FINAL -> verify worktrees -> bind candidate results -> measure blockers -> review lanes/matrix -> finalize only with explicit authorization."
  fog:
    risks:
      - "Treating peer messages as durable evidence."
      - "Skipping controller worktree verification before adoption."
      - "Promoting or merging candidate output without owner review."
      - "Letting level-1 closeout mutate AK, KES, Oracle, Prompt Vault, ROCS, release, or cleanup state automatically."
---

# Target 3 whole-matrix execution controller runbook

This is the canonical controller runbook for Target 3 whole-matrix execution glue. It synthesizes the four visible candidate lanes into one operator-facing path for level-1 campaigns.

The runbook is not promotion authority. It describes how the controller launches visible candidate lanes, verifies their isolated worktrees, binds their result packets, measures closeout readiness, reviews the matrix, and gates any finalizer action.

## Source lane disposition

| Candidate lane | Source artifact | Controller disposition | Reason |
| --- | --- | --- | --- |
| `cell-01 lane A` | `docs/project/2026-05-14-target3-visible-candidate-matrix-cell-01-lane-a.md` | Folded in | Strong exact `candidate_peer_spawn -> peer_watch -> controller verification` sequence. |
| `cell-01 lane B` | `docs/project/2026-05-14-target3-visible-candidate-matrix-cell-01-lane-b.md` | Preferred for launch UX | Best compact operator handoff: peer id, worktree/branch, controller evidence, safe next action. |
| `cell-02 lane A` | `docs/project/2026-05-14-target3-visible-candidate-matrix-cell-02-lane-a.md` | Folded in | Strong bind/measure/export/review/finalizer packet ordering. |
| `cell-02 lane B` | `docs/project/2026-05-14-target3-visible-candidate-matrix-cell-02-lane-b.md` | Preferred for closeout UX | Best finalizer gate: explicit metrics table and `finalize_post_fanin` authorization token. |

Do not cherry-pick all four lane docs into the parent checkout as separate durable docs. Keep them as candidate inputs unless a later owner review intentionally preserves them for audit.

## Level-1 boundaries

Authorized at level 1:

- visible candidate worktrees;
- explicit launch metadata;
- `PEER_ACK` / `PEER_FINAL` communication through intercom;
- controller-side branch, worktree, diff, and validation inspection;
- candidate-result packet export for review;
- lane review and matrix review;
- a finalizer recommendation gated by explicit controller authorization.

Not authorized at level 1:

- hidden peer launch or hidden matrix execution;
- automatic merge, cherry-pick, push, PR, release, publish, or cleanup;
- automatic AK, KES, Oracle/DSPx, Prompt Vault, ROCS, or evidence-store writes;
- treating intercom messages, peer text, or launch output as durable evidence;
- candidate peers claiming completion, promotion, or owner-review authority.

## Primary metric

```text
whole_matrix_execution_glue_blockers = 0
```

A blocker is any unresolved gap between visible peer launch, protocol correlation, worktree verification, candidate-result binding, review, finalizer authorization, and safe disposition.

Examples:

- missing or duplicated `PEER_ACK` / `PEER_FINAL`;
- ambiguous peer run id, branch, worktree, base ref, or parent session;
- missing changed-file inventory;
- unverified diff or missing `git diff --check`;
- scope violation or hidden mutation;
- peer claim treated as evidence without controller inspection;
- incomplete `review_candidate_wave` or matrix review;
- missing `finalize_post_fanin` token before finalizer action.

## Controller launch handoff

Before a candidate starts, capture one compact handoff block with these fields:

| Field | Purpose |
| --- | --- |
| `target`, `cell`, `lane` | Binds the candidate to the matrix coordinate. |
| `peer_run_id` | Correlates ACK, final, registry, and logs. |
| `parent_session_id` / `parentPeerTarget` | Ensures report-back returns to the controller. |
| `parent_cwd` | Separates parent checkout from isolated worktree. |
| `base_ref` | Preserves lineage when the parent checkout is dirty. |
| `branch` | Names the candidate branch for review and rollback. |
| `worktree_path` | Gives the controller the direct verification target. |
| `dirty_parent_state` | Prevents assuming parent-local changes are included. |
| `files_in_scope` | Bounds mutation review. |
| `off_limits` | Makes source-owner and automation boundaries explicit. |
| `dod` | Names validation and report-back expectations. |
| `metric` / `metric_target` | Connects lane output to the whole-matrix blocker budget. |

Canonical sequence:

```text
candidate_peer_spawn -> peer_watch -> controller verification
```

`candidate_peer_spawn` creates an isolated candidate worktree and a visible peer. `peer_watch` confirms protocol correlation. Only controller verification can validate the patch, doc, metric, or adoption posture.

## Controller verification packet

After `PEER_FINAL`, verify from the candidate worktree, not from the parent checkout:

```bash
git -C <candidate-worktree-path> branch --show-current
git -C <candidate-worktree-path> status --short
git -C <candidate-worktree-path> diff -- <changed-path>
git -C <candidate-worktree-path> diff --check -- <changed-path>
```

A lane is reviewable only when the controller confirms:

- branch and worktree match launch metadata;
- changed files are inside `files_in_scope`;
- no forbidden path or action was used;
- `git diff --check` is clean or an explicit waiver exists;
- the lane reports risks, rollback notes, and a recommended disposition;
- peer output remains communication, not evidence or promotion authority.

## Candidate-result bind table

For fan-in, bind every lane into a table before review:

| Target | Cell | Lane | Peer run id | Branch | Worktree | Changed files | Validation | Controller disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Target 3 | cell-01 | A | recorded at launch | `candidate/target3-cell01-lane-a` | isolated worktree | one scoped doc | `git diff --check` clean | folded in, not separately adopted |
| Target 3 | cell-01 | B | recorded at launch | `candidate/target3-cell01-lane-b` | isolated worktree | one scoped doc | `git diff --check` clean | preferred launch UX source |
| Target 3 | cell-02 | A | recorded at launch | `candidate/target3-cell02-lane-a` | isolated worktree | one scoped doc | `git diff --check` clean | folded in, not separately adopted |
| Target 3 | cell-02 | B | recorded at launch | `candidate/target3-cell02-lane-b` | isolated worktree | one scoped doc | `git diff --check` clean | preferred closeout UX source |

If any lane cannot be bound to exactly one matrix coordinate, stop and record the ambiguity as a blocker.

## Measure closeout readiness

Measure these checks before finalizer posture:

| Metric | Target |
| --- | ---: |
| `candidate_results_bound` | expected lane count or explicit incomplete-matrix exception |
| `candidate_results_validated` | expected lane count or explicit validation waiver |
| `review_candidate_wave_complete` | `true` |
| `matrix_review_complete` | `true` |
| `whole_matrix_execution_glue_blockers` | `0` |
| `finalize_post_fanin_authorized` | `true` only after explicit token |

If `whole_matrix_execution_glue_blockers > 0`, do not finalize. Report blockers and the next controller action.

## Review and finalizer sequence

Run closeout in this order:

1. **Collect finals**: confirm each expected lane emitted one correlated `PEER_FINAL`.
2. **Bind packet**: bind each candidate result to matrix coordinate, branch, worktree, changed files, validation, and blockers.
3. **Measure packet**: compute the closeout metrics and blocker budget.
4. **Export controller packet**: write or refresh a controller-readable packet that distinguishes peer assertions from controller-verified facts.
5. **Run `review_candidate_wave`**: decide per lane: ignore, inspect further, fold into synthesis, cherry-pick, or merge after review.
6. **Run matrix review**: reconcile alternatives across cells and confirm no unresolved execution-glue blockers remain.
7. **Require `finalize_post_fanin` token**: do not run finalizer actions without explicit authorization.
8. **Finalize within token scope only**: apply selected dispositions, archive or preserve evidence, and record rollback notes.

A valid `finalize_post_fanin` token names:

- Target 3;
- the candidate-result packet or equivalent evidence location;
- completed `review_candidate_wave` result;
- completed matrix review result;
- `whole_matrix_execution_glue_blockers == 0`;
- the permitted finalizer scope.

Without that token, the only allowed closeout action is to report current status and blockers.

## Safe dispositions

Per lane, choose exactly one disposition:

- `ignore`: lane is not adopted; preserve only if audit policy requires it.
- `inspect further`: lane is promising but not review-complete.
- `fold into synthesis`: lane contributes content to a controller-owned synthesis doc.
- `cherry-pick after review`: controller applies a bounded candidate patch after validation.
- `merge after review`: owner-approved integration path; not authorized by peer output alone.

For the Target 3 doc-only matrix, the controller disposition is:

```text
cell-01 lane B + cell-02 lane B are preferred; lane A details are folded in; the four lane docs are not adopted individually.
```

## Rollback

Rollback is straightforward for doc-only Target 3 synthesis:

- remove this runbook if owner review rejects it;
- leave candidate worktrees unmerged;
- do not delete candidate worktrees until the controller has archived or intentionally declined the lane evidence;
- keep AK/evidence mutations separate and only record them after controller verification.
