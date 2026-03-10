---
summary: "Trusted publishing notes for the monorepo-hosted @tryinget/pi-interaction package."
read_when:
  - "Configuring npm OIDC trusted publishing for @tryinget/pi-interaction."
  - "Debugging release/publish failures for the monorepo package path."
system4d:
  container: "Monorepo package trusted-publishing runbook."
  compass: "Keep provenance and package metadata aligned with the canonical umbrella package path."
  engine: "Confirm package metadata -> confirm repo settings -> validate package/root gates -> publish safely."
  fog: "Most failures come from path drift, permissions drift, or confusing the package-group root with the publish target."
---

# Trusted publishing runbook (monorepo package mode)

## Baseline assumptions

- The canonical npm package is `@tryinget/pi-interaction`.
- The canonical package directory is `packages/pi-interaction/pi-interaction`.
- The package-group root is **not** the publish target.
- Monorepo release orchestration at root is still being finalized.
- The current safe path is documented in [release-workflow.md](release-workflow.md).

## Package-level requirements

In `packages/pi-interaction/pi-interaction/package.json`:

- `repository.url` must point to the monorepo git URL
- `repository.directory` must equal `packages/pi-interaction/pi-interaction`
- `x-pi-template.releaseComponent` must equal `pi-interaction`
- `x-pi-template.releaseConfigMode` should stay `component`

## GitHub / npm expectations

- GitHub Actions policy must allow the workflows/actions used for release/publish.
- Repository workflow permissions must allow release automation to write when enabled.
- npm trusted publisher binding must target the monorepo repository/workflow pair.
- npm provenance must resolve back to the monorepo repository metadata.

## First publish bootstrap

For a new package name, trusted publishing can require a package-level bootstrap step.
If npm does not yet expose trusted publisher controls for `@tryinget/pi-interaction`:

1. perform one intentional bootstrap publish
2. configure the trusted publisher for the monorepo repo/workflow
3. return to OIDC-only publishing

## Common failure modes

1. `repository.directory` points at `packages/pi-interaction` instead of `packages/pi-interaction/pi-interaction`.
2. Root/package docs drift and operators try to publish the package-group root.
3. GitHub workflow permissions are read-only when release automation expects write.
4. npm trusted publisher binding is attached to the wrong repo or workflow.
5. Provenance verification fails because monorepo repository metadata and published package metadata diverge.

## Verification checklist

- `packages/pi-interaction/pi-interaction` passes `npm run release:check:quick`
- package group/root validation passes per [release-workflow.md](release-workflow.md)
- live `pi-interaction` + PTX validation passed
- publish target is the umbrella package path, not the group root
