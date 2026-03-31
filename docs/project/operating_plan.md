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

# Operating plan — TG3 active wave

Active tactical goal:
- [TG3 in tactical_goals.md](tactical_goals.md#tg3--materialize-the-first-minimal-package-local-reduction-queue-from-the-refreshed-classification)

## Operating slices

| Order | AK task | State | Deliverable |
|---|---:|---|---|
| 1 | `#603` | done | Published the minimal routed package-reduction queue and refreshed the stable root handoff/diary pointers. |
| 2 | `#634` | ready | Prove the generic simple-package `none` reduction path in `packages/pi-activity-strip` by removing both local tech-stack surfaces and refreshing the root audit afterward. |
| 3 | `#635` | pending on `#634` | Extend the proven `none` reduction path to the monorepo-package root at `packages/pi-autonomous-session-control`. |
| 4 | `#636` | pending on `#635` | Convert `packages/pi-interaction/pi-interaction` to truthful `reduced-form` by removing only `policy/stack-lane.json` while preserving the child-package doc override. |

## Interpretation

- This file intentionally tracks only the active tactical goal.
- `#603` completed the root-owned queue-publication slice; `#634` is now the only ready repo-local pilot slice in the reduced-form migration wave.
- The queue is intentionally minimal: one simple-package `none` pilot, one monorepo-package `none` pilot, and the only `reduced-form` child-package case.
- Deferred runtime-registry tasks `#268` and `#269` remain context, not the active root tech-stack wave.

## HTN

- `G0` — keep the pi-extensions root control plane explicit and executable
  - `SG1` — finish reduced-form root policy centralization
    - `TG3` — materialize the first minimal package-local reduction queue from the refreshed classification
      - `#603` publish the minimal package-reduction queue and root handoff update
      - `#634` simple-package `none` pilot in `packages/pi-activity-strip`
      - `#635` monorepo-package `none` pilot in `packages/pi-autonomous-session-control`
      - `#636` child-package `reduced-form` pilot in `packages/pi-interaction/pi-interaction`
