---
summary: "pi-agent-vent security review prompt template."
read_when:
  - "Using or updating the monorepo package security-review prompt template."
description: Review a pi-agent-vent change for security risks and mitigations
system4d:
  container: "Prompt template for security-focused review."
  compass: "Identify practical vulnerabilities before release."
  engine: "Threats -> impact -> mitigations -> verification."
  fog: "Partial context can hide exploit paths."
---

Review this pi-agent-vent change for security concerns: $@

Focus on:
- Input validation and injection risk
- Privilege boundaries and secret handling
- Dependency and supply-chain risk
- Safe failure modes and logging
- Concrete remediations with priority
