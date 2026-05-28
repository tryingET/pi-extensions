---
summary: "Prompt template for drafting an implementation plan for a requested pi-autoresearch change."
read_when:
  - "You need a scoped implementation plan before changing pi-autoresearch."
description: Draft an implementation plan for a requested pi-autoresearch change
system4d:
  container: "Prompt template for implementation planning."
  compass: "Turn requested package work into an explicit bounded plan."
  engine: "Scope -> tasks -> validation -> rollout."
  fog: "The bounded runtime is intentionally incomplete, so hidden control-plane boundary assumptions are likely."
---

Create an implementation plan for this `pi-autoresearch` request: $@

Include:
- Scope and non-goals
- Boundary checks against Prompt Vault / AK / ontology ownership
- Step-by-step implementation tasks
- Validation commands and expected outcomes
- Rollout and rollback notes
