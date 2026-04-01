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
| 1 | Materialize the next smallest justified package-reduction follow-up wave from the remaining boilerplate-only set | 4 | 3 | 3 | next | No new root-owned wave is materialized yet; refresh the root audit/routing truth before opening another batch. |
| 2 | Guard repo registration so canonical softwareco git roots can bootstrap into AK without registry pollution | 4 | 4 | 4 | deferred-to-agent-kernel | This concern is now owned by the agent-kernel Tier 1 decision packet (`FCOS-M41-01`, `decision #8`, and tasks `#657`, `#665`–`#667`); local `pi-extensions` tasks `#654`–`#656` are deferred until that decision resolves. |

## Current tactical posture

### TG4 — Guard repo registration so canonical softwareco git roots can bootstrap into AK without registry pollution

Status now:
- the root-side execution-memory note remains as historical evidence in [2026-03-31-guarded-repo-auto-registration-execution-memory.md](2026-03-31-guarded-repo-auto-registration-execution-memory.md)
- but the durable owner question has moved to agent-kernel decision `#8`
- local `pi-extensions` tasks `#654`–`#656` are deferred with `until_decision` triggers pointing at decision `#8`
- do not resume a root-local implementation wave for this concern unless that decision explicitly sends work back here

## Previously completed tactical goals

### TG1 — Publish the initial root-owned reduced-form migration wave and stable bootstrap

Completed by:
- `#595` seed direction docs + stable bootstrap pointers
- `#596` refresh live audit truth
- `#597` lock the root-side migration contract and routing boundaries

### TG2 — Classify remaining legacy-full package surfaces into truthful target states and routed next candidates

Completed by:
- `#601` audit remaining `legacy-full` package docs for real local overrides vs boilerplate
- `#602` refresh the root audit with per-package target-state classification and routed next candidates

### TG3 — Materialize the first minimal package-local reduction queue from the refreshed classification

Completed by:
- `#603` publish the minimal routed package-reduction queue and root handoff update
- `#634` simple-package `none` pilot in `packages/pi-activity-strip`
- `#635` monorepo-package `none` pilot in `packages/pi-autonomous-session-control`
- `#636` child-package `reduced-form` pilot in `packages/pi-interaction/pi-interaction`
