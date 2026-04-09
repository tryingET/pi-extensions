---
summary: "Top strategic goals for the pi-extensions monorepo root selected from current repo truth after the runtime-truth wave and the new contract-first cross-package packet."
read_when:
  - "You need the currently active and next strategic goals for the pi-extensions monorepo root."
  - "AK readiness is empty or noisy and you need to decide whether root work is complete or whether a new routed cross-package wave is now the truthful next bet."
system4d:
  container: "Strategic layer for the pi-extensions monorepo root."
  compass: "Keep only the top two root-level bets active enough to guide tactical decomposition while preserving package-owner boundaries."
  engine: "Read vision + root capability map + recent repo-local tasks + current routed concern -> score candidates -> keep top two."
  fog: "The main risk is letting completed package waves or unrelated exploratory tasks masquerade as the current monorepo-root execution path."
---

# Strategic goals — pi-extensions monorepo root

## Selection basis

Evidence used:

- [vision.md](vision.md)
- [root-capabilities.md](root-capabilities.md)
- [next_session_prompt.md](../../next_session_prompt.md)
- latest repo-local tasks: `task:962`, `task:958`, `task:950`, `task:949`, `task:944`
- current package-local runtime truth:
  - `packages/pi-society-orchestrator/docs/project/strategic_goals.md`
  - `packages/pi-society-orchestrator/docs/project/tactical_goals.md`
  - `packages/pi-autonomous-session-control/docs/design/IMPLEMENTATION_STATUS.md`
  - `packages/pi-vault-client/docs/dev/vault-execution-receipts.md`
- owner-side packet for the current routed concern:
  - [2026-04-09 contract-first wave packet for seam -> KES -> loops](2026-04-09-contract-first-wave-kes-loops-vault-seam.md)

Current repo-local truth:

- the recent `pi-society-orchestrator` runtime-truth wave is complete through `tasks:939-950`
- ASC has continued execution-plane hardening, but higher-order `self` work is not the next truthful root-local move yet
- a root-local exploratory task exists (`task:962`), but explicit operator reprioritization plus the current owner-side packet make the next higher-leverage wave the cross-package seam/KES/loop ordering concern instead
- the active missing fact is no longer package-local runtime-truth wording; it is the truthful cross-package execution order for:
  1. a thin `pi-vault-client` prompt-plane seam,
  2. `pi-society-orchestrator` KES activation,
  3. `pi-society-orchestrator` loop hardening,
  4. only then any higher-order self follow-on

## Eisenhower-3D ranking

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Bind the next cross-package cognition control-plane wave explicitly and keep package-owner boundaries truthful | 5 | 5 | 3 | **active** | The runtime-truth package wave is complete, the current routed concern is now packeted, and the next missing truth is the cross-package execution order and first seam landing rather than more local package polish. |
| 2 | Keep root compatibility/release control-plane contracts truthful as package seams evolve | 4 | 4 | 4 | next | A new prompt-plane seam and later KES/loop follow-through will touch package boundaries that still depend on truthful root validation/release/canary contracts. |

## Active strategic goal

### SG1 — Bind the next cross-package cognition control-plane wave explicitly and keep package-owner boundaries truthful

Intent:
- make one routed cross-package wave explicit at monorepo root without pretending the root owns every package-local implementation detail
- bind the first executable leaf truthfully: thin `pi-vault-client` prompt-plane seam first
- sequence later work clearly: orchestrator KES activation next, loop hardening after that, higher-order self only once lower-plane truth is real

Success signal:
- the root direction chain names one active tactical goal and one active operating wave for the seam-first packet
- authoritative AK task coverage exists for that active operating wave
- root docs stop implying that the reduced-form root-policy batch or unrelated exploratory work is still the current execution path
- package-owner boundaries remain explicit: prompt plane in `pi-vault-client`, coordination/KES/loops in `pi-society-orchestrator`, execution-plane/self follow-on still deferred in ASC

## Next strategic goal

### SG2 — Keep root compatibility/release control-plane contracts truthful as package seams evolve

Intent:
- preserve truthful root validation, canary, release, and review mechanics while the active cross-package wave changes package seams
- make sure new prompt/control-plane contracts do not silently drift away from the root-owned compatibility and release surfaces

Why it is not active right now:
- the immediate missing fact is still the execution order and first seam landing for the routed cross-package wave
- root compatibility/release work is real, but it is a follow-through obligation on top of that active wave rather than the first move itself

## Not current strategic goals

These matter, but they are not the top repo-level bets right now:
- reopening the already-completed runtime-truth footer/status wave as if `tasks:939-950` were still active
- treating `task:962` PufferLib exploration as the current execution anchor just because it is pending
- promoting higher-order ASC self work before the lower prompt/KES/loop planes are bound truthfully
- reviving the previous reduced-form root-policy batch as the current wave without a new smallest justified slice
