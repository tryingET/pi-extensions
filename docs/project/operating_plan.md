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

# Operating plan — TG1 active wave

Active tactical goal:
- [TG1 in tactical_goals.md](tactical_goals.md#tg1--publish-the-next-root-owned-reduced-form-migration-wave-with-live-ak-coverage)

## Operating slices

| Order | AK task | State | Deliverable |
|---|---:|---|---|
| 1 | `#595` | done | Seed root direction decomposition docs and stable bootstrap pointers for the reduced-form policy wave. |
| 2 | `#596` | ready | Refresh the live tech-stack review surface audit after recent package/template alignment and update the canonical root audit note. |
| 3 | `#597` | ready | Define the root-side reduced-form migration contract for the remaining legacy-full package surfaces and record exact routing boundaries. |

## Interpretation

- This file intentionally tracks only the active tactical goal.
- `#596` and `#597` are the next active root-local execution slices.
- Deferred package-boundary tasks `#268` and `#269` remain context, not the current root operating wave.

## HTN

- `G0` — keep the pi-extensions root control plane explicit and executable
  - `SG1` — finish reduced-form root policy centralization
    - `TG1` — publish the next root-owned reduced-form migration wave with live AK coverage
      - `#595` seed direction docs + stable bootstrap pointers
      - `#596` refresh live audit truth
      - `#597` define root-side migration contract and routing boundaries
