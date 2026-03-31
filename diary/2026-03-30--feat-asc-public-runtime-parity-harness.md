---
summary: "Session log for AK task #605: adding a parity harness that proves the ASC public runtime stays aligned with dispatch_subagent for the promised shared behavior."
read_when:
  - "Reconstructing how ASC proved its public execution seam is trustworthy before orchestrator cutover."
  - "Reviewing why AK task #606 becomes the next truthful move after the public-runtime parity slice."
---

# 2026-03-30 — Prove ASC public-runtime parity with `dispatch_subagent`

## What I did
- Claimed AK task `#605` for the `pi-extensions` repo.
- Re-entered the ASC/orchestrator execution-boundary packet before changing tests or handoff docs:
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
  - `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
- Added a dedicated parity harness in `packages/pi-autonomous-session-control/tests/public-execution-parity.test.mjs`.
- Built that harness so it runs the **public runtime** and the **actual `dispatch_subagent` tool path** against the same injected spawner expectations instead of relying on parallel-but-separate happy-path tests.
- Proved parity for the shared behavior downstream consumers are allowed to trust:
  - prompt-envelope application
  - rate-limit and invariant failures
  - live lock collision suffixing
  - concurrent same-name reservation behavior
  - shaped updates/results/provenance
- Refreshed package docs and handoff surfaces so the parity proof is explicit instead of living only in the test tree:
  - `packages/pi-autonomous-session-control/README.md`
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-autonomous-session-control/next_session_prompt.md`

## What I deliberately did not do
- I did not cut `pi-society-orchestrator` over yet; that remains AK task `#606`.
- I did not widen `execution.ts` with dashboard/UI concerns or speculative consumer helpers.
- I did not change ASC runtime semantics just to make the parity task feel larger; the proof harness was the missing slice.
- I did not touch the unrelated in-progress changes already present elsewhere in the monorepo worktree.

## Result
- ASC now has an explicit parity harness proving its public execution runtime matches `dispatch_subagent` where equivalence is promised.
- The package docs no longer imply parity as a future intention; they point to a concrete proof anchor.
- The next truthful move is now clear and better constrained:
  - `#606` should cut orchestrator over to `pi-autonomous-session-control/execution`
  - any new seam additions should be justified by that consumer cutover rather than guessed in advance

## Validation
- `cd packages/pi-autonomous-session-control && npm run docs:list`
- `cd packages/pi-autonomous-session-control && node --test tests/public-execution-parity.test.mjs`
- `cd packages/pi-autonomous-session-control && npm run check`
- `npm run quality:pre-commit`
- `npm run quality:pre-push`
- `npm run quality:ci`
- `npm run check`

## Next obvious move
- AK task `#606` — adopt `pi-autonomous-session-control/execution` inside `pi-society-orchestrator`, retire the duplicate runtime path, and keep the migration guarded by the new parity harness.
