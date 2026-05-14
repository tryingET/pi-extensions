---
summary: "Red-team and recovery playbook for AK task 2959 post-fan-in campaign finalizer automation."
read_when:
  - "Hardening or operating matrix campaign post-fan-in finalizer automation."
  - "Investigating PEER_FINAL, candidate-result packet, worktree cleanup, branch cleanup, peer ambiguity, or AK availability failures."
---

# Post-fan-in finalizer red-team recovery playbook

## Scope

This playbook is for AK task 2959 / post-fan-in campaign finalizer automation. It treats finalizer automation as a fail-closed controller aid, not completion authority.

The durable comparison input remains controller-measured `autoresearch.candidate_result.v1` packets. Raw `PEER_FINAL`/intercom text is communication only.

## Fail-closed matrix

| Red-team case | Required finalizer posture | Recovery action |
| --- | --- | --- |
| Missing `PEER_FINAL` | Do not select, merge, clean up, or project evidence from the lane. Surface the lane as missing/stalled until a measured packet exists or owner replans without it. | Wait for the visible peer, rerun candidate binding/measurement/export from verified worktree, or owner-replan the explicit lane set. |
| Late `PEER_FINAL` after review | Do not promote from stale review output. | Rerun the same aggregate `review_candidate_wave`/`review_matrix_campaign` with the full explicit packet set. |
| Stale review artifacts | Treat prior review/cockpit output as advisory only when packet inventory changed. | Regenerate candidate-result packets and rerun review before final owner decision. |
| Off-limits path drift | Mark the lane non-selectable even if its metric wins. | Inspect the diff; ask for a scoped rerun or discard/rewind plan. Covered by executable `review_candidate_wave` off-limits-path test. |
| Dirty parent overlap | Do not assume parent dirty changes are part of a candidate. | Compare candidate branch/base/worktree directly; require controller-verified changed files in the measured packet. |
| Worktree removal failure | Do not claim cleanup completion or delete branches as compensation. | Leave residue visible, record exact failing command/stdout/stderr, and hand off an owner cleanup action. |
| Branch deletion failure | Do not delete worktrees or mutate AK/evidence to hide residue. | Keep branch name in residue list and hand off explicit owner cleanup. |
| Peer process ambiguity | Do not infer liveness/completion from ambiguous session/process matches. | Require exact peer run id plus candidate worktree/branch/base/changed-files verification before measurement. |
| AK unavailable | Do not write fallback evidence, KES, or task lifecycle state. | Keep closeout local/advisory and rerun AK owner-surface action only after AK is available. |

## Manual post-fan-in residue metric

Use `manual_post_fanin_residue` as a lower-is-better manual metric while automation is hardening.

Count one residue item for each unresolved lane/worktree/branch/process/artifact/AK handoff that still needs human cleanup or rerun after the finalizer attempt. Target is `0`. This candidate patch reduces expected residue by making off-limits path drift fail closed before owner selection, so illegal lanes do not proceed to cleanup/promotion decisions.

## Operator sequence

1. Verify every visible peer report against candidate worktree path, branch, base ref, changed files, and packet path.
2. Export/refresh one candidate-result packet per explicit planned lane.
3. Run aggregate review with explicit packet paths and the original off-limits list.
4. If any lane is missing, late, stale, illegal, or ambiguous, stop at review/recovery; do not finalize.
5. Only after owner review accepts a lane, run lower-plane keep/discard/rewind/finalize plans.
6. Treat AK/KES/evidence/worktree cleanup as explicit owner-surface actions, never hidden finalizer side effects.

## Rollback

Rollback is safe by reverting the off-limits selection guard and this playbook. Reversion restores the prior advisory-only behavior; it should not be promoted unless another guard covers illegal changed-file drift before final selection.
