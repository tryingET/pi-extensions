---
summary: "Publication is disabled; private artifact checks only."
read_when:
  - "Publication is disabled; private artifact checks only."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# Private artifact policy

This package is unpublished and `private: true`; releaseConfigMode is `none`.
No root release mapping, trusted-publisher binding, token workflow or publish
approval is implied. Do not bootstrap publication or modify the root release map.

The generated release-check script retains its public branch for lineage, but
private mode stops after actual npm pack and provider-free artifact checks. It
never runs npm publish (even dry-run), npm view, Pi install, or a provider session.
Both `npm run release:check` and `npm run release:check:quick` follow that branch.

Publication would require a separate owner decision, license review, root release
integration and verified activation. None are supplied by a passing package gate.
