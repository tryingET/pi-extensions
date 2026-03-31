---
summary: "Session log for AK task #625: deciding the temporary bundled ASC publish/install bridge lifecycle and documenting the exit criteria for retiring it."
read_when:
  - "Reconstructing how the bundled ASC bridge stopped being open-ended packaging debt."
  - "Checking what evidence now triggers bridge-retirement work after the ASC execution-seam cutover."
---

# 2026-03-31 — Decide bundled ASC bridge lifecycle and exit criteria

## What I did
- Claimed AK task `#625` for the `pi-extensions` repo.
- Re-entered the post-cutover execution-seam packet from both package perspectives:
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
  - `packages/pi-autonomous-session-control/README.md`
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`
  - `packages/pi-society-orchestrator/README.md`
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
- Added `packages/pi-society-orchestrator/docs/project/2026-03-31-bundled-asc-bridge-lifecycle.md` as the canonical lifecycle note for the temporary bundled ASC installability bridge.
- Documented the explicit decision: keep bundling only as a temporary installability shim, then remove it once ASC has real registry-backed release evidence and orchestrator can perform one truthful dependency cutover.
- Recorded exact bridge exit criteria:
  1. ASC publish path is real
  2. orchestrator switches to a normal semver dependency and removes bundling
  3. installed-package proof no longer depends on bundle lifting
  4. README/handoff packet docs stay truthful in both packages
- Recorded the exact review trigger: first ASC publish evidence, any packaging change that would prolong bundling, or the pre-`0.2.0` orchestrator behavior-freeze review.
- Refreshed the cross-package docs/handoff surfaces so `#625` is now treated as landed history and the next execution-seam stewardship slices start at `#626`:
  - `packages/pi-autonomous-session-control/README.md`
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
  - `packages/pi-society-orchestrator/README.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`

## What stayed intentionally out of scope
- I did not change the current packaged install topology, `package.json` dependencies, or the release-smoke harness behavior.
- I did not remove the bundled ASC bridge yet; this task was the lifecycle decision and exit-criteria pass, not the cutover itself.
- I did not start the failure-taxonomy or automated-guardrail slices (`#626`, `#627`).
- I did not reopen execution-plane ownership; ASC remains the runtime owner and orchestrator remains the narrow consumer.

## Result
- The bundled ASC bridge is no longer open-ended packaging debt.
- The repo now has one canonical answer for how long bundling may remain and what evidence retires it.
- The next-session prompts and packet docs now point operators at `#626` / `#627` instead of treating bridge-lifecycle work as unresolved.
- `#628` is now unblocked on the bridge-lifecycle side because the review trigger and exit criteria are explicit.

## Validation
- `cd packages/pi-autonomous-session-control && npm run docs:list`
- `cd packages/pi-autonomous-session-control && npm run check`
- `cd packages/pi-society-orchestrator && npm run docs:list`
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run quality:pre-commit`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run quality:pre-push`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run quality:ci`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run check`

## Next obvious move
- Start `#626` or `#627` depending on whether the next bounded seam-stewardship slice should be failure-taxonomy cleanup or automated anti-drift guardrails.
- Start the actual bridge-removal cutover only when the new lifecycle note's review trigger fires.
