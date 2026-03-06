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

## Priority objective for next session (single huge push)

Execute the interaction-runtime monorepo cutover as **one cohesive delivery** on a dedicated branch,
then push once when the full stack is green.

From:

- **current state**: monorepo has pilot package `packages/pi-interaction` as a single package

To:

- **target state**: logical interaction package group in one git root:
  - `packages/pi-interaction/pi-editor-registry`
  - `packages/pi-interaction/pi-interaction-kit`
  - `packages/pi-interaction/pi-trigger-adapter`
  - `packages/pi-interaction/pi-interaction` (umbrella/facade + extension entrypoint)
- Pilot 2 (`prompt-template-accelerator`) migrated/updated against the new package surfaces.

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

## Immediate execution queue (next session, one huge push)

### 0) Branch + execution contract

- Work in monorepo root only: `~/ai-society/softwareco/owned/pi-extensions`
- Create a dedicated branch (example):
  - `git checkout -b feat/pi-interaction-subpackage-split`
- **No partial remote pushes** until full validation matrix is green.

### 1) Split `pi-interaction` into subpackages (same git repo)

Create/standardize this structure under `packages/pi-interaction/`:

- `pi-editor-registry`
- `pi-interaction-kit`
- `pi-trigger-adapter`
- `pi-interaction` (umbrella)

### 2) Re-home code by responsibility

- Move editor ownership/arbitration primitives to `pi-editor-registry`.
- Move interaction UI/fallback primitives to `pi-interaction-kit`.
- Move trigger broker + picker registration adapter to `pi-trigger-adapter`.
- Keep runtime behavior unchanged while relocating.

### 3) Wire umbrella package

- `@tryinget/pi-interaction` re-exports stable APIs from subpackages.
- Umbrella owns default runtime composition and extension entrypoint.
- Preserve existing user-facing command behavior and fallback semantics.

### 4) Migrate Pilot 2 against new surfaces

- Update `prompt-template-accelerator` integration imports to package surfaces.
- Re-run downstream non-UI smoke and any mixed-extension integration checks.

### 5) Release/governance wiring

- Add/confirm component-scoped release metadata for each split package.
- Ensure monorepo release automation path is ready for package-level publishes.
- Keep publish target as `@tryinget/pi-interaction` (first public npm release).

### 6) Docs and handoff alignment in same branch

- Update rollout plan, ADR notes, status docs, and package READMEs to reflect split state.
- Update NEXT_SESSION_PROMPT artifacts after implementation/verification, not before.

### 7) Validation matrix (must all pass before first push)

- Package-local quality/release checks for each split package.
- Umbrella package checks.
- Cross-extension non-UI integration (including Pilot 2).
- Monorepo root CI lanes (`./scripts/ci/smoke.sh`, `./scripts/ci/full.sh`).

### 8) Single push protocol

- Commit logically (can be multiple local commits).
- Final pre-push sanity pass.
- Push branch once and open one cohesive PR/MR for the full split.

## Invariants to preserve during migration

- No regression in current trigger/selection runtime behavior.
- Stable fallback semantics in non-UI contexts.
- Explicit editor ownership and extension coexistence rules.
- Deterministic release flow (release-please + trusted publishing).
- Single git-root topology only (no nested repos for `pi-interaction` split).
- No partial migration pushes; remote update happens only after full validation.

## Validation snapshot (current baseline)

Current verified baseline before split:
- Standalone contingency repo:
  - `npm run check`
  - `npm run release:check:quick`
  - `npm audit`
- Monorepo pilot package (`packages/pi-interaction`):
  - `npm run check`
  - `npm run release:check:quick`
  - `npm audit`
- Monorepo root:
  - `./scripts/ci/smoke.sh`
  - `./scripts/ci/full.sh`

Required validation after split (before first remote push):
- For each split package under `packages/pi-interaction/*`:
  - `npm run check`
  - `npm run release:check:quick`
  - `npm audit`
- Cross-extension integration (including `prompt-template-accelerator`) passes.
- Monorepo root CI lanes stay green.

## Files to inspect first

| File / Path | Purpose |
|------|---------|
| `docs/dev/monorepo-rollout-plan.md` | Strategic rollout phases and execution checklist |
| `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/README.md` | Current pilot package surface + migration framing |
| `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/extensions/input-triggers.ts` | Current extension entrypoint to decompose |
| `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/src/InteractionHelper.js` | Stable helper surface to split |
| `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/src/interaction-helper/register.js` | Runtime boundary + registration contracts |
| `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/src/interaction-helper/selection.js` | Selection semantics and fallback behavior |
| `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/tests/interaction-helper-boundary.test.mjs` | Boundary regression coverage |
| `~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/tests/extension-entry.test.mjs` | Public surface/import policy guardrails |
| `~/programming/pi-extensions/prompt-template-accelerator/extensions/ptx.ts` | Pilot 2 downstream integration points |

## Quick commands

```bash
# Start split branch (monorepo)
cd ~/ai-society/softwareco/owned/pi-extensions
git checkout -b feat/pi-interaction-subpackage-split

# Validate package(s) while splitting
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run check
npm run release:check:quick
npm audit

# Validate monorepo root lanes before push
cd ~/ai-society/softwareco/owned/pi-extensions
./scripts/ci/smoke.sh
./scripts/ci/full.sh

# Single remote push at end
# git push -u origin feat/pi-interaction-subpackage-split
```
