---
summary: "Contributing and validating a bounded TypeScript-tool change."
read_when:
  - "Contributing and validating a bounded TypeScript-tool change."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# Contributing

Follow root task/landing policy; do not invent a package-local branch or PR workflow.
Read the README and targeted source/tests, implement a bounded change, update the
contract and documentation together, then run:

```bash
PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run fix
PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run check
```

Retain the real gate. Add regression tests for timeout, abort, path, byte-limit and
serialization changes. Potentially hanging tests must run in watchdog-controlled
child processes, never the test host. Scratch belongs under managed TMPDIR.
Preserve template lineage and upstream license notices. No blanket lint suppression.
Activation is a separately authorized owner action, not part of these checks.
