---
summary: "Session diary for AK task #635: proving the monorepo-package `none` migration path by removing pi-autonomous-session-control's local tech-stack surface and refreshing the root audit."
read_when:
  - "Reviewing how the monorepo-package `none` pilot under TG3 was implemented and validated."
  - "Checking why `packages/pi-autonomous-session-control` moved from `legacy-full` to `none` before `#636` became the next ready slice."
system4d:
  container: "Repo-session diary entry for the second reduced-form migration pilot."
  compass: "Keep shared stack policy rooted at monorepo level and remove package-local boilerplate only when validators/docs no longer depend on it."
  engine: "Re-read root contract -> align package-local files/scripts -> remove local surfaces -> refresh root audit/handoff -> validate."
  fog: "The main risk is deleting package-local stack files while package validation, README guidance, or root routing docs still assume the old legacy-full surface."
---

# 2026-03-31 — Land the pi-autonomous-session-control `none` surface pilot

## What I did
- Re-entered the active root direction/contract packet before touching the monorepo-package pilot:
  - `docs/project/vision.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
  - `docs/project/reduced-form-migration-contract.md`
  - `docs/project/tech-stack-review-surfaces.md`
  - `next_session_prompt.md`
- Claimed AK task `#635`.
- Reduced `packages/pi-autonomous-session-control` from `legacy-full` to `none` by removing both local tech-stack surfaces:
  - deleted `packages/pi-autonomous-session-control/docs/tech-stack.local.md`
  - deleted `packages/pi-autonomous-session-control/policy/stack-lane.json`
- Updated package-local validation/docs so the package no longer treats those deleted files as required steady-state truth:
  - `packages/pi-autonomous-session-control/package.json`
  - `packages/pi-autonomous-session-control/scripts/validate-structure.mjs`
  - `packages/pi-autonomous-session-control/scripts/validate-structure.metadata.mjs`
  - `packages/pi-autonomous-session-control/scripts/validate-structure.sh`
  - `packages/pi-autonomous-session-control/README.md`
- Re-ran the root review-surface audit and refreshed the root-owned audit/handoff surfaces so the repo now records the landed monorepo-package pilot and the remaining next slice:
  - `docs/project/tech-stack-review-surfaces.md`
  - `docs/project/reduced-form-migration-contract.md`
  - `docs/project/operating_plan.md`
  - `next_session_prompt.md`

## Decisions captured
- `packages/pi-autonomous-session-control` had no real package-local stack override worth preserving, so the truthful target state was `none`, not `reduced-form`.
- The monorepo-package topology does not justify keeping `policy/stack-lane.json` or `docs/tech-stack.local.md` when the package can point at the root-owned stack stance and still validate/package cleanly.
- With both `#634` and `#635` complete, the remaining first-queue slice is now the child-package `reduced-form` case in `#636`.

## Validation
- `cd packages/pi-autonomous-session-control && npm run docs:list` ✅
- `cd packages/pi-autonomous-session-control && npm run check` ✅
- `npm run tech-stack:review-surfaces` ✅
- `npm run quality:pre-commit` ✅
- `npm run quality:pre-push` ✅
- `npm run quality:ci` ✅
- `npm run check` ✅

## What I deliberately did not do
- I did not start the child-package `reduced-form` follow-up in `#636`.
- I did not touch the pre-existing unrelated ASC/orchestrator seam-doc edits already present in the worktree.
- I did not modify the pre-existing untracked helper script already present in the repo worktree.

## Result
- `packages/pi-autonomous-session-control` now matches the `none` steady state defined by the root migration contract.
- The root audit now shows `6` `legacy-full`, `1` `reduced-form`, `0` `policy-only`, and `7` `none` package-local surfaces.
- The active TG3 wave now advances from the two completed `none` pilots to `#636` as the next ready task.
