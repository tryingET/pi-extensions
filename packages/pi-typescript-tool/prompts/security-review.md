---
summary: "pi-typescript-tool security review prompt template."
read_when:
  - "Using or updating the pi-typescript-tool security-review prompt template."
description: Review pi-typescript-tool trust and failure boundaries
system4d:
  container: "Prompt template for security-focused review."
  compass: "Identify practical vulnerabilities before release."
  engine: "Threats -> impact -> mitigations -> verification."
  fog: "Partial context can hide exploit paths."
---

Review this pi-typescript-tool change: $@

Treat vm and typechecking as correctness aids, never a sandbox. Inspect host
function access, sync versus post-await timeouts, pre-abort/listener cleanup,
canonical paths and symlink races, finite I/O budgets, result serialization and
raw data leakage through details/errors. Check runtime dependencies and notices.
Report concrete defects and tests; distinguish artifact evidence from live Pi proof.
