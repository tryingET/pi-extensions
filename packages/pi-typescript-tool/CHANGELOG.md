---
summary: "Unreleased implementation history of pi-typescript-tool."
read_when:
  - "Unreleased implementation history of pi-typescript-tool."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# Changelog

## Unreleased — 0.1.0 (private)

- Fresh exact-commit Copier generation; selective port of the typed tool spike.
- Strict in-memory gate and single trusted TypeScript tool with fs.list/read.
- Fixed synchronous invocation timeout, parenthesized/trailing-comment inputs,
  stable symlink escapes, pre-abort handling and listener/timer cleanup.
- Added finite reads/list/call/output bounds, helper revocation and serialization
  rejection paths without raw VM values in Pi details.
- Current Pi development pins, runtime compiler lockfile, attribution and private
  artifact validation. Live activation and publication are not performed.

- Review fixes: preserve decorator emit helpers; invoke functions inside type-only
  wrappers without discarding typing; lower default reads to 16,000 bytes so the
  truncation marker fits ordinary direct UTF-8 results.
