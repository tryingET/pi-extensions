---
summary: "Tactical goals for the single active strategic goal at the pi-extensions monorepo root." 
read_when:
  - "You need the medium-sized root waves under the active strategic goal."
  - "You need to know which tactical goal is active now and which are next."
system4d:
  container: "Tactical layer for the active root strategic goal."
  compass: "Decompose only the active strategic goal and keep the wave medium-sized and root-local."
  engine: "Active strategic goal -> 2-5 tactical goals -> choose one active tactical goal."
  fog: "The main risk is decomposing package/template work directly here instead of keeping root work root-local and routed."
---

# Tactical goals — active strategic goal SG1

Active strategic goal:
- [SG1 in strategic_goals.md](strategic_goals.md#sg1--finish-reduced-form-root-policy-centralization-and-make-the-next-root-owned-migration-wave-explicit)

## Tactical goal set

| Rank | Tactical goal | Importance | Urgency | Difficulty | State | Notes |
|---|---|---:|---:|---:|---|---|
| 1 | Publish the initial root-owned reduced-form migration wave and stable bootstrap | 5 | 5 | 2 | done | Completed by `#595`–`#597`; this closed the missing root direction/contract layer. |
| 2 | Classify remaining legacy-full package surfaces into truthful target states and routed next candidates | 5 | 4 | 2 | done | Completed by `#601`–`#602`; the root now records explicit package-level target states instead of only a bucket-level audit signal. |
| 3 | Materialize the first minimal package-local reduction queue from the refreshed classification | 4 | 3 | 3 | **active** | `#603` published the queue and handoff; the active routed package-local pilot wave is now `#634` -> `#635` -> `#636`. |

## Active tactical goal

### TG3 — Materialize the first minimal package-local reduction queue from the refreshed classification

Definition of done:
- root docs publish only the smallest justified routed package-local queue instead of a blanket migration backlog
- that queue covers the three distinct follow-up cases the root classification exposed:
  - one simple-package `none` pilot
  - one monorepo-package `none` pilot
  - the only child-package `reduced-form` pilot
- the active repo-local operating slices are explicit in [operating_plan.md](operating_plan.md)
- those slices have authoritative AK coverage and a stable root handoff pointer

## Completed tactical goals

### TG1 — Publish the initial root-owned reduced-form migration wave and stable bootstrap

Completed by:
- `#595` seed direction docs + stable bootstrap pointers
- `#596` refresh live audit truth
- `#597` lock the root-side migration contract and routing boundaries

### TG2 — Classify remaining legacy-full package surfaces into truthful target states and routed next candidates

Completed by:
- `#601` audit remaining `legacy-full` package docs for real local overrides vs boilerplate
- `#602` refresh the root audit with per-package target-state classification and routed next candidates
