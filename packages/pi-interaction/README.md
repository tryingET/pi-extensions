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

## Canonical rollout plan

See [Monorepo + L3 template rollout plan](docs/dev/monorepo-rollout-plan.md).
