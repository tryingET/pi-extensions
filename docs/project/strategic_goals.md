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
- latest repo-local tasks: `#597`, `#596`, `#595`, `#590`, `#269`

Deferred but not active-root drivers:

- `#268` and `#269` remain real repo-local concerns, but both are explicitly deferred runtime-registry/package-boundary decisions rather than the next active root control-plane wave.

## Eisenhower-3D ranking

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Finish reduced-form root policy centralization and make the next root-owned migration wave explicit | 5 | 4 | 3 | **active** | The initial root doc/contract wave landed, but the repo still lacks per-package target-state classification and the minimal routed follow-up queue. |
| 2 | Keep root compatibility/release control-plane contracts truthful as package seams evolve | 5 | 3 | 4 | next | Root owns the canary/release/governance surface, but the most immediate unfinished root work is still the remaining SG1 classification/routing wave. |

## Active strategic goal

### SG1 — Finish reduced-form root policy centralization and make the next root-owned migration wave explicit

Intent:
- keep the shared policy/validation stance at root
- shrink package/template-local surfaces to the minimum truthful form
- move from the initial doc/contract wave to an explicit classification of which remaining legacy-full package surfaces should end in `none` vs `reduced-form`

Evidence:
- `#595`–`#597` completed the initial root documentation/contract wave, so SG1 is no longer missing its direction chain
- `tech-stack-review-surfaces.md` still shows eight packages in the `legacy-full` bucket, and the current doc-pattern audit shows that seven of those local docs are identical boilerplate while `packages/pi-interaction/pi-interaction` is the only distinct child-package override candidate
- template and package follow-up need routed owners, but root still owns the policy stance and the audit/routing surface that decides what should be handed off next

## Next strategic goal

### SG2 — Keep root compatibility/release control-plane contracts truthful as package seams evolve

Intent:
- preserve a truthful monorepo-root contract for canary coverage, release orchestration, and governance/review surfaces
- prevent package evolution from silently invalidating root-owned compatibility/release assumptions

Not active yet because:
- SG1 still has unfinished root-owned decomposition: the root audit has not yet published per-package target-state classification or the minimal routed package follow-up queue
- AK only just regained ready coverage for that still-active SG1 wave via `#601`–`#603`
