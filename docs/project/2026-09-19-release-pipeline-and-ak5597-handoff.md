---
summary: "SUPERSEDED as a work plan the same day: all five steps are done and AK5762 is closed; keep as a historical record and read the continuation banner first. Original: handoff from a non-resumable session on 2026-09-19 (pre-reboot): AK5597 closed as failed (goal dropped by the operator), release-check and release-please repaired (AK5761 done, PR 213), evidence-gate race fix in open PR 215 (AK5762 deferred). Exact next steps and uncommitted paths."
read_when:
  - "Continuing work after the 2026-09-19 reboot in pi-extensions."
  - "PR 215, AK5762, release-evidence or the release PR check."
type: reference
task_id: 5762
---

# Handoff — 2026-09-19, before reboot

> **Continued 2026-09-19 by `session-7f86cb2f-3550-4a77-b523-44bed1534b54`.
> All five steps are done; this is a historical record. Do not follow the steps
> below.**
>
> - **Step 1:** #214's wave `41a7d378` is fully on npm: 7/7 packages at the
>   wave version, with provenance and GitHub release evidence (evidence 10055).
>   "Nothing here has published before" below is wrong; the pipeline published
>   on 2026-09-02/03. Three blockers came up, in order:
>   1. `npm-publish` still had a required reviewer, because the 2026-09-03
>      wave-admit change (`docs/project/2026-09-03-npm-publish-wave-admit.md`) was
>      never applied. The operator authorized emptying it (10038). That canceled
>      the pending approval and stopped the release-please loop, so the wave was
>      re-dispatched by hand with the same wave inputs.
>   2. pi-little-helpers failed its quality gate: `dist/task-session` is built
>      only by prepack. Fixed by #216 (AK5768).
>   3. Every publish failed the 60 s post-publish npm visibility poll even though
>      `npm publish` succeeded. Each recovered with an exact/no-op re-dispatch.
>      Until AK5770 widens the poll, every automatic wave stops after its first
>      package.
> - **Step 2:** #215 merged as `6e7fc1b`, and main is green. Its worktree and
>   branch are removed. AK5762 is closed `done` (evidence 10039); the new gate's
>   first live run is still the next release-please PR.
> - **Step 3:** the four AK5597 docs landed in `7496d0b1b`, with review
>   corrections to the reconciliation note.
> - **Step 4:** local main was rebased and pushed through `3ac629343`. That
>   required archiving and removing the untracked `main-convergence/` (AK5779)
>   and re-pinning the real-fleet baseline (AK5783). The pre-push hermeticity
>   follow-ups are AK5787–5790.
> - **Step 5:** the operator authorized closing 14 stale or orphaned tasks
>   (evidence 10067–10080).

Written by controller `session-146ca35d-5fa1-4aad-bdde-bbb0712515e3`, which cannot
be resumed. Everything needed to continue is here. AK is the authority; verify
state with the commands given before acting.

## Done and verified

1. **AK5597 closed as `failed` (superseded).** Its goal (qualify Pi 0.84.4 before
   aligning the baseline) was withdrawn by the operator (9807, 9846) and never
   achieved (SDK 0/10). Provisioning succeeded only under AK5702. The operator
   authorized the closure in session. Evidence 10027 (authorization) and 10028
   (reconciliation). Full record:
   `docs/project/pi-0844-isolated-qualification/2026-09-19-ak5597-supersession-reconciliation.md`.
2. **AK5761 done: release-check on main repaired.** PR #213, squash commit
   `0a85161fc`. The task-session native build now resolves Node-API headers from
   the running Node, and pi-society-orchestrator builds its own exported
   `dist/task-session` in `prepack`. Evidence 10029–10032; all five main
   workflows passed after the merge.
3. **Ruleset `protect-release-please-branches` (id 22079727) changed with the
   operator's approval.** The `creation` rule was removed and `non_fast_forward`
   kept, so release-please can recreate `release-please--branches--main` again.
   The exact prior definition is saved at
   `/home/tryinget/.local/state/pi-quests/tmp/ak5761-node/ruleset-22079727.before.json`
   (evidence 10030); PUT it to restore.
4. **Release PR #214 ("chore: release main") was MERGED by the operator** at head
   `a4a0b8f`, before PR #215 landed. Whether publish succeeded has **not** been
   checked (see next steps).

## In flight: AK5762, PR #215 (open, CI green)

- **Problem:** `release-check / require-release-evidence` raced
  `release-evidence / render-and-attach`. One `pull_request` event started both,
  nothing ordered them, and rendering takes about 10 minutes. On #214 the checker
  failed at 04:42:02Z and the comment landed at 04:42:59Z. The checker also
  accepted stale evidence after a PR head moved.
- **Fix** (branch `fix/release-evidence-gate-ordering`, commit `bb338fea6`):
  - The check moved into `render-and-attach` as its final step. It passes only
    for a comment that names the exact head (`git rev-parse --short HEAD`) and
    has uploaded attachments.
  - The PR head is resolved before checkout. A manual dispatch now renders the
    PR head and refuses cross-repo PRs.
  - The sibling job was deleted.
  - Decided with a many-of-the-greats analysis: causal ordering plus content
    addressing; a delay or polling loop was rejected.
- **Verified:**
  - The topology test went red, then green.
  - The step scripts, extracted from the YAML, were run against live PR #214
    comments and fixtures.
  - 49 release tests pass, `/code-review` passed after one fix, and PR CI shows
    48 pass and 0 fail. `render-and-attach` was skipped, as expected for a
    non-release PR.
  - Evidence 10036, 10037.
- **AK5762 is `pending` with deferral `until-event pr-215-merged`.**
- Worktree: `/home/tryinget/.local/state/pi-quests/tmp/ak5762-evidence-gate`
  (clean, commit pushed).

## Exact next steps

1. **Check whether #214's release published.**
   `gh run list --branch main --limit 10` (look for publish / release runs on
   the #214 merge commit) and `gh release list --limit 10`. If publish failed,
   diagnose it before anything else. Nothing here has published before.
2. **PR #215:** ask the operator to merge it if it is still open
   (`gh pr view 215`). After the merge:
   - Confirm main's workflows are green.
   - The first live run of the new gate is on the **next** release-please PR,
     since #214 is already merged. On that PR, confirm that `render-and-attach`
     runs Resolve → Render → Verify and passes, and that no
     `require-release-evidence` check appears.
   - Then close AK5762: `ak task resume 5762`, then
     `ak task claim 5762 --agent session-<your-uuid>`, record evidence, then
     `ak task complete 5762 --result '<json>'`.
   - Remove the worktree:
     `git worktree remove /home/tryinget/.local/state/pi-quests/tmp/ak5762-evidence-gate`
     and `git branch -D fix/release-evidence-gate-ordering`.
   - Close AK5762 even if the next release PR is far off. The deferral reason
     already records what to confirm.
3. **Commit the AK5597 docs** (operator asked for `/code-review` before any
   commit). Commit only these explicit paths:
   - `docs/project/pi-0844-isolated-qualification/2026-09-19-ak5597-supersession-reconciliation.md` (untracked, new)
   - `docs/project/pi-0844-isolated-qualification/2026-09-19-ak5597-resume-handoff.md` (modified: superseded banner)
   - `docs/project/pi-0844-isolated-qualification/2026-09-10-offline-provisioning-progress.md` (untracked; banner added)
   - this handoff doc
4. **Local `main` has diverged from `origin/main`.** Local main carries two
   unpushed commits from other sessions: `a203c01a7` (AK5597 handoff doc) and
   `52dc87570` (baseline AK-binding debt). `origin/main` has `0a85161fc` plus
   #214's merge. Rebase or merge before pushing. Don't amend other sessions'
   commits.
5. **Offer the operator a stale-claim cleanup pass.** It needs their
   authorization per task:
   - The dead session `session-01a08914-…` still claims 5659, 5661, 5618, 5624,
     5639 and 5640.
   - 5733 and 5737 are held by other ended sessions.
   - The M3 family 5694, 5703, 5705, 5725, 5726 and 5732 is orphaned by operator
     direction 9846.
   - Closure convention: withdrawn scope closes `fail` "Superseded…"; use
     `done` / `completed_via_successor` only when a successor met the goal.
     Record operator authorization as evidence first.

## Not done, and why

- Working tree changes belonging to other sessions (ontology/dist,
  pi-workstation-inference-provider, many untracked docs) were not touched.
- AK5174 (release-please Actions PR-creation permission) predates the ruleset
  problem and was left pending.
- The operator should know: GitHub did run CI on #214 (created by
  `GITHUB_TOKEN`). An earlier claim in this session that it would not was wrong.
