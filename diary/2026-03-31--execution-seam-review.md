---
summary: "Session diary for AK task #628: landing the first time-boxed execution-seam review and refreshing the real-consumer map after the post-cutover stewardship wave."
read_when:
  - "Reviewing how the ASC public execution seam was re-judged after the bridge-lifecycle, failure-taxonomy, and guardrail slices landed."
  - "Checking why `#629` remains conditional instead of becoming the next default seam task."
---

# 2026-03-31 — Run the time-boxed execution seam review

## What I did
- Re-read the cross-package seam packet before changing any docs or handoff surfaces:
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-autonomous-session-control/docs/project/execution-contract-change-checklist.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
- Claimed AK task `#628`.
- Added `packages/pi-society-orchestrator/docs/project/2026-03-31-execution-seam-review.md` as the canonical time-boxed review note for the current seam.
- Refreshed the consumer-capability map so the packet now distinguishes:
  - real external runtime consumer paths inside `pi-society-orchestrator`
  - ASC's internal owner/tool composition
  - installed-package release smoke as verification evidence rather than a second consumer
- Updated the cross-package docs and handoff surfaces so the first review outcome is now explicit:
  - keep the seam
  - keep it small
  - do not widen it
  - do not treat multiple call paths inside orchestrator as proof of multiple external consumers
- Refreshed the remaining-gap wording so `#629` stays conditional on a second real external runtime consumer or another evidence-backed seam gap.

## Decisions captured
- `pi-society-orchestrator` is still the only real external runtime consumer package today.
- Direct dispatch and loop execution are two call paths within that same consumer, not a consumer-expansion signal by themselves.
- Installed-package smoke remains important packaging proof, but it must not be used as justification for public seam growth.
- After this review, the seam-specific queue should not advance automatically; `#629` is only legitimate if new evidence appears.

## Validation
- `cd packages/pi-autonomous-session-control && npm run docs:list` ✅
- `cd packages/pi-autonomous-session-control && npm run check` ✅
- `cd packages/pi-society-orchestrator && npm run docs:list` ✅
- `cd packages/pi-society-orchestrator && npm run check` ✅
- `cd packages/pi-society-orchestrator && npm run release:check` ✅
- `npm run quality:pre-commit` ✅
- `npm run quality:pre-push` ✅
- `npm run quality:ci` ✅
- `npm run check` ✅

## What I deliberately did not do
- I did not widen the ASC public execution seam.
- I did not start the bundled-bridge removal cutover.
- I did not open `#629` by default.
- I did not touch the unrelated pre-existing untracked helper script in the repo worktree.

## Result
- The repo now has a canonical first review of the ASC public execution seam after the initial stewardship wave.
- The consumer-capability map is clearer about what is a real consumer versus what is verification infrastructure.
- `#628` is now landed history, and later seam-specific follow-up is correctly reduced to the conditional `#629` case.
