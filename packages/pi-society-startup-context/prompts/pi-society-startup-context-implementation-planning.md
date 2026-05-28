---
summary: "Prompt template for drafting implementation plans."
read_when:
  - "Using the package-provided implementation-planning prompt."
description: Draft an implementation plan for a requested pi-society-startup-context change
system4d:
  container: "Prompt template for implementation planning."
  compass: "Turn requests into actionable, risk-aware plans."
  engine: "Scope -> tasks -> validation -> rollout."
  fog: "Hidden constraints unless assumptions are surfaced."
---

Create a pi-society-startup-context implementation plan for this request: $@

Include:
- Scope and non-goals
- Key risks and mitigations
- Step-by-step implementation tasks
- Validation commands and expected outcomes
- Rollout and rollback notes
