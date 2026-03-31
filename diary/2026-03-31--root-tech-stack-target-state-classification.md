---
summary: "Session diary for AK tasks #601 and #602: auditing the remaining legacy-full package tech-stack docs, classifying their truthful target states, and routing the next follow-up candidates at the monorepo root."
read_when:
  - "Reconstructing why the TG2 operating plan moved from the initial audit slice to explicit per-package target-state classification."
  - "Reviewing why seven remaining legacy-full package docs were classified toward `none` while `packages/pi-interaction/pi-interaction` stayed the only `reduced-form` candidate."
---

# 2026-03-31 — Classify remaining legacy-full package tech-stack surfaces

## What I did
- Read the monorepo-root bootstrap and direction chain again before changing the root audit surfaces:
  - `next_session_prompt.md`
  - `docs/project/vision.md`
  - `docs/project/strategic_goals.md`
  - `docs/project/tactical_goals.md`
  - `docs/project/operating_plan.md`
  - `docs/project/reduced-form-migration-contract.md`
  - `docs/project/tech-stack-review-surfaces.md`
- Claimed AK task `#601` first because the requested `#602` slice was dependency-gated on that audit step.
- Re-ran the live review-surface audit and confirmed the package counts were unchanged: `14` package roots, `8` `legacy-full`, `1` `reduced-form`, `0` `policy-only`, `5` `none`.
- Re-checked the remaining `legacy-full` package docs and confirmed that seven package-local `docs/tech-stack.local.md` files are still the same boilerplate copy (`sha256:04a5fb…0241f`), while `packages/pi-interaction/pi-interaction/docs/tech-stack.local.md` remains the only distinct doc (`sha256:ce50c7…d6fa`).
- Refreshed the root audit and migration-contract surfaces so TG2 now records per-package target-state truth and routed next candidates:
  - `docs/project/tech-stack-review-surfaces.md`
  - `docs/project/reduced-form-migration-contract.md`
- Updated the root operating plan so the TG2 slice state matches the completed audit/classification work and points the next session at `#603` as the remaining ready slice:
  - `docs/project/operating_plan.md`

## Decisions captured
- The seven boilerplate-only `legacy-full` package surfaces are now provisionally classified toward the `none` steady state.
- `packages/pi-interaction/pi-interaction` remains the only `legacy-full` package provisionally classified toward `reduced-form`, because it still carries a child-package-specific typecheck/validation note worth preserving after `policy/stack-lane.json` is removed.
- Adjacent template verification routing stays explicit: template-default changes belong in `pi-extensions-template`, and Nunjucks verification for those changes still routes through `packages/pi-vault-client`.
- I did not update `next_session_prompt.md` in this slice; the stable handoff refresh is already the scoped deliverable for `#603`.

## Validation
- `npm run quality:pre-commit` ✅
- `npm run quality:pre-push` ✅
- `npm run quality:ci` ✅
- `npm run check` ✅

## Result
- TG2 now has root-owned per-package classification truth instead of only a bucket-level signal.
- The root migration contract now says which current `legacy-full` packages are headed to `none` versus `reduced-form` and why.
- The next root move is narrower and explicit: `#603` should materialize only the smallest truthful package-local reduction queue and refresh the stable handoff surfaces.
