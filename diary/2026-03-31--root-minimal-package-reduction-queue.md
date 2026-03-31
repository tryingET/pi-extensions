---
summary: "Session diary for AK task #603: publishing the first minimal package-local tech-stack reduction queue and refreshing the root handoff after the target-state classification wave."
read_when:
  - "Reconstructing why the next repo-local wave after #601/#602 became a three-task pilot queue instead of a blanket migration backlog."
  - "Reviewing why `packages/pi-activity-strip`, `packages/pi-autonomous-session-control`, and `packages/pi-interaction/pi-interaction` were selected as the first routed package-local reductions."
---

# 2026-03-31 — Publish the first minimal package-reduction queue

## What I did
- Re-read the root bootstrap, the refreshed classification docs, and the current AK state before changing the handoff surfaces:
  - `next_session_prompt.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
  - `docs/project/tech-stack-review-surfaces.md`
  - `docs/project/reduced-form-migration-contract.md`
- Claimed AK task `#603` for the monorepo root.
- Materialized the first routed package-local reduction queue in AK instead of opening every remaining classified package at once:
  - `#634` — `packages/pi-activity-strip` simple-package `none` pilot
  - `#635` — `packages/pi-autonomous-session-control` monorepo-package `none` pilot (depends on `#634`)
  - `#636` — `packages/pi-interaction/pi-interaction` child-package `reduced-form` pilot (depends on `#635`)
- Updated the root direction/handoff surfaces so they now point at the published minimal queue rather than the already-completed classification slice:
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
  - `docs/project/tech-stack-review-surfaces.md`
  - `next_session_prompt.md`

## Why this queue is minimal
- `packages/pi-activity-strip` is the first simple-package `none` pilot for the generic boilerplate-only reduction path.
- `packages/pi-autonomous-session-control` is the only remaining monorepo-package root classified toward `none`, so it is the smallest topology-distinct second pilot after the simple-package path is proven.
- `packages/pi-interaction/pi-interaction` is the only remaining `legacy-full` package classified toward `reduced-form`, so it must stay in the first queue if the repo is going to prove both truthful end states.
- The other boilerplate-only `none` candidates remain intentionally deferred until those representative pilots land:
  - `packages/pi-context-overlay`
  - `packages/pi-little-helpers`
  - `packages/pi-ontology-workflows`
  - `packages/pi-society-orchestrator`
  - `packages/pi-vault-client`

## What I deliberately did not do
- I did not open a blanket task for every remaining `legacy-full` package.
- I did not reopen the completed root classification tasks `#601` and `#602`.
- I did not start package-local implementation work for `#634`, `#635`, or `#636` in this root handoff slice.
- I did not touch the pre-existing untracked helper script already present in the repo worktree.

## Validation
- `npm run quality:pre-commit` ✅
- `npm run quality:pre-push` ✅
- `npm run quality:ci` ✅
- `npm run check` ✅

## Result
- The root handoff no longer points at the already-finished classification wave.
- AK now exposes the smallest representative package-local reduction queue instead of a broad speculative backlog.
- The next truthful repo-local move is `#634`, with `#635` and `#636` intentionally dependency-gated behind it.
