---
summary: "Tactical goals for the active operator-visible runtime-truth wave in pi-society-orchestrator."
read_when:
  - "You need the medium-sized work waves under the current runtime-truth strategic goal."
  - "You are deciding which package-local slices are active, next, or intentionally deferred."
system4d:
  container: "Tactical layer for operator-visible runtime truth."
  compass: "Land the additive runtime-truth surface first, then route wording/coverage follow-ups behind it."
  engine: "Active strategic goal -> 2-3 tactical goals -> keep only one active wave."
  fog: "The main risk is reopening broad footer redesign before the shared runtime-truth primitive exists."
---

# Tactical goals — active strategic goal SG1

Active strategic goal:
- [SG1 in strategic_goals.md](strategic_goals.md#sg1--make-operator-visible-runtime-semantics-truthful-inspectable-and-compounding)

## Tactical goal set

| Rank | Tactical goal | Importance | Urgency | Difficulty | State | Notes |
|---|---|---:|---:|---:|---|---|
| 1 | Introduce a shared runtime-truth surface and `/runtime-status` inspector for operator-visible semantics | 5 | 5 | 3 | done | The additive truth surface is now landed: descriptor, inspector, startup/footer wiring, routing-selection wording, docs, and release-smoke expectations all have a shared contract. |
| 2 | Resolve remaining routing vocabulary and coverage after the truth surface lands | 4 | 3 | 2 | **active** | With the truth surface live, the next smallest justified move is to decide remaining user-facing routing vocabulary and expand coverage around it. |
| 3 | Revisit footer density only if new runtime-truth state outgrows the current single-line contract | 3 | 1 | 3 | deferred | Keep this event-driven; do not spend design energy here unless the truth surface later proves the current line is too small. |

## Current tactical posture

### TG2 — Resolve remaining routing vocabulary and coverage after the truth surface lands

Status now:

- `#939`, `#940`, and `#941` have established the shared runtime-truth surface, the `/runtime-status` inspector, the shared routing wording, and the docs/runtime contract
- the package can now make the remaining routing-vocabulary decision from a concrete shared surface instead of inferred scattered literals
- the active wave is therefore the narrower follow-up: decide how user-facing routing vocabulary such as `full` should be treated and expand coverage accordingly

Bound AK tasks:

- `#942` — audit remaining routing vocabulary and decide the user-facing treatment of `full`
- `#943` — expand routing/runtime-truth coverage across scenario tests and release smoke

## Completed tactical posture

### TG1 — Introduce a shared runtime-truth surface and `/runtime-status` inspector for operator-visible semantics

Completed by:

- `#939` — shared runtime-truth descriptor + `/runtime-status` inspector
- `#940` — footer/startup/routing-selection UI rewired to the shared runtime-truth surface
- `#941` — runtime-truth / footer semantics documented in package docs and README

## Deferred tactical posture

### TG3 — Revisit footer density only if new runtime-truth state outgrows the current single-line contract

Bound AK task:

- `#944` — prototype a slot-based footer layout only if additional runtime-truth state makes the current line insufficient

Deferral rule:

- task `#944` is intentionally deferred until a real runtime-truth expansion creates a density problem worth solving
- do not treat the footer itself as the primary architecture artifact; the runtime-truth surface remains primary
