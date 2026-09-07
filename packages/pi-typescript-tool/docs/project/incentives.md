---
summary: "Correctness outcomes prioritized by this port."
read_when:
  - "Correctness outcomes prioritized by this port."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# Quality priorities

- Useful compiler diagnostics before execution.
- Explicit, finite helper and output bounds instead of silent data loss.
- Real regression evidence for failure paths and honest descriptions of limits.
- Reproducible current-template lineage without modifying unrelated packages.
- No false sandbox, release or live-activation claims.
