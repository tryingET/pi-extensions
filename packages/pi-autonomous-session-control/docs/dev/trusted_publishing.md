---
summary: "Trusted publishing runbook and common failure modes."
read_when:
  - "Configuring npm OIDC trusted publishing for a new repository."
  - "Debugging release-please or publish workflow failures."
system4d:
  container: "Release automation reliability notes."
  compass: "Use OIDC safely with predictable workflow behavior."
  engine: "Configure -> validate -> release -> verify."
  fog: "Provider policy and workflow permission mismatches can fail fast."
---

# Trusted publishing runbook

## Baseline assumptions

- Release tags are `vX.Y.Z`.
- release-please and publish workflows run from GitHub Actions.
- Publish workflow uses npm OIDC trusted publishing (no long-lived npm token in CI).

## Required GitHub settings

- Actions policy must allow used marketplace actions.
- Workflow permissions must be `Read and write`.
- "Allow GitHub Actions to create and approve pull requests" must be enabled.

## Required workflow expectations

- `release-please` workflow should not pass deprecated `command` input.
- `release-please` should use pinned action SHA for reproducibility.
- Publish workflow should avoid lockfile-dependent `setup-node` npm cache assumptions.
- Publish workflow should run npm >= 11.5.1 for trusted publishing compatibility.

## First package publish bootstrap

For a brand-new package name, npm trusted publisher setup is package-scoped.
If package settings are unavailable yet, do one initial token-based publish,
then configure trusted publisher and continue with OIDC-only CI publishes.

## Common failure modes

1. **Workflow startup failure**: Actions policy blocks external actions.
2. **release-please PR creation failure**: workflow permissions are read-only.
3. **Tag mismatch**: release-please component tags differ from publish trigger expectation.
4. **Publish setup failure**: npm cache expects lockfile that is not checked in.
5. **Provenance verification failure (E422)**: `package.json` `repository.url` is missing or does not match the GitHub repository URL in provenance.

## Verification checklist

- `release-please` run succeeds and can open/update release PR.
- Release tag format matches publish trigger (`vX.Y.Z`).
- Publish workflow completes with `npm publish --provenance --access public`.
- No npm token secret is required in CI after trusted publisher is active.
