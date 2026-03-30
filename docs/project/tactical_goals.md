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
| 2 | Classify remaining legacy-full package surfaces into truthful target states and routed next candidates | 5 | 4 | 2 | **active** | The root audit still groups eight packages as `legacy-full`, but seven docs are identical boilerplate and one child package doc is distinct; the next root wave is to turn that into explicit target-state truth. |
| 3 | Materialize the first minimal package-local reduction queue from the refreshed classification | 4 | 3 | 3 | next | After classification, create only the smallest routed package wave that truly follows instead of a blanket migration backlog. |

## Active tactical goal

### TG2 — Classify remaining legacy-full package surfaces into truthful target states and routed next candidates

Definition of done:
- root audit distinguishes boilerplate `legacy-full` surfaces from packages with a real local override candidate
- each remaining `legacy-full` package has a provisional target state (`none` or `reduced-form`) and a routed next-owner note recorded at root
- the active root operating slices are explicit in [operating_plan.md](operating_plan.md)
- those slices have authoritative AK coverage

## Completed tactical goal

### TG1 — Publish the initial root-owned reduced-form migration wave and stable bootstrap

Completed by:
- `#595` seed direction docs + stable bootstrap pointers
- `#596` refresh live audit truth
- `#597` lock the root-side migration contract and routing boundaries

## Not active yet

### TG3 — Materialize the first minimal package-local reduction queue from the refreshed classification

This remains next because the repo should first publish per-package target-state truth at the root before creating package-local follow-up beyond the smallest justified set.
