---
summary: "Trusted publishing notes for monorepo package components."
read_when:
  - "Configuring npm OIDC trusted publishing for monorepo package releases."
  - "Debugging release-please or publish workflow failures in monorepo CI."
system4d:
  container: "Monorepo release automation reliability notes."
  compass: "Use OIDC safely with component-aware release behavior."
  engine: "Configure root workflows -> validate package metadata -> release -> verify."
  fog: "Most failures come from root workflow policy mismatch or component map drift."
---

# Trusted publishing runbook (monorepo package mode)

## Baseline assumptions

- Release automation lives at monorepo root.
- Package release is component-scoped (release-please component mode or equivalent).
- Publish workflow uses npm OIDC trusted publishing (no long-lived npm token in CI).

## Package-level requirements

- `npm run build` must produce deterministic `dist/snapshot-edit.js` bytes before packing; `prepare` and `prepack` enforce this locally and in release automation.
- The packed whitelist is exactly `LICENSE`, `README.md`, `dist/snapshot-edit.js`, `package.json`, and the two declared policy files. Runtime source directories are not published.
- `package.json.repository.url` must point to monorepo git URL.
- `package.json.repository.directory` must match package workspace path.
- `x-pi-template` metadata should align with root component mapping:
  - `workspacePath`
  - `releaseComponent`
  - `releaseConfigMode` (default/root-managed baseline: `component`; `none` is an explicit opt-out only)

## Root workflow expectations

- Root `release-please` workflow must keep component map aligned with package metadata when `releaseConfigMode` is `component`.
- Publish workflow should run npm >= 11.5.1 for trusted publishing compatibility.
- Actions policy + permissions at repo level must allow release/publish workflows.

## Common failure modes

1. Component key drift between package metadata and root release config.
2. Wrong `repository.directory` causing provenance verification failures.
3. Workflow permissions set to read-only in monorepo settings.
4. Missing npm trusted publisher binding for monorepo repository/workflow.

## Verification checklist

- Package passes `npm run release:check:quick` in workspace.
- Full `npm run release:check` installs the exact tarball under isolated `PI_CODING_AGENT_DIR` and `NPM_CONFIG_PREFIX` roots with 0600/0700 temporary state, compares installed bytes, then loads the bundle offline.
- The gated release smoke verifies raw Protocol B occurrence editing, retired line-coordinate rejection, revision clearing, and a changed bundle marker plus matching package behavior after same-process `/reload`. It makes no provider call and does not read or mutate operator settings.
- A source update is followed by `npm run build` and `/reload`; a process restart is neither required nor accepted as a substitute for reload proof.
- Root release workflow can produce/update component release PR.
- Publish workflow completes with `npm publish --provenance --access public` for package.
