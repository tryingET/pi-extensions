---
summary: "Session log for AK task #624: separating ASC seam contract proof from orchestrator installed-package smoke in the post-cutover stewardship packet."
read_when:
  - "Reconstructing how the execution-seam proof policy was split into contract, consumer, and installed-package layers."
  - "Checking why `npm run release:check` is no longer described as the primary source of seam semantics."
---

# 2026-03-31 — Split execution-seam verification layers

## What I did
- Claimed AK task `#624` for the `pi-extensions` repo.
- Re-read the current post-cutover seam packet from both package perspectives:
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-autonomous-session-control/docs/project/execution-contract-change-checklist.md`
  - `packages/pi-autonomous-session-control/README.md`
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-31-execution-seam-charter.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
  - `packages/pi-society-orchestrator/README.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`
- Split the proof policy explicitly into three layers:
  1. ASC package-local contract truth
  2. orchestrator package-local consumer truth
  3. orchestrator installed-package smoke / packaging truth
- Updated the ASC checklist and contract docs so installed-package smoke is no longer described as a substitute for seam semantics.
- Updated the orchestrator seam charter, backlog note, README, and handoff so the installed-package harness is described as packaged-import/install proof only.
- Refreshed both package handoff prompts so `#623` and `#624` are treated as landed history and the remaining legitimate seam tasks now start at `#625`.

## What stayed intentionally out of scope
- I did not change ASC runtime code, orchestrator runtime code, or the installed-package smoke harness itself.
- I did not decide the long-term lifecycle of the bundled ASC publish/install bridge; that remains `#625`.
- I did not start the failure-taxonomy or automated guardrail slices (`#626`, `#627`).
- I did not reopen execution-plane ownership; ASC remains the runtime owner and orchestrator remains the narrow consumer.

## Result
- The seam packet now distinguishes contract truth from packaging truth instead of treating `npm run release:check` as the catch-all proof source.
- Future seam edits have a clearer rule for when to run ASC contract tests, when to run orchestrator repo-local consumer checks, and when installed-package smoke is actually required.
- The next-session prompts no longer point at already-landed tasks `#623` and `#624`.

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
- Start `#625` unless the operator explicitly wants the failure-taxonomy or seam-guardrail slices first.
- Keep future seam stewardship bounded to the remaining post-cutover queue rather than reopening `#604` -> `#606`.
