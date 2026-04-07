---
summary: "Strategic goals for operator-visible runtime truth in pi-society-orchestrator."
read_when:
  - "You need the current package-local strategic direction for operator-visible status semantics."
  - "You are deciding whether runtime-truth work belongs in this package or in a lower-plane owner."
system4d:
  container: "Strategic layer for operator-visible runtime semantics in pi-society-orchestrator."
  compass: "Keep operator-facing status surfaces truthful to the current orchestrator → ASC split while adding compounding runtime truth."
  engine: "Read the current boundary docs -> identify the highest-leverage additive move -> sequence follow-up vocabulary and UX work behind it."
  fog: "The main risk is fixing footer wording locally while leaving runtime truth fragmented across code, docs, and tests."
---

# Strategic goals — pi-society-orchestrator

## Selection basis

Evidence used:

- [README.md](../../README.md)
- [subagent-execution-boundary-map.md](subagent-execution-boundary-map.md)
- [2026-03-10-ui-capability-discovery.md](2026-03-10-ui-capability-discovery.md)
- `../../extensions/society-orchestrator.ts`
- `../../tests/runtime-shared-paths.test.mjs`

Current baseline:

- the stale footer/status copy (`orchestra`, `Team: full`) has already been corrected to `orchestrator→ASC` and `Routing: ...`
- the package now has a shared inspectable runtime-truth surface in `src/runtime/status-semantics.ts`, plus `/runtime-status` as the direct operator-facing inspector
- user-facing routing now presents the internal `full` scope as `all agents`, and both scenario coverage plus installed-package smoke guard that contract
- the footer now uses prioritized slots so compact DB/Vault health badges can appear when width allows without sacrificing the seam/routing contract on narrower widths

## Strategic goal set

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Make operator-visible runtime semantics truthful, inspectable, and compounding | 5 | 5 | 3 | done | The shared runtime-truth surface, direct inspector, docs alignment, and operator-visible footer/startup contract are now landed. |
| 2 | Keep routing vocabulary and footer density coherent as new operator-visible state is added | 4 | 3 | 2 | done | Routing vocabulary, coverage, and footer-density follow-through are now landed; reopen only if future operator-visible state outgrows the current slot budget. |

## Completed strategic goal

### SG1 — Make operator-visible runtime semantics truthful, inspectable, and compounding

Intent:

- give operators a direct way to inspect what the package is actually doing now
- keep footer/startup/docs aligned with the real orchestrator coordination role, ASC execution seam, and routing state
- add a small capability whose value compounds across future UI, docs, tests, and smoke validation

Evidence:

- the package charter and execution-boundary map both say orchestrator is the control plane and ASC owns execution
- the current footer/startup correction proved the terminology gap was real and user-visible
- the shared runtime-truth surface, `/runtime-status`, and the aligned docs/tests/smoke coverage are now landed

## Completed follow-through goal

### SG2 — Keep routing vocabulary and footer density coherent as new operator-visible state is added

Intent:

- resolve the remaining user-facing ambiguity around routing labels such as `full`
- expand scenario/release-smoke validation once the truth surface lands
- let footer density respond to real runtime truth rather than speculative redesign

Completed by:

- `#942` — audited remaining routing vocabulary and made the user-facing `full` -> `all agents` decision explicit
- `#943` — expanded routing/runtime-truth coverage across scenario tests and installed-package smoke
- `#944` — landed a slot-based footer prototype that preserves seam/routing while letting optional DB/Vault health badges appear only when width allows

## Future trigger

- If future operator-visible state no longer fits within the current prioritized slot behavior, open a new follow-up from that evidence rather than re-litigating the already-landed runtime-truth foundation.
