---
summary: "Prompt template for reviewing a pi-autoresearch change for security and safety risks."
read_when:
  - "You want a security-focused review of a proposed or implemented pi-autoresearch change."
description: Review a pi-autoresearch change for security concerns
system4d:
  container: "Prompt template for security-focused review."
  compass: "Identify practical safety and integrity risks before the experiment runtime grows broader powers."
  engine: "Threats -> impact -> mitigations -> verification."
  fog: "Runtime automation, shell execution, and git mutation paths are likely future risk multipliers."
---

Review this `pi-autoresearch` change for security concerns: $@

Focus on:
- Input validation and command execution risk
- Scope boundaries and repo safety
- Receipt/log integrity and tamper surfaces
- Dependency and supply-chain risk
- Safe failure modes and operator clarity
