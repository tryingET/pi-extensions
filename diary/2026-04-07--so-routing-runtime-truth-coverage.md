---
summary: "Expanded pi-society-orchestrator routing/runtime-truth coverage so both package tests and installed-package release smoke now assert the shared startup, footer, routing-selection, and /runtime-status contract."
read_when:
  - "You are resuming after task #943 on routing/runtime-truth coverage."
  - "You need to know which scenario checks now guard the shared routing/status contract."
---

# 2026-04-07 — routing/runtime-truth coverage expansion

## Scope
- Completed `#943` after the routing-vocabulary decision in `#942`.
- Goal: extend coverage so the shared runtime-truth contract is asserted in both package-local tests and installed-package smoke.

## What changed
- `tests/runtime-shared-paths.test.mjs`
  - added explicit coverage that `/agents-team` presents the internal `full` team to operators as `all agents`
  - kept startup/footer/runtime-status assertions aligned with the operator-facing `all agents` wording
- `scripts/release-smoke.mjs`
  - now asserts installed-package `session_start` notification wording, footer wiring, and `/runtime-status` report content in addition to the existing guarded-bootstrap / timeout / abort / parse / truncation / team-mismatch smokes

## Validation
Passed:
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`

## Result
- The shared runtime-truth contract is now guarded in both local regression tests and installed-package smoke.
- The current active runtime-truth wave is materially complete; only the unrelated carried work elsewhere in the repo keeps the overall repo worktree non-clean.
