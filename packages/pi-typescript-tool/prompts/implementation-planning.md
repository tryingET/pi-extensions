---
summary: "pi-typescript-tool implementation planning prompt template."
read_when:
  - "Using or updating the pi-typescript-tool implementation-planning prompt template."
description: Plan a bounded pi-typescript-tool change
system4d:
  container: "Prompt template for implementation planning."
  compass: "Turn requests into actionable, risk-aware plans."
  engine: "Scope -> tasks -> validation -> rollout."
  fog: "Hidden constraints unless assumptions are surfaced."
---

Plan this pi-typescript-tool change: $@

Keep one trusted TypeScript tool with fs.list/read only. Read the package README,
contract and tests. Identify type/runtime consistency, timeout, path, resource and
serialization risks. Propose bounded edits and regression tests, the real package
check command and separately authorized activation evidence. No registry, arbitrary
dispatcher, publication or owner-surface mutation is implied.
