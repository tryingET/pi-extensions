---
summary: "Session diary for AK task #636: proving the child-package `reduced-form` migration path by removing pi-interaction's local stack policy file while preserving the package-specific tech-stack note."
read_when:
  - "Reviewing how `packages/pi-interaction/pi-interaction` moved from `legacy-full` to `reduced-form` under TG3."
  - "Checking what was updated after the last slice of the first minimal package-reduction queue landed."
system4d:
  container: "Repo-session diary entry for the child-package reduced-form pilot."
  compass: "Keep shared stack policy rooted at monorepo level while preserving the one child-package doc that still carries a truthful local override note."
  engine: "Re-read root contract -> claim task -> remove local policy metadata -> align package docs/scripts -> refresh root audit/handoff -> validate."
  fog: "The main risk is removing `policy/stack-lane.json` without preserving the child-package note or without refreshing the root audit/handoff surfaces that still route the remaining follow-up queue."
---

# 2026-03-31 — Land the pi-interaction child-package `reduced-form` pilot

## What I did
- Re-entered the active root direction/contract packet before touching the final slice of the first reduced-form migration queue:
  - `docs/project/vision.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
  - `docs/project/reduced-form-migration-contract.md`
  - `docs/project/tech-stack-review-surfaces.md`
  - `next_session_prompt.md`
- Claimed AK task `#636`.
- Reduced `packages/pi-interaction/pi-interaction` from `legacy-full` to `reduced-form` by removing only the local stack policy file:
  - deleted `packages/pi-interaction/pi-interaction/policy/stack-lane.json`
- Preserved and clarified the truthful local override surface in package docs:
  - `packages/pi-interaction/pi-interaction/docs/tech-stack.local.md`
  - `packages/pi-interaction/docs/tech-stack.local.md`
  - `packages/pi-interaction/pi-interaction/README.md`
- Updated package-local metadata/validation so the package no longer treats `policy/stack-lane.json` as required steady-state truth:
  - `packages/pi-interaction/pi-interaction/package.json`
  - `packages/pi-interaction/pi-interaction/scripts/validate-structure.mjs`
  - `packages/pi-interaction/pi-interaction/scripts/validate-structure.sh`
- Refreshed the root audit/direction/handoff surfaces so the repo now records the completed child-package pilot and the finished first minimal queue:
  - `docs/project/tech-stack-review-surfaces.md`
  - `docs/project/reduced-form-migration-contract.md`
  - `docs/project/operating_plan.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `next_session_prompt.md`

## Decisions captured
- `packages/pi-interaction/pi-interaction` was the only truthful `reduced-form` target in the first queue, so the correct change was to keep `docs/tech-stack.local.md` and remove only `policy/stack-lane.json`.
- The `packages/pi-interaction` group-root doc needed to say explicitly that lane metadata/pinning is root-owned, because the group root already lives in the reduced-form state and the child package now aligns with that same boundary.
- With `#634`, `#635`, and `#636` all complete, the first minimal package-reduction queue is fully proven; any broader follow-up should be materialized as a new narrow queue from the remaining boilerplate-only `legacy-full` set rather than opened implicitly.

## Validation
- `cd packages/pi-interaction/pi-interaction && npm run check` ✅
- `cd packages/pi-interaction/pi-interaction && npm run release:check:quick` ✅
- `npm run tech-stack:review-surfaces` ✅
- `npm run quality:pre-commit` ✅
- `npm run quality:pre-push` ✅
- `npm run quality:ci` ✅
- `npm run check` ✅

## What I deliberately did not do
- I did not materialize the next package-reduction queue for the remaining five boilerplate-only `legacy-full` packages; that should be explicit follow-up after refreshing AK readiness.
- I did not touch unrelated package/runtime work outside the `#636` reduced-form migration slice.
- I did not add template-repo changes, because this task retrofits an existing generated package rather than changing fresh scaffold defaults.

## Result
- `packages/pi-interaction/pi-interaction` now matches the `reduced-form` steady state defined by the root migration contract.
- The root audit now shows `5` `legacy-full`, `2` `reduced-form`, `0` `policy-only`, and `7` `none` package-local surfaces.
- TG3's first minimal routed package-reduction queue is now fully landed through `#603`, `#634`, `#635`, and `#636`.
