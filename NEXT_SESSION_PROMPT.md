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
- Root validation is coherent and verified:
  - `npm run quality:pre-commit`
  - `npm run quality:pre-push`
  - `npm run quality:ci`
  - `npm run check`
- Full root validation lives in:
  - `./scripts/ci/full.sh`
- Package checks are discovered by:
  - `./scripts/ci/packages.sh`
- Root/package ownership is documented in:
  - `docs/project/root-capabilities.md`

## Continue with

1. Keep root docs/review/validation surfaces consistent and DRY.
2. Prepare monorepo-safe release/workflow decisions without copying standalone assumptions blindly.
3. Route package-specific work to `packages/pi-interaction/NEXT_SESSION_PROMPT.md`.
4. Route template-specific work to `~/ai-society/softwareco/owned/pi-extensions-template/NEXT_SESSION_PROMPT.md`.

## Must-pass checks

```bash
cd ~/ai-society/softwareco/owned/pi-extensions
npm run quality:pre-commit
npm run quality:pre-push
npm run quality:ci
npm run check
```
