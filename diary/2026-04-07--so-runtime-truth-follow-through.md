---
summary: "Completed the runtime-truth follow-through after task #939 by wiring footer/session-start/routing-selection UI to the shared surface, documenting the contract in the package docs, and revalidating release smoke against the millisecond timeout wording now emitted by ASC."
read_when:
  - "You are resuming after the runtime-truth follow-through for pi-society-orchestrator."
  - "You need to know why task #942 is the next ready slice after the runtime-status landing."
---

# 2026-04-07 — pi-society-orchestrator runtime-truth follow-through

## Queue / scope
- After `#939` landed, `#940` and `#941` became the next ready package-local slices.
- Claimed and completed:
  - `#940` — wire footer/session-start and routing selection UI to the shared runtime-truth surface
  - `#941` — document runtime truth and footer/statusline semantics

## What changed
- `packages/pi-society-orchestrator/extensions/society-orchestrator.ts`
  - introduced a local `buildRuntimeSnapshot(...)` helper that consumes the shared `src/runtime/status-semantics.ts` surface
  - rewired `/runtime-status` to use that helper instead of rebuilding literals inline
  - changed `/agents-team` wording to routing-scope language and made its notification derive from the shared `Routing: ...` label
  - rewired `session_start` and footer rendering to the shared runtime-truth surface
- `packages/pi-society-orchestrator/scripts/release-smoke.mjs`
  - updated installed timeout-smoke expectations to mirror ASC's current timeout-duration formatting (`250ms`, `1.5s`, etc.)
  - updated installed routing-selection wording expectations from `Team:` to `Routing:`
- `packages/pi-society-orchestrator/tests/runtime-shared-paths.test.mjs`
  - added startup discoverability coverage for `/runtime-status`
  - updated routing-selection expectations to the shared `Routing:` language
- `packages/pi-society-orchestrator/README.md`
  - documented `/runtime-status`, the shared runtime-truth surface, and the runtime-status semantics doc
- `packages/pi-society-orchestrator/docs/project/runtime-status-semantics.md`
  - added the explicit human-readable runtime-truth contract
- `packages/pi-society-orchestrator/docs/project/{strategic_goals,tactical_goals,operating_plan}.md`
  - moved the direction docs forward so the next truthful slice is `#942`, not the already-landed truth-surface work

## Validation
Passed:
- `cd packages/pi-society-orchestrator && node --test tests/runtime-shared-paths.test.mjs`
- `cd packages/pi-society-orchestrator && npm run docs:list`
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`

Notes:
- `npm view pi-society-orchestrator version` still returns `404`, which the package release check already treats as expected for a not-yet-published first release.

## Next slice
- `#942` is now the next ready package-local task: audit remaining routing vocabulary and decide the user-facing treatment of `full`.
- `#943` remains blocked by `#942`.
