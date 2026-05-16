---
summary: "Prompt template for reviewing a change for security risks and mitigations."
read_when:
  - "You are editing or validating pi-better-openai prompt templates."
  - "You need a reusable security-review prompt contract."
description: Review a change for security risks and mitigations
system4d:
  container: "Prompt template for security-focused review."
  compass: "Identify practical vulnerabilities before release."
  engine: "Threats -> impact -> mitigations -> verification."
  fog: "Partial context can hide exploit paths."
---

Review this change for security concerns: $@

Focus on:
- Input validation and injection risk
- Privilege boundaries and secret handling
- Dependency and supply-chain risk
- Safe failure modes and logging
- Concrete remediations with priority
