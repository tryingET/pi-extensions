---
summary: "Completed pi-society-orchestrator task #949 by moving footer slot fitting into shared runtime semantics, preserving routing on narrow widths, and refreshing footer Vault health after startup drift."
read_when:
  - "You are resuming after AK task #949 on pi-society-orchestrator footer repair."
  - "You need the exact implementation/validation summary for the footer routing-priority and health-refresh repair."
---

# 2026-04-07 — pi-society-orchestrator footer repair (task #949)

## Scope
- Claimed `#949` after the adversarial review identified two real issues in the slot-based footer rollout:
  - narrow-width renders could sacrifice routing visibility by keeping the seam too long
  - footer Vault health could stay stale after startup failure while `/runtime-status` recovered live truth
- Package: `packages/pi-society-orchestrator`
- Goal: implement the NEXUS correction rather than reopen broader runtime-truth architecture work.

## What changed
- `packages/pi-society-orchestrator/src/runtime/status-semantics.ts`
  - moved footer slot construction and fitting into shared runtime helpers
  - made the fitting policy explicit: drop optional badges first, then model, then seam, before sacrificing routing visibility
- `packages/pi-society-orchestrator/extensions/society-orchestrator.ts`
  - switched footer rendering to the shared slot-fitting helper instead of a local one-off layout algorithm
  - resolved Vault dir dynamically for runtime calls made after extension load
  - added cached footer health state with rerender-triggered refresh so footer Vault badges can recover after startup drift
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
  - extended footer assertions to cover a narrower width where routing must remain visible even after the seam drops
  - added a temp-Dolt regression test proving the footer recovers from a startup Vault failure after the Vault becomes available
- `packages/pi-society-orchestrator/scripts/release-smoke.mjs`
  - expanded installed-package smoke so narrow footer rendering is validated in addition to the wide contract
- docs/handoff refresh
  - updated `README.md`, `docs/project/runtime-status-semantics.md`, and `next_session_prompt.md`

## Validation
Passed:
- `cd packages/pi-society-orchestrator && npm run docs:list`
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`

## Result
- Narrow widths now preserve routing before the seam.
- Footer Vault health is no longer frozen at startup; rerenders can converge it back toward `/runtime-status` truth after startup drift.
- The repair stayed bounded to the runtime-status/footer surface and did not reopen unrelated package architecture work.
