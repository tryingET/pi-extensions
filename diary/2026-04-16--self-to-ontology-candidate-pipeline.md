---
summary: "Session diary for designing a controlled self-to-ontology candidate pipeline after the question of self-driven ontology extension was raised."
read_when:
  - "Reviewing the concrete design work behind the self-to-ontology candidate pipeline proposal."
  - "Looking for the reasoning that led to candidate-only staging instead of direct self-to-ontology mutation."
system4d:
  container: "Repo-root diary capture for a cross-package semantic-governance design slice."
  compass: "Preserve a path for ontology to evolve from repeated real semantic pressure without collapsing self memory into ontology authority."
  engine: "Inspect current self/KES/ontology seams -> define candidate memory and artifact staging -> define proposal runtime and promotion gate."
  fog: "The main risk is designing a seductive but unsafe self-to-ontology shortcut that would create semantic churn faster than governance can absorb it."
---

# Session diary — self to ontology candidate pipeline

## Goal
Turn the high-level recommendation into a concrete design for:

- what `self` should consume
- how candidate-only semantic pressure should be staged
- how `pi-ontology-workflows` should evaluate proposals
- how promotion to ontology should stay explicit and controlled

## AK context
- task: `#1408` — `Design self-to-ontology candidate pipeline`

## Inputs used
- `packages/pi-autonomous-session-control/extensions/self/query-resolver.ts`
- `packages/pi-autonomous-session-control/extensions/self/resolvers/crystallization.ts`
- `packages/pi-autonomous-session-control/extensions/self/resolvers/protection.ts`
- `packages/pi-autonomous-session-control/extensions/self/memory.ts`
- `packages/pi-autonomous-session-control/extensions/self/memory-lifecycle.ts`
- `packages/pi-autonomous-session-control/extensions/self/types.ts`
- `packages/pi-society-orchestrator/docs/project/2026-04-10-kes-crystallization-contract.md`
- `packages/pi-society-orchestrator/src/kes/types.ts`
- `packages/pi-society-orchestrator/tests/kes-contract.test.mjs`
- `packages/pi-ontology-workflows/src/core/contracts.ts`
- `packages/pi-ontology-workflows/src/core/change.ts`

## Main conclusion
The right design is:

- **not** `self -> ontology_change apply`
- **yes** `self -> candidate-only semantic memory -> candidate artifact -> ontology proposal runtime -> explicit review -> ontology_change apply`

## Why
### Self today
`self` already has the right shape for:
- crystallization
- protection
- persisted scoped memory

### KES today
KES already has the right shape for:
- candidate-only durable staging
- explicit non-authority promotion boundaries

### Ontology-workflows today
`pi-ontology-workflows` already has the right shape for:
- search
- pack
- plan/apply ontology mutations

What is missing is the middle seam:
- a candidate/proposal layer between memory and ontology authority

## Exact design choices recorded
1. Add candidate-only semantic memory, ideally as a distinct `ontology_candidate` memory type instead of overloading generic patterns.
2. Stage candidate artifacts in a repo-local candidate root such as `docs/learnings/ontology-candidates/`.
3. Expose a plan-only proposal runtime from `pi-ontology-workflows` rather than direct apply from self.
4. Keep promotion explicit and review-backed.
5. Feed rejected proposals back into protection memory so the system stops rediscovering bad ontology ideas.

## Output written
- `docs/project/self-to-ontology-candidate-pipeline.md`

## Recommended next implementation order
1. add proposal/check runtime to `pi-ontology-workflows`
2. define candidate artifact writer contract
3. extend `self` with ontology-candidate memory and query intents
4. wire explicit review -> plan -> apply promotion
