---
summary: "Top strategic goals for the pi-extensions monorepo root after the seam-first prompt-plane wave, the first KES packet, and the first TG3 loop-hardening hardening slice landed."
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
- latest repo-local tasks: `task:1110`, `task:1108`, `task:1107`, `task:1091`, `task:1090`
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
- the first bounded KES packet is complete through `tasks:1089`, `1090`, and `1091`, including package checks, installed-package release smoke, and root validation
- the first bounded TG3 hardening slice is also complete through `task:1107` and `task:1108`: invalid package-owned KES roots now fail closed, and installed-package KES proof now asserts writes under the true installed package root while the import harness remains copy-isolated
- repo-local AK task `task:1110` now binds the truthful post-hardening state into an explicit reassessment slice instead of leaving the only durable record in prose while no further TG3 implementation task is ready yet
- ASC higher-order `self` work is still not the next truthful root-local move
- the root-local exploratory task `task:962` remains explicitly deferred so it does not displace the routed control-plane packet

## Eisenhower-3D ranking

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Bind the next cross-package cognition control-plane wave explicitly and keep package-owner boundaries truthful | 5 | 5 | 3 | **active** | The prompt-plane seam, first KES packet, and first TG3 hardening slice are now landed history, and `task:1110` now binds the post-hardening reassessment state truthfully while AK waits for another bounded loop-hardening slice. |
| 2 | Keep root compatibility/release control-plane contracts truthful as package seams evolve | 4 | 4 | 4 | next | The new TG3 hardening slice still depends on root validation and release surfaces staying truthful, especially where installed-package proof is stronger than before but still intentionally bounded. |

## Active strategic goal

### SG1 — Bind the next cross-package cognition control-plane wave explicitly and keep package-owner boundaries truthful

Intent:
- make one routed cross-package wave explicit at monorepo root without pretending the root owns every package-local implementation detail
- preserve the completed prompt-plane seam, KES packet, and first TG3 hardening slice as landed boundary truth rather than reopening them as active backlog
- sequence later work clearly: another loop hardening slice only if AK materializes a bounded task, higher-order ASC self only after lower-plane truth remains solid

Success signal:
- the root direction chain records the seam-first wave, first KES packet, and first TG3 hardening slice as completed history
- authoritative AK task coverage exists for any new root-local follow-through before implementation begins
- root docs stop implying that KES activation or the first TG3 hardening slice are still missing or that unrelated exploratory work is the current execution path
- package-owner boundaries remain explicit: prompt plane in `pi-vault-client`, coordination/KES/loops in `pi-society-orchestrator`, execution-plane/self follow-on still deferred in ASC

## Next strategic goal

### SG2 — Keep root compatibility/release control-plane contracts truthful as package seams evolve

Intent:
- preserve truthful root validation, canary, release, and review mechanics while the routed cross-package packet changes package seams
- make sure new control-plane contracts do not silently drift away from the root-owned compatibility and release surfaces

Why it is not active right now:
- the immediate missing fact is whether TG3 needs another bounded root-local slice at all, not a separate root release packet by itself
- root compatibility/release work is real, but it remains a follow-through obligation on top of routed package work rather than the first move

## Not current strategic goals

These matter, but they are not the top repo-level bets right now:
- reopening the already-completed runtime-truth footer/status wave as if `tasks:939-950` were still active
- replaying the seam-first prompt-plane wave (`tasks:1050`, `1049`, `1051`), the first KES packet (`tasks:1089`, `1090`, `1091`), or the first TG3 hardening slice (`tasks:1107`, `1108`) as if those lower-plane facts were still missing
- treating `task:962` PufferLib exploration as the current execution anchor just because it is pending elsewhere in the backlog
- promoting higher-order ASC self work before a new loop-hardening slice is actually justified and task-backed
