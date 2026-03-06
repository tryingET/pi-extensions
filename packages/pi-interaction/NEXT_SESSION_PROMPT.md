---
summary: "Post-split handoff after interaction-runtime package group migration and Pilot 2 monorepo move."
read_when:
  - "Starting the next focused pi-interaction monorepo session."
system4d:
  container: "Session handoff artifact."
  compass: "Stabilize release automation after successful package split + Pilot 2 migration."
  engine: "Release wiring -> UI coexistence validation -> governance/docs polish."
  fog: "Main risk is release automation drift across split components."
---

# Next session prompt — pi-interaction package group

## Status snapshot ✅

Completed in this session:

- Split package topology under `packages/pi-interaction/`:
  - `pi-editor-registry`
  - `pi-interaction-kit`
  - `pi-trigger-adapter`
  - `pi-interaction` (umbrella)
- Re-homed runtime code by responsibility and preserved extension behavior.
- Migrated `prompt-template-accelerator` into monorepo (`packages/prompt-template-accelerator`).
- Updated PTX live-trigger bridge to load `@tryinget/pi-trigger-adapter` (fallback `@tryinget/pi-interaction`).
- Validation passed for all split packages + Pilot 2:
  - `npm run fix`
  - `npm run check`
  - `npm run release:check:quick`
  - `npm audit`
- Monorepo root lanes green:
  - `./scripts/ci/smoke.sh`
  - `./scripts/ci/full.sh`

## Priority objective (next session)

Finalize release/governance wiring for split components and perform live UI coexistence validation.

## Immediate queue

1. **Repo bootstrap guard (only if missing)**
   - Canonical GitHub repo must be `tryingET/pi-extensions` (not a split standalone repo).
   - Verify first:
     - `git remote get-url origin`
     - `gh repo view tryingET/pi-extensions`
   - If repo/remote is missing, create it from monorepo root:
     - `gh repo create tryingET/pi-extensions --public --source=. --remote=origin`
   - Then continue with branch push + release flow.

2. **Release automation wiring**
   - Add/confirm component-aware release-please configuration for:
     - `pi-editor-registry`
     - `pi-interaction-kit`
     - `pi-trigger-adapter`
     - `pi-interaction`
     - `prompt-template-accelerator`
   - Ensure publish path remains deterministic for first `@tryinget/pi-interaction` release.

3. **Interactive runtime validation**
   - Run live UI checks with `pi-interaction` + `prompt-template-accelerator` loaded together.
   - Verify no regression in trigger/fallback semantics (`$$ /`, command behavior, non-UI parity).

4. **Governance/docs alignment**
   - Normalize package READMEs and release notes for split-package discoverability.
   - Add explicit compatibility notes for downstream import strategy.

5. **Deferred maintainability trigger**
   - Complexity watch: `pi-interaction/extensions/input-triggers.ts` is currently ~408 LOC.
   - Trigger for refactor split under `pi-interaction/src/`:
     - if file exceeds 500 LOC, or
     - if two new command families are added in one cycle.
   - Follow-up task: extract command registration + example-trigger registration into dedicated modules.

## Quick commands

```bash
# Package-level checks
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction
npm run check
npm run release:check:quick
npm audit

# Pilot 2 smoke
cd ~/ai-society/softwareco/owned/pi-extensions/packages/prompt-template-accelerator
npm run test:smoke:non-ui

# Monorepo root lanes
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/smoke.sh
./scripts/ci/full.sh

# GitHub repo guard (only if missing)
git remote get-url origin
gh repo view tryingET/pi-extensions
# If missing:
# gh repo create tryingET/pi-extensions --public --source=. --remote=origin
```
