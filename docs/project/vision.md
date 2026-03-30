---
summary: "Vision for the pi-extensions monorepo root as the control plane for shared extension policy, validation, release, and compatibility work." 
read_when:
  - "You need the stable destination and non-goals for the pi-extensions monorepo root."
  - "You are deciding whether a concern belongs at root or inside a package/template repo."
system4d:
  container: "Root direction document for the pi-extensions monorepo."
  compass: "Keep root ownership explicit, minimal, and durable while package code stays package-local."
  engine: "State destination -> define owned planes -> define non-goals -> guide decomposition."
  fog: "The main risk is treating the monorepo root like a package repo and letting policy/orchestration drift into duplicated local scaffolds."
---

# Vision — pi-extensions monorepo root

## Destination

`pi-extensions` root should be the durable control plane for the monorepo:

- shared validation orchestration
- shared release/governance/review mechanics
- shared compatibility policy against the Pi host
- clear placement/routing rules for package and template work

The root should make those shared concerns explicit **without** turning into a second owner of package-local code, tests, or release contracts.

## Root-owned success state

The root is healthy when all are true:

1. shared policy lives once at root and is discoverable
2. package and template outputs inherit only the minimum local surface they actually need
3. active root-level work is represented in AK instead of living only in prose
4. root session bootstrap points operators at live task truth, latest diary context, and current orientation docs
5. package-local implementation work remains package-local

## Root non-goals

The root should not become:

- a catch-all package implementation repo
- a second planning authority that competes with AK
- a place where package-local policy is copied by habit
- a place where cross-package runtime concerns are tracked vaguely without routed owners

## Current pressure shaping the next wave

Current repo truth says the next high-value root concern is to finish the **reduced-form root-policy direction**:

- root keeps the shared `tech-stack-core` policy/validation stance
- package/template outputs shrink toward smaller local override surfaces
- root docs and AK need to represent that active wave explicitly

## Strategic selection rule

When choosing the next major bets from this vision:

- prefer work that clarifies or hardens root-owned control-plane truth
- prefer routed, explicit ownership over duplicated convenience surfaces
- treat deferred package-boundary work as context, not as permission to leave root direction implicit
