---
summary: "pi-agent-vent implementation planning prompt template."
read_when:
  - "Using or updating the monorepo package implementation-planning prompt template."
description: Draft an implementation plan for a requested pi-agent-vent change
system4d:
  container: "Prompt template for implementation planning."
  compass: "Turn requests into actionable, risk-aware plans."
  engine: "Scope -> tasks -> validation -> rollout."
  fog: "Hidden constraints unless assumptions are surfaced."
---

Create a pi-agent-vent implementation plan for this request: $@

Include:
- Scope and non-goals
- Key risks and mitigations
- Step-by-step implementation tasks
- Validation commands and expected outcomes
- Rollout and rollback notes
