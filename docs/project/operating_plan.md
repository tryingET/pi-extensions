---
summary: "Active operating slices for the single active tactical goal at the pi-extensions monorepo root." 
read_when:
  - "You need the current root operating slices and their AK task bindings."
  - "AK readiness is empty and you need to see whether the next active wave has been materialized yet."
system4d:
  container: "Operating layer for the active root tactical goal."
  compass: "Keep the plan focused on one tactical goal and bind each slice to authoritative AK task truth."
  engine: "Choose active tactical goal -> define 3-5 slices -> bind exact AK task IDs -> keep prose DRY."
  fog: "The main risk is duplicating task bodies here or mixing non-active tactical goals into the same operating queue."
---

# Operating plan — no active new root-local wave materialized yet

Active tactical goal:
- no new root-local tactical wave is currently materialized

## Operating slices

| Order | AK task | State | Deliverable |
|---|---:|---|---|
| 1 | `#654` | deferred | Historical root-side guarded repo bootstrap classifier task; deferred until agent-kernel decision `#8` resolves. |
| 2 | `#655` | deferred | Historical root-side runtime wiring task; deferred until agent-kernel decision `#8` resolves. |
| 3 | `#656` | deferred | Historical root-side verification task; deferred until agent-kernel decision `#8` resolves. |

## Interpretation

- This file intentionally tracks only the active root tactical queue.
- There is currently no newly materialized root-local follow-up wave after the first SG1 queue completed.
- The guarded repo-bootstrap concern surfaced here first, but the durable owner question is now being handled in agent-kernel decision `#8` with linked tasks `#657`–`#660`.
- Until that decision resolves, the local `pi-extensions` tasks `#654`–`#656` are context only, not the active root implementation frontier.

## HTN

- `G0` — keep the pi-extensions root control plane explicit and executable
  - `SG1` — finish reduced-form root policy centralization
    - next tactical move not yet materialized
  - `SG2` — keep root compatibility/release control-plane contracts truthful as package seams evolve
    - guarded repo bootstrap owner question externalized to agent-kernel decision `#8`
