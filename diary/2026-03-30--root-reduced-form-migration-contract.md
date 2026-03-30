# 2026-03-30 — Lock root reduced-form migration contract for remaining legacy-full package surfaces

## What I Did
- Re-read the root handoff, direction-chain docs, stack-policy surfaces, and the refreshed audit snapshot from the monorepo root context.
- Claimed AK task `#597` through the canonical root wrapper.
- Added `docs/project/reduced-form-migration-contract.md` to define:
  - the accepted steady states for package-local tech-stack review surfaces (`none` or `reduced-form`)
  - the rejection of `policy-only` as a migration end state
  - the allowed migration sequence before removing `policy/stack-lane.json`
  - the exact routing boundaries across root docs/scripts, the template repo, package-local follow-up, and adjacent verification lanes
  - a routed target table for every currently audited `legacy-full` package surface
- Updated the canonical root surfaces so the contract is discoverable from:
  - `README.md`
  - `docs/tech-stack.local.md`
  - `docs/project/root-capabilities.md`
  - `docs/project/tech-stack-review-surfaces.md`
  - `docs/project/operating_plan.md`
  - `next_session_prompt.md`

## Contract captured
- Root remains the owner of the shared stack-policy stance and validation helpers.
- The only accepted package-local steady states are:
  - `none`
  - `reduced-form` (`docs/tech-stack.local.md` only when a real local override exists)
- `legacy-full` is transitional only.
- `policy-only` is not an accepted target state.
- Removing remaining package-local `policy/stack-lane.json` files is now a routed package/template follow-up, not a one-shot root-only deletion wave.

## What I Deliberately Did Not Do
- I did not remove any package-local `policy/stack-lane.json` files in this pass.
- I did not create speculative new root AK tasks after `#597`; the next root-owned wave should be selected explicitly from the direction chain if readiness is empty.
- I did not touch the unrelated in-progress package changes already present elsewhere in the working tree.

## Validation
- `npm run quality:pre-commit` ✅
- `npm run quality:pre-push` ✅
- `npm run quality:ci` ✅
- `npm run check` ✅
- `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict` ⚠️ still fails on pre-existing repo-wide metadata issues outside this slice

## Result
- AK task `#597` now has a durable root-side contract to point package/template follow-up at.
- The root handoff no longer tells the next session to re-do this contract work.
- Remaining package-local reductions can now be routed explicitly instead of copying policy ad hoc.
