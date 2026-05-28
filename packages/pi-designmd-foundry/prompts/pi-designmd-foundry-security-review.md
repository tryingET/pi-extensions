---
summary: "Review a pi-designmd-foundry change for security risks and mitigations"
read_when:
  - "Using or maintaining this package prompt template."
  - "Checking prompt metadata for pi package discovery or docs-list validation."
description: Review a pi-designmd-foundry change for security risks and mitigations
system4d:
  container: "Prompt template for security-focused review."
  compass: "Identify practical vulnerabilities before release."
  engine: "Threats -> impact -> mitigations -> verification."
  fog: "Partial context can hide exploit paths."
---

Review this pi-designmd-foundry change for security concerns: $@

Focus on:
- Input validation and injection risk
- Privilege boundaries and secret handling
- Dependency and supply-chain risk
- Safe failure modes and logging
- Concrete remediations with priority
