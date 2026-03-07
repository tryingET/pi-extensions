---
summary: "Canonical monorepo-root handoff for pi-extensions."
read_when:
  - "Starting the next session at the pi-extensions monorepo root."
system4d:
  container: "Session handoff artifact."
  compass: "Keep root responsibilities explicit and package work aligned with the canonical monorepo control plane."
  engine: "Validate root -> route to package/template work -> keep docs/release paths coherent."
  fog: "Main risk is mixing root concerns with package concerns or reviving legacy standalone assumptions."
---

# Next session prompt — pi-extensions monorepo root

## Continue here

- Monorepo root: `~/ai-society/softwareco/owned/pi-extensions`

## Current truth

- This repo is the canonical monorepo control plane for pi extensions.
- Root validation is coherent and verified through the canonical wrapper:
  - `npm run quality:pre-commit`
  - `npm run quality:pre-push`
  - `npm run quality:ci`
  - `npm run check`
- Canonical root quality-gate wrapper lives in:
  - `./scripts/quality-gate.sh`
- Full root validation lives in:
  - `./scripts/ci/full.sh`
- Canonical package validation implementation lives in:
  - `./scripts/package-quality-gate.sh`
- Package checks are orchestrated by:
  - `./scripts/ci/packages.sh`
- Package-local quality gates now delegate to the root-owned implementation instead of owning full private copies.
- Monorepo package template output in `~/ai-society/softwareco/owned/pi-extensions-template/` now references the root-owned package gate model.
- Root/package ownership is documented in:
  - `docs/project/root-capabilities.md`

## Completed in the last session

- Restored the missing root `scripts/quality-gate.sh` wrapper.
- Implemented the root-owned `scripts/package-quality-gate.sh` contract.
- Rewired root `package.json` validation scripts to use the root wrapper.
- Rewired `scripts/ci/packages.sh` to orchestrate top-level packages through the root-owned package gate.
- Converted monorepo package quality-gate scripts into thin wrappers where applicable.
- Updated root docs/handoff files so root validation truth points at the new canonical wrappers.
- Updated `pi-extensions-template` monorepo-package quality-gate wrapper to search upward for the monorepo root gate instead of carrying a full private copy.
- Updated ADR/spec/template docs to reflect the implemented root-gate model and the current structure-validation nuance.
- Updated monorepo package template README guidance so root-level validation uses `bash ./scripts/package-quality-gate.sh ci <workspace>` instead of npm workspace assumptions.
- Verified explicitly:
  - `bash ./scripts/package-quality-gate.sh ci packages/pi-autonomous-session-control`
  - `bash ./scripts/package-quality-gate.sh ci packages/pi-interaction --mode package-group`
  - `bash ./scripts/package-quality-gate.sh ci packages/pi-prompt-template-accelerator`
  - `bash ./scripts/package-quality-gate.sh ci packages/pi-vault-client`
  - `bash ./scripts/quality-gate.sh pre-push`

## Continue with

1. Keep root docs/review/validation surfaces consistent and DRY now that the root-owned package gate is canonical.
2. Prepare monorepo-safe release/workflow decisions without copying standalone assumptions blindly.
3. Continue aligning any remaining generated docs/contracts in `~/ai-society/softwareco/owned/pi-extensions-template/` with the implemented root-gate model.
4. Route package-specific work to the relevant package `NEXT_SESSION_PROMPT.md`.
5. Route template-specific work to `~/ai-society/softwareco/owned/pi-extensions-template/NEXT_SESSION_PROMPT.md`.

## Must-pass checks

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-commit
npm run quality:pre-push
npm run quality:ci
npm run check
```
