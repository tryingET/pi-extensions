---
summary: "NEXUS-native additive plan: Edge Contract Kernel for self + dispatch_subagent boundaries."
read_when:
  - "After Failure-Memory Canary Lane is green"
  - "Before consolidating boundary logic in self/dispatch_subagent"
system4d:
  container: "Project-level additive design plan."
  compass: "Add one high-leverage module without destabilizing current behavior."
  engine: "Introduce -> shadow-validate -> incrementally adopt -> lock with canary cards."
  fog: "Overreach risk if migration is attempted as a big-bang refactor."
---

# NEXUS-native Addition Plan

## Status update (2026-03-05)

- Implementation status: **completed for planned slice**.
- Edge Contract Kernel is active in:
  - `dispatch_subagent` execution boundary
  - direction resolver context normalization
  - shared monotonic ID semantics
- Validation status: failure-memory canary lane + `npm run check` passing.

## THE ADDITION
Add an **Edge Contract Kernel (ECK)** module that standardizes input normalization, invariant checks, and result shaping for `self` and `dispatch_subagent` tool boundaries.

## WHY THIS, SPECIFICALLY
- **Smartest:** It directly targets the highest-risk class discovered in deep review: boundary drift (intent routing, lifecycle counters, cleanup semantics, context parsing).
- **Innovative:** It creates a shared executable contract layer for both natural-language and process-boundary tools, not just more tests or ad-hoc guards.
- **Accretive:** Every new guard, normalizer, and invariant becomes reusable across tools and future extensions.
- **Useful:** Immediate reduction in duplicated edge handling and clearer failure semantics.
- **Compelling:** Stakeholders get safer evolution speed: add behavior once in ECK, inherit safety everywhere it is attached.

## PLAN FIT
- **Current anchor point:**
  - `extensions/self/query-resolver.ts` (intent normalization + routing)
  - `extensions/self/subagent.ts` (dispatch lifecycle + boundary failures)
  - `extensions/self/resolvers/*.ts` (context parsing/ID handling)
- **Brownfield compatibility:** Introduce ECK as additive wrappers; migrate call sites incrementally; keep existing paths as fallback until parity is proven.
- **Time-to-first-value:** First payoff after migrating `dispatch_subagent` boundary checks and one `self` resolver domain (direction) in the first implementation slice.

## MINIMUM VIABLE INTRODUCTION
- **First step:** Add `extensions/self/edge-contract-kernel.ts` with three primitives:
  1. `normalizeInput(...)`
  2. `assertInvariants(...)`
  3. `shapeToolResult(...)`
- **Owner:** Maintainer of `self`/`dispatch_subagent` surface.
- **Validation signal:**
  - Existing tests remain green.
  - Failure-memory canary cards stay green.
  - New ECK tests prove deterministic behavior for malformed input and lifecycle edge paths.

## WHY NOT THE NEXT BEST ADDITION
Nearest alternative: "Enable strict TypeScript gate immediately." This is important, but weaker *right now* because the most recent failures were runtime boundary behaviors, not type-only mismatches. ECK plus canary cards addresses the live failure surface first.

---

## Incremental rollout (post-introduction)

- [x] **Scaffold ECK + unit tests** (no behavior changes yet).
- [x] **Adopt ECK in `dispatch_subagent` execute path** for validation and standardized error shaping.
- [x] **Adopt ECK in direction resolver path** for intent/context normalization.
- [x] **Move shared ID semantics into ECK helper facade** (wrapping existing monotonic ID helper).
- [x] **Mark migration complete** with all canary cards and `npm run check` passing.
