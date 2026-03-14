---
summary: "Migrate pi-prompt-template-accelerator from package-local release-please metadata to the root-owned monorepo component release flow."
read_when:
  - "Moving PTX onto the root release-please/publish automation introduced for the monorepo."
system4d:
  container: "Focused package plan for PTX release automation migration."
  compass: "Use the root monorepo release control plane, keep PTX independently releasable, and remove duplicate local release metadata."
  engine: "Add component metadata -> update package validation/docs -> sync root release config -> verify package + root gates."
  fog: "The main risk is leaving package-local release-please files or validation assumptions behind after the root source of truth changes."
---

# Plan: PTX root component release migration

## Scope
Move `packages/pi-prompt-template-accelerator` onto the root-owned monorepo release-please + publish flow as an independently versioned component.

## Acceptance criteria
- `package.json` declares the component release metadata needed by the root release control plane.
- PTX is included in the root `.release-please-config.json` and `.release-please-manifest.json` through `scripts/release-components.mjs`.
- Package validation no longer requires package-local `.release-please-*` files.
- Package docs point to root-owned workflows/config instead of nonexistent package-local workflow files.
- PTX remains independently releasable.
- `npm run check` passes in PTX and root `npm run quality:pre-push` stays green.

## Planned files
- `package.json`
- `README.md`
- `NEXT_SESSION_PROMPT.md`
- `CHANGELOG.md`
- `scripts/validate-structure.sh`
- `.release-please-config.json` (delete)
- `.release-please-manifest.json` (delete)
- `docs/dev/plans/004-root-component-release-migration.md`
