---
summary: "Completed the routing-vocabulary decision for pi-society-orchestrator by keeping `full` as the internal team id while presenting it to operators as `all agents` across status surfaces and README guidance."
read_when:
  - "You are resuming after task #942 on routing vocabulary in pi-society-orchestrator."
  - "You need the rationale for the user-facing treatment of the internal `full` team id."
---

# 2026-04-07 — routing vocabulary decision for `full`

## Decision
- Keep `full` as the internal agent-team id for runtime/config compatibility.
- Present that internal id to operators as `all agents` on user-facing status surfaces.

## Why this shape
- `full` is implementation vocabulary, not especially clear operator language.
- `all agents` is explicit about capability/scope without requiring operators to learn the internal enum name.
- Keeping the internal id avoids churn in env/config/runtime contracts such as `PI_ORCH_DEFAULT_AGENT_TEAM=full`.

## Where it landed
- `src/runtime/agent-routing.ts`
  - added the user-facing display-label mapping
- `src/runtime/status-semantics.ts`
  - runtime status formatting now uses `all agents` for operator-visible routing while still surfacing the internal id in the `/runtime-status` report where helpful
- `extensions/society-orchestrator.ts`
  - `/agents-team` selection options now show `all agents`
  - startup/footer routing copy now reads `Routing: all agents`
- `tests/runtime-shared-paths.test.mjs`
  - coverage now locks the `full` -> `all agents` operator-facing contract
- `README.md`
  - runtime/knob docs now explain that `full` remains the internal id but is rendered to operators as `all agents`

## Validation
Passed:
- `cd packages/pi-society-orchestrator && npm run check`
- `cd packages/pi-society-orchestrator && npm run release:check`

## Next slice
- `#943` should extend scenario/release-smoke coverage for the routing/runtime-truth contract now that the vocabulary decision is explicit.
