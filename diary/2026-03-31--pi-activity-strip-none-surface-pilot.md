---
summary: "Session diary for AK task #634: proving the first simple-package `none` migration path by removing pi-activity-strip's local tech-stack surface and refreshing the root audit."
read_when:
  - "Reviewing how the first routed package-local reduction pilot under TG3 was implemented and validated."
  - "Checking why `packages/pi-activity-strip` moved from `legacy-full` to `none` before `#635` was opened as the next ready slice."
---

# 2026-03-31 — Land the pi-activity-strip `none` surface pilot

## What I did
- Re-read the root bootstrap and active direction chain before touching the package-local reduction slice:
  - `next_session_prompt.md`
  - `docs/project/vision.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
  - `docs/project/reduced-form-migration-contract.md`
  - `docs/project/tech-stack-review-surfaces.md`
- Claimed AK task `#634`.
- Reduced `packages/pi-activity-strip` from `legacy-full` to `none` by removing both local tech-stack surfaces:
  - deleted `packages/pi-activity-strip/docs/tech-stack.local.md`
  - deleted `packages/pi-activity-strip/policy/stack-lane.json`
- Updated package-local validation/publish metadata so the package no longer treats those deleted files as required steady-state truth:
  - `packages/pi-activity-strip/package.json`
  - `packages/pi-activity-strip/scripts/validate-structure.mjs`
  - `packages/pi-activity-strip/scripts/validate-structure.sh`
- Re-ran the root review-surface audit and refreshed the root-owned audit/handoff surfaces so the repo now records the landed pilot and the next ready slice:
  - `docs/project/tech-stack-review-surfaces.md`
  - `docs/project/reduced-form-migration-contract.md`
  - `docs/project/operating_plan.md`
  - `next_session_prompt.md`

## Decisions captured
- `packages/pi-activity-strip` had no real local override worth preserving, so the truthful target state was `none`, not `reduced-form`.
- The package-local validators should enforce only the remaining real package contract, not keep `docs/tech-stack.local.md` or `policy/stack-lane.json` alive as historical scaffolding.
- With the simple-package pilot proven, `#635` becomes the next ready slice for the monorepo-package root topology.

## Validation
- `cd packages/pi-activity-strip && npm run docs:list` ✅
- `cd packages/pi-activity-strip && npm run check` ✅
- `npm run tech-stack:review-surfaces` ✅
- `npm run quality:pre-commit` ✅
- `npm run quality:pre-push` ✅
- `npm run quality:ci` ✅
- `npm run check` ✅

## What I deliberately did not do
- I did not touch any of the other deferred `none` candidates outside the first routed queue.
- I did not start the monorepo-package follow-up in `#635`.
- I did not touch the pre-existing untracked helper script already present in the repo worktree.

## Result
- `packages/pi-activity-strip` now matches the `none` steady state defined by the root migration contract.
- The root audit now shows `7` `legacy-full`, `1` `reduced-form`, `0` `policy-only`, and `6` `none` package-local surfaces.
- The active TG3 wave advances cleanly from the simple-package pilot to `#635` as the next ready task.
