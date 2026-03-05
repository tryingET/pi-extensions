---
summary: "Session handoff after stabilization, with strategic pivot to interaction-runtime naming + monorepo migration."
read_when:
  - "Starting the next focused development session."
system4d:
  container: "Session handoff artifact."
  compass: "Preserve stability while intentionally evolving package scope and repo topology."
  engine: "Validate baseline -> decide naming/scope -> execute monorepo rollout in phases."
  fog: "Biggest risk is coupling strategic rename/restructure work to release-critical stabilization paths."
---

# Next session prompt for pi-interaction

## Status: Stabilization baseline is green ✅

Core boundary hardening and release-prep gates are passing.

## Strategic pivot approved

The package should evolve from a trigger-centric identity toward a broader
interaction-runtime role (editor registry + interaction primitives + trigger adapter).

In parallel, all current/future extensions should move into a monorepo under:

- `~/ai-society/softwareco/owned/`

using the `tpl-monorepo` baseline, with
`~/programming/pi-extensions/pi-extensions-template_copier/` adapted into an L3 template
(first such template in ai-society).

## What was already completed

- Extension/helper surface alignment and modularization (`src/interaction-helper/*` + stable re-export API).
- Strict TS/JS type gates (`checkJs` enabled for runtime modules).
- TypeBox runtime boundary validation for `registerPickerInteraction`.
- Selection semantics hardening (fallback/no-match/maxOptions behavior).
- Regression coverage for malformed boundaries and import-path policy.
- Release readiness checks (`npm run check`, `npm run release:check:quick`, `npm audit`).
- Phase 3 Pilot 1 scaffold + validation in monorepo package path (`~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction`).
- Pre-publish package rename locked: first public npm release target is `@tryinget/pi-interaction`.
- Canonical monorepo repo created and pushed: `https://github.com/tryingET/pi-extensions`.
- Incorrect standalone repo (`tryingET/pi-interaction`) removed; single-git-root model is now enforced.

## Priority objective for next session

Design and begin executing a safe migration path from:

- **current repo model**: one extension per repo

to:

- **target model**: monorepo + interaction-runtime umbrella architecture.

## Default working location (next session)

Primary execution workspace should be:

- `~/ai-society/softwareco/owned/pi-extensions`

with package work under:

- `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction`

Use this standalone repo as migration control-plane + contingency reference while publish cutover is being finalized.

## Canonical rollout artifact

Use this plan as source of truth:

- [Monorepo + L3 template rollout plan](docs/dev/monorepo-rollout-plan.md)

The rollout plan now explicitly captures:

- umbrella package pattern (`@tryinget/pi-interaction` facade/runtime)
- interaction subpackage split (`pi-editor-registry`, `pi-interaction-kit`, `pi-trigger-adapter`)
- `InteractionRuntime` shape sketch
- target repo topology (`pi-extensions` monorepo with logical `pi-interaction` sub-monorepo group)
- release model options (independent package releases + independent vs lockstep `pi-interaction` group cadence)

## Immediate execution queue (next session)

1. ✅ Finalize naming direction for umbrella package + compatibility policy.
2. ✅ Bootstrap target monorepo from `tpl-monorepo` under `~/ai-society/softwareco/owned/`.
3. ✅ Adapt `pi-extensions-template_copier` into an L3 template aligned to monorepo workflows.
4. ✅ Select migration pilot extensions and define import/release strategy.
5. ✅ Execute Pilot 1 scaffold + local verification for `pi-interaction` in monorepo package mode.
6. Migrate Pilot 2 (`prompt-template-accelerator`) and run cross-extension integration matrix in monorepo context.
7. Wire monorepo-root release automation (release-please/publish) for component-based package releases.
8. Publish first `@tryinget/pi-interaction` release from monorepo after release automation is green.
9. Keep current standalone repo releasable only as contingency until monorepo publishing is confirmed.

## Invariants to preserve during migration

- No regression in current trigger/selection runtime behavior.
- Stable fallback semantics in non-UI contexts.
- Explicit editor ownership and extension coexistence rules.
- Deterministic release flow (release-please + trusted publishing).
- Clear backward-compatibility path for existing imports/consumers.

## Validation snapshot (current baseline)

Current standalone package baseline:
- `npm run lint`
- `npm run typecheck`
- `node --test tests/*.test.mjs`
- `npm run check`
- `npm run release:check:quick`
- `npm audit` (0 vulnerabilities)

Monorepo Pilot 1 package baseline:
- `cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction`
- `npm run check`
- `npm run release:check:quick`
- `npm audit` (0 vulnerabilities)
- `cd ~/ai-society/softwareco/owned/pi-extensions && ./scripts/ci/smoke.sh && ./scripts/ci/full.sh`

## Files to inspect first

| File | Purpose |
|------|---------|
| `docs/dev/monorepo-rollout-plan.md` | Strategic rollout phases and execution checklist |
| `extensions/input-triggers.ts` | Current extension entrypoint surface |
| `src/InteractionHelper.js` | Stable public helper surface |
| `src/interaction-helper/register.js` | Runtime boundary + registration contracts |
| `src/interaction-helper/selection.js` | Selection semantics and fallback behavior |
| `tests/interaction-helper-boundary.test.mjs` | Boundary regression coverage |
| `tests/extension-entry.test.mjs` | Public surface/import policy guardrails |

## Quick commands

```bash
# Standalone contingency verification
npm run check
npm run release:check:quick
npm audit

# Monorepo package verification
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run check
npm run release:check:quick
npm audit

# Monorepo root CI lanes
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/smoke.sh
./scripts/ci/full.sh
```
