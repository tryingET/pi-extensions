---
summary: "Session log for AK task #604: publishing the ASC public execution contract and routing dispatch_subagent through the same shared runtime core."
read_when:
  - "Reconstructing how pi-autonomous-session-control exposed its first supported non-tool execution seam."
  - "Reviewing why AK task #605 follows immediately after #604."
---

# 2026-03-30 — Publish the ASC public execution contract

## What I did
- Claimed AK task `#604` for the `pi-extensions` repo.
- Re-entered the cross-package execution-boundary packet before touching code:
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
  - `packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
- Confirmed the gap was still exactly what the docs said:
  - ASC owned the stronger execution runtime already
  - `dispatch_subagent` lived in ASC
  - orchestrator still had a duplicate runtime path
  - ASC still lacked a supported package-level consumer seam
- Implemented the first public seam in ASC:
  - added `packages/pi-autonomous-session-control/extensions/self/subagent-runtime.ts`
  - added package entrypoint `packages/pi-autonomous-session-control/execution.ts`
  - updated `packages/pi-autonomous-session-control/extensions/self/subagent.ts` so the tool path now delegates through the same shared runtime core
- Updated package metadata and docs so the seam is explicit instead of discoverable only by source reading:
  - `packages/pi-autonomous-session-control/package.json`
  - `packages/pi-autonomous-session-control/README.md`
  - `packages/pi-autonomous-session-control/docs/project/public-execution-contract.md`
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
- Added focused tests for the new public consumer path in:
  - `packages/pi-autonomous-session-control/tests/public-execution-contract.test.mjs`

## What stayed intentionally out of scope
- I did not attempt the parity harness wave yet; that remains AK task `#605`.
- I did not modify orchestrator runtime code; that remains AK task `#606`.
- I did not widen the new seam with dashboard/UI concerns.
- I did not touch unrelated dirty files already present elsewhere in the repo worktree.

## Result
- ASC now exposes a supported package-level execution seam at `pi-autonomous-session-control/execution`.
- Non-tool consumers can create an ASC-owned runtime without private `extensions/self/*` imports.
- `dispatch_subagent` and the public runtime now share one execution core, which sets up the next truthful move:
  - prove parity explicitly
  - then cut orchestrator over

## Validation
- Passed package docs discovery:
  - `cd packages/pi-autonomous-session-control && npm run docs:list`
- Passed package quality gate:
  - `cd packages/pi-autonomous-session-control && npm run check`

## Next obvious move
- AK task `#605` — add the parity harness proving the public runtime matches `dispatch_subagent` behavior where equivalence is promised.
