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
- latest repo-local tasks: `#603`, `#602`, `#601`, `#590`, `#269`

Deferred but not active-root drivers:

- `#268` and `#269` remain real repo-local concerns, but both are explicitly deferred runtime-registry/package-boundary decisions rather than the next active root control-plane wave.

## Eisenhower-3D ranking

| Rank | Strategic goal | Importance | Urgency | Difficulty | State | Why now |
|---|---|---:|---:|---:|---|---|
| 1 | Finish reduced-form root policy centralization and make the next root-owned migration wave explicit | 5 | 4 | 3 | **active** | The root audit/classification wave is now published, and the repo has a minimal routed package-local queue; the remaining SG1 work is to let that smallest justified queue run before opening a broader migration backlog. |
| 2 | Keep root compatibility/release control-plane contracts truthful as package seams evolve | 5 | 3 | 4 | next | Root owns the canary/release/governance surface, but the most immediate unfinished work is still the newly published SG1 package-reduction pilot queue. |

## Active strategic goal

### SG1 — Finish reduced-form root policy centralization and make the next root-owned migration wave explicit

Intent:
- keep the shared policy/validation stance at root
- shrink package/template-local surfaces to the minimum truthful form
- move from the initial doc/contract wave through explicit classification into the smallest representative package-local reduction queue

Evidence:
- `#595`–`#597` completed the initial root documentation/contract wave, so SG1 is no longer missing its direction chain
- `#601` and `#602` turned the remaining `legacy-full` bucket into explicit target-state truth: seven boilerplate-only `none` candidates and one distinct `reduced-form` candidate
- `#603` published the first minimal routed package-local queue so the repo can prove the reduction path on only three representative slices: one simple-package `none` pilot, one monorepo-package `none` pilot, and the only `reduced-form` child-package case

## Next strategic goal

### SG2 — Keep root compatibility/release control-plane contracts truthful as package seams evolve

Intent:
- preserve a truthful monorepo-root contract for canary coverage, release orchestration, and governance/review surfaces
- prevent package evolution from silently invalidating root-owned compatibility/release assumptions

Not active yet because:
- SG1 still has the first published package-local reduction queue in flight via `#634`–`#636`
- the repo should let that smallest justified migration wave land before switching root attention to a new strategic concern
