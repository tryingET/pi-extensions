---
summary: "Logical pi-interaction package group inside the pi-extensions monorepo."
read_when:
  - "Navigating the split package layout for interaction runtime work."
system4d:
  container: "Group-level guide for pi-interaction subpackages."
  compass: "Keep umbrella API stable while evolving internals by responsibility."
  engine: "Work inside subpackages, validate each package, then validate monorepo root lanes."
  fog: "Cross-package import drift can silently break runtime composition."
---

# pi-interaction package group

This directory is a logical package group (single git root, no nested repos):

- `pi-editor-registry/`
- `pi-interaction-kit/`
- `pi-trigger-adapter/`
- `pi-interaction/` (umbrella + extension entrypoint)

## Working contract

- Keep behavior-compatible runtime composition in `pi-interaction/`.
- Re-home code by responsibility into subpackages.
- Use package-surface imports only (no sibling `src/*` internals).
- Validate each package (`npm run check`, `npm run release:check:quick`, `npm audit`).

## Canonical package + release target

The canonical npm package is:

- `@tryinget/pi-interaction` at `pi-interaction/`

The package-group root (`packages/pi-interaction/`) is **not** the release target.
Treat it as a private coordination shell for the split package family.

## Current package-group truth

### Completed

- Split `packages/pi-interaction` into:
  - `pi-editor-registry`
  - `pi-interaction-kit`
  - `pi-trigger-adapter`
  - `pi-interaction` (umbrella)
- Preserved single git-root topology (no nested repos).
- Re-homed trigger broker + picker registration into `pi-trigger-adapter`.
- Re-homed fuzzy ranking/selection primitives into `pi-interaction-kit`.
- Re-homed editor mounting primitives into `pi-editor-registry`.
- Updated umbrella extension entrypoint to compose split package surfaces.
- Added umbrella runtime helpers:
  - `createInteractionRuntime`
  - `getInteractionRuntime`
  - `resetInteractionRuntime`
- Migrated `pi-prompt-template-accelerator` into the monorepo and updated its live-trigger bridge to load pi-interaction surfaces.
- Documented the canonical publish target as `packages/pi-interaction/pi-interaction`, not the package-group root.

### Still active

- Capture durable live interactive coexistence evidence with:
  - `pi-interaction`
  - `pi-prompt-template-accelerator`
  - `pi-vault-client`
- Decide whether to wire the first root-owned component release automation now or keep the documented operator-driven workflow.

## Release workflow

Use:

- [Release workflow](docs/dev/release-workflow.md)
- [Trusted publishing runbook](docs/dev/trusted_publishing.md)
- [Next session prompt](NEXT_SESSION_PROMPT.md)

## Canonical rollout plan

See [Monorepo + L3 template rollout plan](docs/dev/monorepo-rollout-plan.md).
