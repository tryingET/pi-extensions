---
summary: "Local compiler, validation and private-artifact overrides."
read_when:
  - "Local compiler, validation and private-artifact overrides."
system4d:
  container: "Private pi-typescript-tool package in pi-extensions."
  compass: "Typed trusted-code execution with explicit limits."
  engine: "Review -> implement -> package checks -> owner activation."
  fog: "In-process vm and typechecking are not security boundaries."
---

# Engineering overrides

The repo root owns engineering policy and the canonical package quality gate.
This generated package retains its full-surface policy/structure contract;
reduced-form migration is not part of this port. Lane: `pi-ts`; engineering-core
pin matches the root's immutable commit recorded in local policy.

## Local deltas

- Node >=22 + npm. TypeScript source loads through Pi/jiti; no build artifact.
- Runtime TypeScript **6.0.3** is required for submitted-code checking/transpiling.
  The structure gate checks the runtime dependency, not a dev-only compiler.
- Template host baseline **0.84.3** is historical scaffold metadata. The root
  `policy/pi-host-compatibility-canary.json` owns the current exact development
  baseline (currently **0.84.3**). Dev validator/tests load it through the root
  `host-contract.mjs` helper; no installed-host or literal development fallback.
  Align `devTestFloor`, declared Pi pins and npm-generated lock together. Host
  peers remain `*`, not universal compatibility proof. typebox is a host peer
  with exact 1.3.7 dev pin. No UI dependency or custom renderer.
- Local tsconfig checks extensions, src and TS tests. Tests use tsx for Node 22
  compatibility rather than relying on experimental/native TS stripping.
- Biome and compiler gates remain enabled. No suppressions or skipped failure tests.
- Package is private, releaseConfigMode none. Inherited public publishConfig is
  inert under private:true and is not publication approval. Both release-check
  modes run real npm pack, allowlist validation and provider-free artifact load;
  private mode bypasses publish probes, registry queries and all Pi installation.
- Artifact smoke uses jiti, unpacked source/contract, and only declared runtime
  TypeScript + host typebox links. It does not prove an npm production install,
  actual Pi host dispatch, live activation or provider behavior.
- Security policy JSON is inherited dependency-review metadata, not an enforced
  runtime permission policy. See README for tested trust/timeout/I/O boundaries.

## Repo loop validation

Use the root Justfile loop surface with
`LOOP_PATHS=packages/pi-typescript-tool` for bounded routing. The package does not
own a separate loop authority. For package-local evidence:

```bash
PI_EXTENSIONS_TMPDIR="$TMPDIR" npm run check
```

The environment override is needed because the root gate otherwise selects its
own scratch root. No package checks install/reload Pi or start model sessions.
