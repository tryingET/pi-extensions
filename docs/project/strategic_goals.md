---
summary: "Top strategic goals for the pi-extensions monorepo root after the seam-first prompt-plane wave and the first KES proof packet landed."
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
- latest repo-local tasks: `task:1091`, `task:1090`, `task:1089`, `task:1051`, `task:962`
- current package-local runtime truth:
  - `packages/pi-society-orchestrator/docs/project/strategic_goals.md`
  - `packages/pi-society-orchestrator/docs/project/tactical_goals.md`
  - `packages/pi-autonomous-session-control/docs/design/IMPLEMENTATION_STATUS.md`
  - `packages/pi-vault-client/docs/dev/vault-execution-receipts.md`
- owner-side packet for the current routed concern:
  - [2026-04-09 contract-first wave packet for seam -> KES -> loops](2026-04-09-contract-first-wave-kes-loops-vault-seam.md)

Current repo-local truth:

- the recent `pi-society-orchestrator` runtime-truth wave is complete through `tasks:939-950`
- the seam-first prompt-plane wave is complete through `tasks:1050`, `1051`, and orchestrator cutover task `1049`
- the first bounded KES packet is now complete through `tasks:1089`, `1090`, and `1091`, including package checks, installed-package release smoke, and root validation
- ASC higher-order `self` work is still not the next truthful root-local move
- the root-local exploratory task `task:962` remains explicitly deferred so it does not displace the routed control-plane packet
- repo-local AK readiness is currently empty, so the next truthful move is to reassess whether TG3 loop hardening deserves a bounded root-local slice rather than synthesizing work from stale wave prose

## Eisenhower-3D ranking

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Bind the next cross-package cognition control-plane wave explicitly and keep package-owner boundaries truthful | 5 | 5 | 3 | **active** | The prompt-plane seam and first KES proof packet are now landed history; the next truthful move is to reassess loop hardening from AK without reopening completed lower-plane work. |
| 2 | Keep root compatibility/release control-plane contracts truthful as package seams evolve | 4 | 4 | 4 | next | The new KES proof packet depends on root validation staying truthful, and any later loop hardening still rides on those release/control-plane surfaces. |

## Active strategic goal

### SG1 — Bind the next cross-package cognition control-plane wave explicitly and keep package-owner boundaries truthful

Intent:
- make one routed cross-package wave explicit at monorepo root without pretending the root owns every package-local implementation detail
- preserve the completed prompt-plane seam and first KES proof packet as landed boundary truth rather than reopening them as active backlog
- sequence later work clearly: loop hardening only if AK materializes a bounded slice, higher-order ASC self only after lower-plane truth remains solid

Success signal:
- the root direction chain records the seam-first wave and first KES proof packet as completed history
- authoritative AK task coverage exists for any new root-local follow-through before implementation begins
- root docs stop implying that KES activation is still missing or that unrelated exploratory work is the current execution path
- package-owner boundaries remain explicit: prompt plane in `pi-vault-client`, coordination/KES/loops in `pi-society-orchestrator`, execution-plane/self follow-on still deferred in ASC

## Next strategic goal

### SG2 — Keep root compatibility/release control-plane contracts truthful as package seams evolve

Intent:
- preserve truthful root validation, canary, release, and review mechanics while the routed cross-package packet changes package seams
- make sure new control-plane contracts do not silently drift away from the root-owned compatibility and release surfaces

Why it is not active right now:
- the immediate missing fact is whether TG3 loop hardening needs a new bounded root-local slice at all, not a separate root release packet by itself
- root compatibility/release work is real, but it remains a follow-through obligation on top of routed package work rather than the first move

## Not current strategic goals

These matter, but they are not the top repo-level bets right now:
- reopening the already-completed runtime-truth footer/status wave as if `tasks:939-950` were still active
- replaying the seam-first prompt-plane wave (`tasks:1050`, `1049`, `1051`) or the first KES packet (`tasks:1089`, `1090`, `1091`) as if those lower-plane facts were still missing
- treating `task:962` PufferLib exploration as the current execution anchor just because it is pending elsewhere in the backlog
- promoting higher-order ASC self work before a new loop-hardening slice is actually justified and task-backed
