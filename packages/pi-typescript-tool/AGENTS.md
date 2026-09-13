---
summary: "Package-specific maintenance rules for pi-typescript-tool."
read_when:
  - "Package-specific maintenance rules for pi-typescript-tool."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# pi-typescript-tool

This is a monorepo member, not an independent repository. Root task, direction,
owner-boundary and landing policy apply; use plain installed `ak`, never a
package-local wrapper. Direction checks/exports belong to the root; import is
only for intentional legacy migration, not routine validation.

- Read [README](README.md) before changing the contract, runner or helpers.
- Keep the single `typescript` tool limited to trusted execution and fs.list/read.
- Never describe the VM, typecheck or canonical path guard as a sandbox.
- Keep the source contract, tool description, runtime limits and tests aligned.
- Run `PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run check`; the wrapper delegates to
  the root package gate. Full/quick release checks stay private and provider-free.
- Root `policy/pi-host-compatibility-canary.json` owns exact development host pins.
  Local validation consumes it; align declarations, development metadata and npm
  locks together. The template host baseline records scaffold history, not an override.
- Preserve `.copier-answers.yml` unchanged as generated lineage. Update from a
  clean destination using pinned Copier update/recopy and reapply intentional deltas.
- Keep implementation notes in `docs/project/`, adopted decisions in `docs/adr/`.
- Keep `private: true`, `releaseConfigMode: none`; activation and publication need
  separate owner authorization. See [engineering overrides](docs/engineering.local.md).
