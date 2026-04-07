---
summary: "Tactical goals for the completed operator-visible runtime-truth wave in pi-society-orchestrator."
read_when:
  - "You need the medium-sized work waves under the current runtime-truth strategic goal."
  - "You are deciding which package-local slices are active, next, or intentionally deferred."
system4d:
  container: "Tactical layer for operator-visible runtime truth."
  compass: "Land the additive runtime-truth surface first, then route wording/coverage follow-ups behind it."
  engine: "Active strategic goal -> 2-3 tactical goals -> keep only one active wave."
  fog: "The main risk is reopening broad footer redesign before the shared runtime-truth primitive exists."
---

# Tactical goals — runtime-truth wave completed

Active strategic goal:
- no active runtime-truth tactical wave is currently materialized; the SG1/SG2 follow-through is complete

## Tactical goal set

| Rank | Tactical goal | Importance | Urgency | Difficulty | State | Notes |
|---|---|---:|---:|---:|---|---|
| 1 | Introduce a shared runtime-truth surface and `/runtime-status` inspector for operator-visible semantics | 5 | 5 | 3 | done | The additive truth surface is landed: descriptor, inspector, startup/footer wiring, routing-selection wording, docs, and release-smoke expectations all share one contract. |
| 2 | Resolve remaining routing vocabulary and coverage after the truth surface lands | 4 | 3 | 2 | done | The internal `full` team is now presented as `all agents`, and scenario plus installed-package coverage both guard that wording. |
| 3 | Revisit footer density only if new runtime-truth state outgrows the current single-line contract | 3 | 1 | 3 | done | The footer now has a slot-based prototype: optional DB/Vault health badges appear only when width allows and drop before seam/routing on compact widths. |

## Current tactical posture

- No active runtime-truth tactical wave is open right now.
- Any future footer-density or runtime-status follow-up should be driven by new operator-visible state, not by reopening the already-landed routing/coverage foundation.

## Completed tactical posture

### TG1 — Introduce a shared runtime-truth surface and `/runtime-status` inspector for operator-visible semantics

Completed by:

- `#939` — shared runtime-truth descriptor + `/runtime-status` inspector
- `#940` — footer/startup/routing-selection UI rewired to the shared runtime-truth surface
- `#941` — runtime-truth / footer semantics documented in package docs and README

### TG2 — Resolve remaining routing vocabulary and coverage after the truth surface lands

Completed by:

- `#942` — audited remaining routing vocabulary and decided the user-facing treatment of `full`
- `#943` — expanded routing/runtime-truth coverage across scenario tests and release smoke

### TG3 — Revisit footer density only if new runtime-truth state outgrows the current single-line contract

Completed by:

- `#944` — landed a slot-based footer layout that treats seam/routing as primary and only surfaces compact DB/Vault health badges when width allows

## Guardrail

- Do **not** treat the footer itself as the primary architecture artifact; the shared runtime-truth surface remains primary.
- If a future runtime-truth expansion still exceeds the current slot budget, materialize a new follow-up from that evidence instead of reviving speculative redesign work.
