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

# Operating plan — TG2 active wave

Active tactical goal:
- [TG2 in tactical_goals.md](tactical_goals.md#tg2--classify-remaining-legacy-full-package-surfaces-into-truthful-target-states-and-routed-next-candidates)

## Operating slices

| Order | AK task | State | Deliverable |
|---|---:|---|---|
| 1 | `#601` | done | Audited the eight remaining `legacy-full` package surfaces and separated seven boilerplate copies from the one distinct child-package override candidate. |
| 2 | `#602` | done | Refreshed the root audit and migration contract with per-package target-state classification (`none` vs `reduced-form`) and routed next-candidate notes. |
| 3 | `#603` | ready | Publish the minimal package-reduction queue from the refreshed classification and update stable handoff/diary pointers. |

## Interpretation

- This file intentionally tracks only the active tactical goal.
- `#601` and `#602` are now complete; `#603` is the only remaining TG2 slice and should materialize the smallest truthful package-local queue plus the stable handoff update.
- TG1's initial doc/contract wave (`#595`–`#597`) is complete and no longer needs additional root backlog padding.
- Deferred runtime-registry tasks `#268` and `#269` remain context, not the active root tech-stack wave.

## HTN

- `G0` — keep the pi-extensions root control plane explicit and executable
  - `SG1` — finish reduced-form root policy centralization
    - `TG2` — classify remaining legacy-full package surfaces into truthful target states and routed next candidates
      - `#601` audit remaining legacy-full package docs for real local overrides vs boilerplate
      - `#602` refresh root audit with per-package target-state classification
      - `#603` publish the minimal package-reduction queue and root handoff update
