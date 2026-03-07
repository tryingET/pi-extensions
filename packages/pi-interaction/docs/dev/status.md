---
summary: "Current development status for the pi-interaction package group."
read_when:
  - "Starting work in this package group."
system4d:
  container: "Status tracker for split-package interaction runtime delivery."
  compass: "Keep runtime behavior stable while evolving package boundaries."
  engine: "Track completed migration steps, validation, and remaining rollout items."
  fog: "Cross-package drift if status is not updated after structural changes."
---

# Status

## Completed ✓

### Package topology
- [x] Split `packages/pi-interaction` into:
  - `pi-editor-registry`
  - `pi-interaction-kit`
  - `pi-trigger-adapter`
  - `pi-interaction` (umbrella)
- [x] Preserved single git-root topology (no nested repos).

### Runtime migration
- [x] Re-homed trigger broker + picker registration into `pi-trigger-adapter`.
- [x] Re-homed fuzzy ranking/selection primitives into `pi-interaction-kit`.
- [x] Re-homed editor mounting primitives into `pi-editor-registry`.
- [x] Updated umbrella extension entrypoint to compose split package surfaces.
- [x] Added umbrella runtime helpers (`createInteractionRuntime`, `getInteractionRuntime`, `resetInteractionRuntime`).

### Pilot 2
- [x] Migrated `pi-prompt-template-accelerator` into monorepo (`packages/pi-prompt-template-accelerator`).
- [x] Updated PTX live-trigger bridge to load pi-interaction trigger surfaces (`@tryinget/pi-trigger-adapter` fallback `@tryinget/pi-interaction`).
- [x] Revalidated downstream non-UI smoke path after migration.

### Validation evidence
- [x] `pi-editor-registry`: `npm run fix`, `npm run check`, `npm run release:check:quick`, `npm audit`
- [x] `pi-interaction-kit`: `npm run fix`, `npm run check`, `npm run release:check:quick`, `npm audit`
- [x] `pi-trigger-adapter`: `npm run fix`, `npm run check`, `npm run release:check:quick`, `npm audit`
- [x] `pi-interaction` (umbrella): `npm run fix`, `npm run check`, `npm run release:check:quick`, `npm audit`
- [x] `pi-prompt-template-accelerator`: `npm run fix`, `npm run check`, `npm run release:check:quick`, `npm audit`
- [x] Monorepo root: `./scripts/ci/smoke.sh`, `./scripts/ci/full.sh`

## In Progress

- [ ] Component-scoped release automation wiring in monorepo root (release-please component orchestration).

## Future Work

- [ ] Live UI coexistence check with full extension stack in interactive session.
- [ ] Optional workspace-level npm tooling (`workspaces`) for tighter multi-package install flow.
