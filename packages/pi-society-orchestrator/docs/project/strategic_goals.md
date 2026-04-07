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
- the package now also has a shared inspectable runtime-truth surface in `src/runtime/status-semantics.ts`, plus `/runtime-status` as the direct operator-facing inspector
- startup/footer/routing-selection wording and installed-package smoke now derive from that shared surface rather than independent literals
- the next additive move is therefore not a bigger footer redesign; it is the narrower follow-up to refine routing vocabulary and coverage now that the truth surface exists

## Strategic goal set

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Make operator-visible runtime semantics truthful, inspectable, and compounding | 5 | 5 | 3 | **active** | The package now has corrected copy but still lacks a single source of operator-visible runtime truth, so the smartest additive move is ready now. |
| 2 | Keep routing vocabulary and footer density coherent as new operator-visible state is added | 4 | 3 | 2 | next | Once the runtime-truth surface exists, the remaining vocabulary and density questions can be resolved without guessing. |

## Active strategic goal

### SG1 — Make operator-visible runtime semantics truthful, inspectable, and compounding

Intent:

- give operators a direct way to inspect what the package is actually doing now
- keep footer/startup/docs aligned with the real orchestrator coordination role, ASC execution seam, and routing state
- add a small capability whose value compounds across future UI, docs, tests, and smoke validation

Evidence:

- the package charter and execution-boundary map both say orchestrator is the control plane and ASC owns execution
- the current footer/startup correction proved the terminology gap was real and user-visible
- the selected additive move — a shared runtime-truth surface plus `/runtime-status` — is now landed, so the follow-up should stay incremental rather than reopening ownership or redesign questions

## Next strategic goal

### SG2 — Keep routing vocabulary and footer density coherent as new operator-visible state is added

Intent:

- resolve the remaining user-facing ambiguity around routing labels such as `full`
- expand scenario/release-smoke validation once the truth surface lands
- keep future footer density work conditional on real additional state instead of speculative redesign

Why it is not active yet:

- vocabulary and density should be derived from the runtime-truth surface, not designed ahead of it
- the next smallest justified package-local wave is to land the addition first and only then tune the remaining wording/coverage surfaces
