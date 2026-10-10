---
summary: "AK5589 dated preservation-first main reconciliation and exclusive owner-routed landing queue."
read_when:
  - "Selecting the next pi-extensions landing or checking retained owner work."
  - "Continuing AK5589 without replaying old convergence or qualification attempts."
type: "coordination-handback"
status: "verified-handback"
date: "2026-10-07"
---

# AK5589 main convergence and landing queue

AK5589 delivers a coordination handback. Its allowed surface is
`docs/project/main-convergence/**`; it does not own package/source landing,
publication, runtime activation or cleanup. AK is authoritative. The dated JSON
files below are projections and observations, never an execution adapter.

## Current outcome

Current local `main` is `7571f5c197ce25095c3d2d4ba6ee072271e54a3a`.
Cached `origin/main` is `17340249bcb5d9e9f18fc8f0d1bd41375287bbe6`.
The cached remote tip is an ancestor of local main: **2 local-only / 0
origin-only commits**. No fetch or remote-advertised-head query was performed.
A new remote state must be obtained by an admitted publication/landing owner.

AK6740 already completed the October 6 main reconciliation at `14f1fb059`.
Its retained backup is `backup/main-pre-reconcile-2026-10-06`. AK5733,
AK5743 and AK5746 completed earlier source convergence. These completions
replace the stale proposal to repeat the September combined-main campaign;
they do not establish current installed runtime or arbitrary branch coverage.

AK5480 is actively claimed by
`claude-session-b78f9b01-3a20-44e5-8e41-6dab716fd3aa`, observed entity 14,
lease expiry `2026-10-07T19:22:33.274528908+00:00`. Its retained worktree is
`/home/tryinget/.local/state/pi-quests/tmp/pe5480-b78f9b01`.
AK5589 assigns no competing executor and issues no new landing reservation.
The owner's existing task-session authority is not taken over or expanded.

**New admitted landings: zero.** Every unqualified request remains held. The
queue identifies the next exact owner action instead of treating readiness,
branch ancestry, a completed source task or a generic proceed as permission.

## Retained inventory

[Carrier inventory](carriers-2026-10-07.json) records all 45 registered
worktrees, including this new controller worktree, and 30 local branches.
There are 34 existing worktree directories, 12 dirty worktrees and 11 missing
registry paths. No directory, ref, failed attempt, staged/unstaged content,
untracked root or runtime carrier was removed or rewritten.

Read-only Git status and ancestry/patch comparisons are the extent of this
inventory. Ignored payload, process/open-FD liveness, settings, whole untracked
content and restoration archives were not inspected. A clean status, missing
path or ancestry relationship is therefore **not retirement qualification**.
The inventory preserves every carrier rather than imposing a one-worktree target.

### Branch dispositions

- Fifteen local branch tips are ancestors of current main. Keep their carriers;
  ancestry alone does not prove current behavior or authorize deletion.
- Five non-ancestor branches have no unique non-merge patch and one
  patch-equivalent commit: cockpit, npm visibility, peer CI prerequisite,
  Ghostty handshake and candidate worktree placement. They require owner
  acceptance before any lifecycle or retirement change.
- `integrate/activity-ribbon-5552` retains a merge-only difference; zero
  non-merge patches does not prove the merge tree is redundant.
- Unique retained patch carriers include the workstation provider hot path,
  multipass bootstrap, release discovery, visible-loop runtime closure,
  TypeScript spike, SCI/Nexus copies and two release-please branches. No
  unique old patch was selected for replay.

The two SCI/Nexus branches share nine older commits and each holds a different
final commit. Their task AK5245 is done, but dirty owner state remains. Keep
both; do not conflate task completion with byte coverage or discard either.
The multipass source task AK5450 and composition task AK5660 are done;
source-owner current-target acceptance is still needed before replaying its
old branch. The TypeScript prototype has completed successor AK5508. Old
spike/source observations never qualify a new package installation.

## Ordered owner queue

[Machine-readable queue](queue-2026-10-07.json) contains fresh task versions,
dependencies, exact missing inputs and the exclusive owner handoff protocol.
These are input priorities, not permission to execute a row.

| Order | Owner task | Current disposition | Concrete next input |
| --- | --- | --- | --- |
| 0 | AK5480 | Active owner protected | Exact owner target, source/effects, verification and rollback handoff before a new coordinated landing. |
| 1 | AK6740 | Reconciliation already complete | Preserve its backup/result; no replay or publication under AK5589. |
| 2 | AK6449 | Host qualification held | Next admitted full-wrapper verification plus actual CLI/SDK/transport/journal/summary handback. |
| 3 | AK6679 | Catalog owner effects held | Actual coherent schema6/exact Codex6.1 catalog provenance; generator intent is insufficient. |
| 4 | AK6680 | Dependencies 6449/6679 open | Coherent emitted host SDK/CLI/lazy/catalog package proof; installed adoption stays separate. |
| 5 | AK6681 | Consumer package HOLD | Exact package-owner source/test/build effect disposition and fresh aggregate closure handback. |
| 6 | AK6427 | Dependency 6449 open | Qualified current host/package interface and bounded consumer source/offline admission before candidate effects. |
| 7 | AK6682 | Dependencies 6680/6681 open | Installed host/consumer identity, owner-admitted activation and rollback; stage-specific 6427 source acceptance required. |
| 8 | AK5554 | Historical pending owner task | Reconcile retained release-discovery source with completed convergence; no automatic patch replay. |
| 9 | AK5552 | Historical pending owner task | Resolve merge-tree/source acceptance or supersession through its owner; preserve lifecycle. |
| 10 | AK6634 | Unlanded dirty owner candidate | Frozen source, current-target acceptance and admitted package verification. |
| 11 | AK6664 | Diagnosis-only task | Retained automatic-tab effect diagnosis; successful AK6626 explicit-window proof is already landed. |

Retain the four disjoint followups AK6679/6680/6681/6682. AK6680 owns emitted
host proof; AK6682 owns installed composition. Do not fold or complete them.
AK6682 consumes accepted **stage-specific AK6427 source**, not final AK6427
live completion, so the package/adoption sequence contains no new cycle.

AK6449's accepted counter repair is source plus three focused helper cases.
The earlier raw 45-test pass and full-wrapper `ROLE_COUNTERS` failure remain
separate. Accepted helper source does not backfill old missing counters, prove
a full-wrapper rerun or implement the public host/consumer interface. The old
0.84.4 bridge's 106/16/42 results are not current v1/Codex6.1 capability proof.

## Exclusive landing protocol

1. The owning task supplies exact current scope, contract, guardrails and effect
   authority; its designated executor obtains its own valid claim.
2. The owner freezes one source ref/commit, changed paths, current canonical
   target, preservation evidence, relevant verification and exact rollback.
3. Affected owners acknowledge one designated canonical executor and one
   bounded target. An absent acknowledgement remains HOLD. An active owner
   is neither displaced nor silently treated as consenting.
4. Immediately before any admitted effect, re-read owning authority, claim,
   canonical HEAD, source pins and affected worktree state. Stop on drift or
   overlapping work; retain both observations and ask the owning surface to
   reconcile them. Do not mechanically retry an indeterminate attempt.
5. A canonical movement uses `scripts/land-canonical.sh` under **separate exact
   owner admission**. Its fetch, package installation, load smoke and rollback
   effects are real; a queue row does not authorize them.
6. Clear a reservation only after the owner's actual effect and readback.
   Installed runtime identity, reload/activation, publication and cleanup stay
   separate owner actions. Queued delivery, process exit and source tests
   cannot serve as installed candidate proof.

This is a coordination protocol, not a new global Git lock. No global exclusive
execution claim is made. The current reservation is null. No missing runtime
admission adapter or lock implementation is invented in documentation.

The [AK5480 handoff](owner-handoff-5480.json) records a communication-only
notice: existing work may continue; no pause, claim transfer, retry or new effect
is requested. The existing supported broker was contacted once, but could not resolve the
exact active claimant (missing peer or cwd mismatch). No message delivery or
owner acknowledgement is established; no retry or alternate messaging surface
was invented. This does not imply that the AK5480 owner is absent or inactive.
The retained handoff is available for later owner retrieval. No new landing
reservation depends on assuming delivery.

## Fresh adjacent-task corrections

Installed AK now records **AK5758 done, entity 46**, with owner commits
`5b970eed`/`0603bb64`, evidence 13876–13878 and an operator decision to
separate admission/finalization from older-run deletion. Its result retains
explicit-clean, 18-run disposal, five loop-mount and Decision161 followups.
Those are owner-reported result obligations, not effects reproduced here or
cleanup permission granted by this queue.

Installed AK records **AK6425 done, entity 11**, with owner commits
`cb5ccf3d`/`60b098a5` and native prerequisite evidence 13886/13998. Its
prerequisite handback is not an AK5622 campaign run or speedup verdict.
AK6426 remains pending entity 30; AK5622 remains pending entity 6, depending
on 6425/6426/6427. Do not reopen completed 5758/6425 based on stale October3
relay messages, and do not reuse a consumed SDK attempt.

AK5597 remains failed/superseded without a compatibility verdict. AK5614
source-only completion, historical broken commitments, invalid pilots and all
retained qualification failures remain unchanged. AK5589's own historical
broken commitments 12654/13046/13072/14830 are preserved.

## Verification and handback

This snapshot was prepared in an isolated worktree at the pinned main commit,
with done contract **1604/v1** and guardrails **1612/v1** read back as a whole.
The controller claims only AK5589. Validation covers this documentation slice,
inventory/queue consistency, references and canonical preservation. Full CI,
package checks, host tests and runtime smokes are not assertions of this task.

Controller receipts live at:
`/home/tryinget/.local/state/pi-quests/tmp/ak5589-main-convergence-20261007-nq9ydrgs/receipts`.
Scoped strict documentation, index-only repository smoke and whitespace
checks pass. The loop impact classifier reports bounded documentation scope.
The normal loop smoke performs an implicit fetch, so its networked form and
full CI were not executed under this docs-only, no-fetch contract. Inventory,
queue/AK consistency and canonical preservation receive a separate inspection
receipt. The snapshot/readback digests and post-inspection report are linked
through AK evidence. The coordinator releases its claim at completion; the retained files
and owning tasks suffice for continuation without this session staying open.
