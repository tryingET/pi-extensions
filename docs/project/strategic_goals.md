---
summary: "Top strategic goals for the pi-extensions monorepo root selected from current repo truth with Eisenhower-3D scoring." 
read_when:
  - "You need the currently active and next strategic goals for the pi-extensions monorepo root."
  - "AK readiness is empty and you need to decide whether root work is actually complete or merely undecomposed."
system4d:
  container: "Strategic layer for the pi-extensions monorepo root."
  compass: "Keep only the top two root-level bets active enough to guide tactical decomposition."
  engine: "Read vision + repo reality + last local tasks -> score candidates -> keep top two."
  fog: "The main risk is mixing package work, deferred package-boundary work, and true root control-plane work into one vague backlog."
---

# Strategic goals — pi-extensions monorepo root

## Selection basis

Evidence used:

- [vision.md](vision.md)
- [root-capabilities.md](root-capabilities.md)
- [tech-stack-review-surfaces.md](tech-stack-review-surfaces.md)
- [pi-host-compatibility-canary.md](pi-host-compatibility-canary.md)
- [next_session_prompt.md](../../next_session_prompt.md)
- latest repo-local tasks: `#590`, `#269`, `#268`, `#243`, `#242`

Deferred but not active-root drivers:

- `#268` and `#269` are real repo-local concerns, but both are explicitly deferred package-boundary decisions rather than the next active root wave.

## Eisenhower-3D ranking

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Finish reduced-form root policy centralization and make the next root-owned migration wave explicit | 5 | 4 | 3 | **active** | Root docs already say this is the current truth, but the direction-to-execution chain was still mostly implicit. |
| 2 | Keep root compatibility/release control-plane contracts truthful as package seams evolve | 5 | 3 | 4 | next | Root owns the canary/release/governance surface, but the most immediate unfinished root work is still the reduced-form policy wave. |

## Active strategic goal

### SG1 — Finish reduced-form root policy centralization and make the next root-owned migration wave explicit

Intent:
- keep the shared policy/validation stance at root
- shrink package/template-local surfaces to the minimum truthful form
- make the active root wave explicit in tactical goals, operating slices, AK, diary, and bootstrap docs

Evidence:
- `next_session_prompt.md` already points at reduced-form policy centralization as the current root concern
- `tech-stack-review-surfaces.md` shows multiple packages still on legacy-full local surfaces
- template and package follow-up need routed owners, but root still owns the policy stance and routing rules

## Next strategic goal

### SG2 — Keep root compatibility/release control-plane contracts truthful as package seams evolve

Intent:
- preserve a truthful monorepo-root contract for canary coverage, release orchestration, and governance/review surfaces
- prevent package evolution from silently invalidating root-owned compatibility/release assumptions

Not active yet because:
- SG1 still had no explicit tactical/operating decomposition despite being named as the current truth
- AK had no ready root-local tasks covering that active wave
