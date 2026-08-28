---
summary: "Operator contract for the root-owned dependency and propagation-aware portfolio release plan."
read_when:
  - "Reviewing a release PR, sequencing multiple package releases, or diagnosing propagation blockers."
---

# Portfolio release plan

`node ./scripts/release-components.mjs plan` is the single read-only authority for release-wave discovery, dependency order, and propagation review. Package release scripts remain artifact-validation leaves and do not decide portfolio order.

## Inputs

Choose exactly one selection mode:

```sh
# Components owning files changed since a commit, plus their reverse-dependent closure
node ./scripts/release-components.mjs plan --base <git-ref> --json

# One or more explicitly selected components, plus their reverse-dependent closure
node ./scripts/release-components.mjs plan \
  --changed pi-vault-client \
  --changed pi-autoresearch \
  --json

# Inventory-wide dependency-first projection
node ./scripts/release-components.mjs plan --all --json
```

Add `--registry` for read-only `npm view` classification. Add `--require-ready` when blockers must produce a non-zero exit. Registry checks are deliberately opt-in locally; CI enables both flags only when the pull request is identified by the same-repository Release Please component branch and `autorelease: pending` label. Ordinary pull requests still validate the graph and run component tests, but are not required to contain release-version advances.

## Contract

The deterministic `pi.portfolio-release-plan.v1` document binds every managed component to:

- unique component id, npm package name, repository path, intended package version, and source commit;
- validated internal runtime edges from `dependencies`, `optionalDependencies`, and `peerDependencies`, including local paths and intended-version range compatibility;
- dependency-first topological order and sorted reverse dependents;
- `changed` versus transitive `propagation` selection;
- Release Please manifest `currentVersion` and optional npm registry state.

A selected component is blocked when its intended version is behind or equal to a non-bootstrap current version. With registry inspection enabled, an already-existing intended version, unavailable registry state, unavailable owner state, or ownership outside the declared `x-pi-release-policy.npmOwner` also blocks readiness. Credential and publication approval remain explicit external gates, with owners and reopen triggers, rather than pretending that a read-only planner can prove those effects. This prevents a changed dependency from being treated as releasable while an unchanged-version consumer silently escapes the wave.

The root `x-pi-release-policy` declares the expected npm owner, GitHub Actions OIDC credential mode, and GitHub Release approval boundary. It contains no credential and grants no publication authority.

`unownedChangedPaths` is evidence, not an implicit portfolio-wide release request. Root control-plane changes do not manufacture package releases.

## Effects boundary

The command reads package metadata, Git history, the Release Please manifest, and optionally npm registry metadata. It does not edit versions or manifests, create release PRs/tags, dispatch workflows, publish packages, or work around repository permission settings.
