---
summary: "Session log for AK task #606: cutting pi-society-orchestrator over to ASC's public execution runtime, retiring the duplicate spawn path, and preserving release-safe installed-package validation."
read_when:
  - "Reconstructing how orchestrator adopted the ASC public execution seam after #604 and #605."
  - "Reviewing why the remaining execution-seam work is now packaging/runtime hygiene instead of ownership debate."
---

# 2026-03-30 — Cut orchestrator over to the ASC public runtime

## What I did
- Claimed AK task `#606` for the `pi-extensions` repo.
- Re-entered the cross-package execution-boundary packet before changing runtime code:
  - `packages/pi-society-orchestrator/next_session_prompt.md`
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-rfc-asc-public-execution-contract.md`
  - `packages/pi-autonomous-session-control/next_session_prompt.md`
- Replaced orchestrator's local duplicate subagent spawn/runtime implementation with a consumer-side adapter over `pi-autonomous-session-control/execution` in:
  - `packages/pi-society-orchestrator/src/runtime/subagent.ts`
- Cut both orchestrator call sites over to the shared ASC seam:
  - `packages/pi-society-orchestrator/extensions/society-orchestrator.ts`
  - `packages/pi-society-orchestrator/src/loops/engine.ts`
- Removed the old orchestrator-side spawn-path test coverage and replaced it with a narrower consumer-side proof that orchestrator now drives the ASC public runtime without private imports:
  - `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
- Preserved orchestrator-local timeout/output policy around the public seam so installed-package timeout + truncation smoke stays truthful:
  - `PI_ORCH_SUBAGENT_TIMEOUT_MS`
  - `PI_ORCH_SUBAGENT_OUTPUT_CHARS`
- Added a temporary bundled publish/install bridge for `pi-autonomous-session-control` so the orchestrator tarball remains installable before a longer-term registry/dependency story exists:
  - `packages/pi-society-orchestrator/package.json`
  - `packages/pi-society-orchestrator/package-lock.json`
  - `packages/pi-society-orchestrator/scripts/release-check.sh`
  - `packages/pi-society-orchestrator/scripts/release-smoke.mjs`
- Refreshed the package docs/handoff surfaces so the execution-wave state is truthful after the cutover:
  - `packages/pi-society-orchestrator/README.md`
  - `packages/pi-society-orchestrator/next_session_prompt.md`
  - `packages/pi-society-orchestrator/docs/project/subagent-execution-boundary-map.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-architecture-convergence-backlog.md`
  - `packages/pi-society-orchestrator/docs/project/2026-03-10-rfc-asc-public-execution-contract.md`

## What stayed intentionally out of scope
- I did not reopen ownership of the execution plane; ASC remains the runtime owner.
- I did not widen the ASC public seam with speculative new convenience APIs.
- I did not remove the remaining `recordEvidence(...)` SQL fallback or the bounded `society_query` exception.
- I did not touch the unrelated in-progress changes already present elsewhere in the repo worktree.

## Result
- Orchestrator now consumes ASC's supported public execution seam instead of maintaining a second spawn/runtime path.
- The original `#604 -> #605 -> #606` execution packet is complete.
- The remaining execution-seam debt is narrower and more honest:
  - the temporary bundled ASC publish/install bridge
  - eventual long-term release/dependency strategy for that seam

## Validation
- `cd packages/pi-society-orchestrator && npm run docs:list`
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`

## Next obvious move
- Resume the broader architecture-convergence backlog (`society_query`, evidence fallback, prompt-plane boundary) unless the operator explicitly wants to tighten the temporary bundled ASC publish/install bridge next.
