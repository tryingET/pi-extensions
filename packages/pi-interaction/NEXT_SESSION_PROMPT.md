---
summary: "Post-split handoff after runtime package split, Pilot 2 migration, PR push, and rider-license adoption."
read_when:
  - "Starting the next focused pi-interaction monorepo session."
system4d:
  container: "Session handoff artifact."
  compass: "Land first release safely, then finalize L3 template canonization in ai-society."
  engine: "PR finalize -> release wiring/publish -> L3 template integration -> live validation."
  fog: "Main risk is treating local L3 adaptation as fully canonized before copier-lane integration is complete."
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
- Adopted rider-license model (Frankensqlite style) across repo/packages, extended with xAI + PRC frontier labs.
- Branch pushed and PR opened:
  - branch: `feat/pi-interaction-subpackage-split`
  - PR: `https://github.com/tryingET/pi-extensions/pull/1`
- Validation passed for split packages + Pilot 2 + root lanes:
  - `npm run fix`
  - `npm run check`
  - `npm run release:check:quick`
  - `npm audit`
  - `./scripts/ci/smoke.sh`
  - `./scripts/ci/full.sh`

## Important clarification (template state)

- `pi-interaction` was scaffolded from the adapted local L3 source (`pi-extensions-template_copier`).
- But L3 is **not yet fully canonized** into ai-society copier lanes as a formal managed template flow.
- Local template updates (including rider-license propagation) were applied and validated in:
  - `~/programming/pi-extensions/pi-extensions-template_copier`
- Remaining work is integration/canonicalization, not adaptation-from-scratch.

## Priority objective (next session)

Ship first release path for `@tryinget/pi-interaction` and close the template-canonicalization gap.

## Immediate queue

1. **PR merge + release readiness**
   - Final review + merge PR #1 after CI confirmation.
   - Confirm release-please component behavior for split packages.

2. **First publish execution**
   - Keep first public publish target as `@tryinget/pi-interaction`.
   - Run release flow from merged state, verify trusted publishing and artifact contents.

3. **L3 template canonization in ai-society**
   - Commit focused template changes in `pi-extensions-template_copier` (license + metadata + contracts).
   - Integrate/mirror L3 template into canonical ai-society copier location.
   - Update wrappers/docs so new package generation uses canonical location, not ad-hoc local path.

4. **Post-canonization propagation**
   - Recopy/regenerate affected package scaffolds only if needed to remove drift.
   - Keep `.copier-answers.yml` intact and policy-compliant.

5. **Interactive runtime validation**
   - Run live UI checks with `pi-interaction` + `prompt-template-accelerator` loaded together.
   - Verify no regression in trigger/fallback semantics (`$$ /`, command behavior, non-UI parity).

6. **Deferred maintainability trigger**
   - Complexity watch: `pi-interaction/extensions/input-triggers.ts` is ~408 LOC.
   - Refactor split trigger: if file exceeds 500 LOC, or if 2+ new command families are added.

## Quick commands

```bash
# Repo + PR context
cd ~/ai-society/softwareco/owned/pi-extensions
git checkout feat/pi-interaction-subpackage-split
gh pr view 1

# Package group checks
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run fix
npm run check

# Pilot 2 checks
cd ~/ai-society/softwareco/owned/pi-extensions/packages/prompt-template-accelerator
npm run fix
npm run check

# Root lanes
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/smoke.sh
./scripts/ci/full.sh

# L3 template validation (local source)
cd ~/programming/pi-extensions/pi-extensions-template_copier
bash ./scripts/template-guardrails.sh
bash ./scripts/smoke-test-template.sh
SCAFFOLD_MODE=monorepo-package bash ./scripts/smoke-test-template.sh
bash ./scripts/generated-contract-test.sh
SCAFFOLD_MODE=monorepo-package bash ./scripts/generated-contract-test.sh
```
