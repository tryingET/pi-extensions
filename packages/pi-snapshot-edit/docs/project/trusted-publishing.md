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

## First public release bootstrap

This package starts from an unpublished `0.1.0` release-please floor. Follow the established activity-strip/context-packer bootstrap pattern:

1. Merge the release-ready feature history without manufacturing a published `0.1.0` release.
2. Let release-please generate the first public `0.2.0` release PR, then review its version and changelog before merging it.
3. Let the normal release and OIDC publish workflow attempt to publish the immutable `0.2.0` release artifact.
4. Only if OIDC fails because the npm package does not exist yet, manually publish that exact already-produced `0.2.0` artifact with authenticated npm credentials. Do not rebuild, retag, or substitute an artifact.
5. After the package exists, configure npm trusted publishing for the repository workflow and use OIDC for subsequent releases.

### Failed-run artifact bootstrap fallback

The publish job uploads the checked tarball and its SHA-256 sidecar before attempting OIDC publish. For the one-time first-package bootstrap, replace `RUN_ID` below with the failed publish workflow run ID:

```bash
mkdir -p /tmp/pi-snapshot-edit-bootstrap
cd /tmp/pi-snapshot-edit-bootstrap
gh run download RUN_ID \
  --repo tryingET/pi-extensions \
  --name npm-pi-snapshot-edit-0.2.0 \
  --dir .
sha256sum --check tryinget-pi-snapshot-edit-0.2.0.tgz.sha256
```

Inspect the checksum result and authenticate with an npm account authorized to create `@tryinget/pi-snapshot-edit`. Then publish the downloaded, verified path directly:

```bash
npm whoami --registry https://registry.npmjs.org/
npm publish "$PWD/tryinget-pi-snapshot-edit-0.2.0.tgz" \
  --registry https://registry.npmjs.org/ \
  --access public \
  --tag latest
```

Manual bootstrap credentials come from the operator's authenticated npm configuration; never place a token in the repository or command history. Do **not** run `npm pack`, rebuild from the tag, rename/substitute the tarball, or publish when SHA verification fails. A missing or expired failed-run artifact requires rerunning the unchanged release workflow to produce a newly checked artifact, not a local rebuild.

The package retains its current restricted custom license. Keep the prominent README disclosure and `SEE LICENSE IN LICENSE` package metadata; this bootstrap does not authorize changing license terms.

## Common failure modes

1. Component key drift between package metadata and root release config.
2. Wrong `repository.directory` causing provenance verification failures.
3. Workflow permissions set to read-only in monorepo settings.
4. Missing npm trusted publisher binding for monorepo repository/workflow.

## Verification checklist

- Package passes `npm run release:check:quick` in workspace.
- Root release workflow can produce/update component release PR.
- Publish workflow completes with `npm publish --provenance --access public` for package.
