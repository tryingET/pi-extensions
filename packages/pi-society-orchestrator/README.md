---
summary: "Overview and quickstart for the converging pi-society-orchestrator coordination package."
read_when:
  - "Starting work in packages/pi-society-orchestrator."
  - "You need the current control-plane charter for the imported society-orchestrator package."
system4d:
  container: "Monorepo package for the society-orchestrator Pi extension."
  compass: "Keep the imported brownfield extension runnable while converging on clean package boundaries."
  engine: "Understand charter -> inspect imported layout -> run checks -> install/test in Pi."
  fog: "The main risk is letting imported brownfield code imply long-term ownership of lower-plane concerns."
---

# pi-society-orchestrator

Coordination/control-plane orchestration for society workflows in Pi.

## Current charter

The target architecture for this package is:

- `pi-society-orchestrator` owns **coordination intelligence only**
- `ak` owns society-state access
- `rocs-cli` owns ontology access
- `pi-vault-client` owns prompt-vault access and governance
- `pi-autonomous-session-control` owns subagent execution/runtime behavior

This package was scaffolded from [`../pi-extensions-template`](../pi-extensions-template/) and then populated from the existing live extension at:

- `~/.pi/agent/extensions/society-orchestrator/`

That means the package is still carrying some brownfield transition code while it converges toward the layered architecture above.

## Phase A architecture findings

Before any new UI or extraction moves, Phase A capability discovery established that:

- upstream Pi / `pi-mono` already owns generic extension UI primitives such as widgets, footers, overlays, and custom editors
- `pi-interaction` owns interaction-runtime concerns such as editor mounting, trigger brokering, and picker/selection flows
- `pi-vs-claude-code` is best treated as a UX/pattern repo, not a canonical runtime owner
- ASC remains the strongest execution-plane owner for subagent lifecycle/runtime concerns

Primary architecture artifacts:

- [Architecture backlog](docs/dev/plans/2026-03-10-architecture-backlog.md)
- [Phase A UI capability discovery](docs/dev/plans/2026-03-10-ui-capability-discovery.md)
- [ASC public execution contract proposal](docs/dev/plans/2026-03-10-asc-public-execution-contract.md)
- [Control-plane boundaries ADR](docs/decisions/2026-03-10-control-plane-boundaries.md)

## Imported source layout

Imported files were mapped into the package scaffold like this:

- `~/.pi/agent/extensions/society-orchestrator/index.ts`
  -> [extensions/society-orchestrator.ts](extensions/society-orchestrator.ts)
- `~/.pi/agent/extensions/society-orchestrator/loops/engine.ts`
  -> [src/loops/engine.ts](src/loops/engine.ts)
- `~/.pi/agent/extensions/society-orchestrator/chains.yaml`
  -> [src/chains.yaml](src/chains.yaml)
- empty `kes/` directory preserved as [src/kes/](src/kes/)

## Package identity

- package folder: `packages/pi-society-orchestrator`
- npm package name: `pi-society-orchestrator`
- release component: `pi-society-orchestrator`
- primary extension entry: `extensions/society-orchestrator.ts`

The runtime extension surface still uses the existing `society-orchestrator` identity where that avoids unnecessary command/session churn.

## Tool surface

Primary tools and commands exposed by the imported extension include:

- `society_query` (read-only diagnostic SQL only)
- `cognitive_dispatch`
- `evidence_record`
- `ontology_context`
- `loop_execute`
- `/cognitive`
- `/agents-team`
- `/evidence`
- `/ontology <query>`
- `/loops`
- `/loop <type> <objective>`

## Quickstart

Run directly from the package during development:

```bash
pi -e ./extensions/society-orchestrator.ts
```

Or install the package into Pi from its local package path:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator
```

Then in Pi:

1. run `/reload`
2. verify with a real command or tool call from this package

## Package checks

From the package directory:

```bash
npm install
npm run docs:list
npm run check
```

`npm run check` now exercises package-local typechecking and regression tests in addition to lint/structure/package validation.

From the monorepo root:

```bash
bash ./scripts/package-quality-gate.sh ci packages/pi-society-orchestrator
```

## Notes

- The package ships `src/` because the extension entrypoint imports runtime modules from there.
- `session_start` guards UI-only behavior with `ctx.hasUI` so non-UI runs stay safer.
- The package was renamed early to the `pi-society-orchestrator` canonical package identity to avoid later naming churn.
- The current convergence priority is execution-plane/public-contract work and raw adapter migration; prompt-plane seam finalization stays deferred until the upstream `pi-vault-client` execution boundary lands.
