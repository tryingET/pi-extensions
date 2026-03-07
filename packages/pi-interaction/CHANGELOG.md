---
summary: "Changelog for the pi-interaction package group migration work."
read_when:
  - "Reviewing split-package rollout progress in monorepo."
system4d:
  container: "Group-level migration changelog."
  compass: "Track topology and package-boundary transitions."
  engine: "Record structural milestones and validation state."
  fog: "Drift risk if group and package changelogs diverge."
---

# Changelog

## [Unreleased]

### Changed

- Converted `packages/pi-interaction` from a single-package layout into a logical package group.
- Added split subpackages:
  - `pi-editor-registry`
  - `pi-interaction-kit`
  - `pi-trigger-adapter`
  - `pi-interaction` (umbrella facade + extension entrypoint)
- Migrated Pilot 2 package (`pi-prompt-template-accelerator`) into the monorepo and updated live-trigger integration to use pi-interaction trigger surfaces.
