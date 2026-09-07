---
summary: "Purpose and non-goals of the typed execution tool."
read_when:
  - "Purpose and non-goals of the typed execution tool."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# Foundation

Provide one-call typed local data gathering/transformation for **trusted** code.
Strict compiler feedback catches capability/API mistakes before execution.
Filesystem helpers reduce boilerplate but are not a confinement mechanism.

The deliverable is a private extension, not a language service, sandbox,
script registry or arbitrary dispatcher. Read-only helper scope does not reduce
Node host privileges. See [README](../../README.md) for precise semantics and limits.
Task/direction state belongs to AK at the monorepo root, not this document.
