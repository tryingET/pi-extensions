---
summary: "Prompt template for drafting an implementation plan for a requested change."
read_when:
  - "You are editing or validating pi-better-openai prompt templates."
  - "You need a reusable implementation-planning prompt contract."
description: Draft an implementation plan for a requested pi-better-openai change
system4d:
  container: "Prompt template for implementation planning."
  compass: "Turn requests into actionable, risk-aware plans."
  engine: "Scope -> tasks -> validation -> rollout."
  fog: "Hidden constraints unless assumptions are surfaced."
---

Create a pi-better-openai implementation plan for this request: $@

Include:
- Scope and non-goals
- Key risks and mitigations
- Step-by-step implementation tasks
- Validation commands and expected outcomes
- Rollout and rollback notes
