---
summary: "pi-vault-client now consumes real pi-interaction support packages through local package seams, with release-safe manifest rewrite + bundled tarball staging preserving clean installs until those support packages are published independently; the next truthful slice is to retire that temporary bundling path once publication/live evidence is in place."
read_when:
  - "Starting the next focused session in packages/pi-vault-client."
  - "Deciding whether the next slice belongs here or in packages/pi-interaction."
system4d:
  container: "Canonical post-de-vendor handoff for the current pi-vault-client runtime + packaging state."
  compass: "Preserve the repaired release/install path, avoid reintroducing source vendoring, and keep package-boundary ownership explicit."
  engine: "Reacquire current truth -> verify whether the next blocker is publication/live evidence or vault runtime behavior -> keep release/install safety intact -> only then simplify the remaining packaging bridge."
  fog: "Main risks are resuming from stale vendoring narratives, confusing package boundaries with service/API boundaries, or breaking release safety while trying to retire the temporary bundled-dependency staging path too early."
---

# Next session prompt for `pi-vault-client`

## One-line handoff

`pi-vault-client` is now **release-safe and functionally repaired** for Prompt Vault schema v9, with generated installable runtime entrypoints, scoped Dolt commits, fail-closed visibility-sensitive tool reads, `/route` sharing the same preparation boundary as `/vault`, and **real package-boundary consumption** of the shared `pi-interaction` helpers. The remaining temporary bridge is no longer source vendoring; it is **release-time bundled dependency staging** so tarball installs stay green until the shared support packages are published independently.

## Current package truth

### What is now true
- Prompt Vault schema compatibility is **v9 only**.
- Schema diagnostics are first-class:
  - `checkSchemaCompatibilityDetailed()` in the runtime
  - `vault_schema_diagnostics()` on the tool surface
  - `/vault-check` in the interactive TUI
- On schema mismatch:
  - the extension stays loaded in diagnostic mode
  - `/vault-check` and `vault_schema_diagnostics()` remain available
  - vault query/mutation/live-trigger surfaces stay gated
- Visibility-sensitive tool reads now fail closed without explicit company context.
- Cross-company `visibility_company` overrides are rejected on the tool surface.
- `/route`, `/vault`, live `/vault:`, and grounding now share the same preparation boundary.
- Execution / feedback / template writes commit only their scoped Dolt tables.
- There is **no** repo-wide `session_shutdown` auto-commit anymore.
- Installable runtime entrypoints are generated as `.js` artifacts for package loading in Pi.
- Shared interaction helpers are consumed through package dependencies:
  - `@tryinget/pi-interaction-kit`
  - `@tryinget/pi-trigger-adapter`
- The old generated vendored bridge has been removed from the active code path.

### Current packaging bridge contract
Do **not** hand-edit generated runtime artifacts unless you are intentionally changing the generation flow:

- generated runtime artifacts:
  - `extensions/vault.js`
  - `src/*.js` generated from package TS entrypoints

Current release/install flow:
- local monorepo development uses `file:` dependencies on the canonical `packages/pi-interaction/` support packages
- `prepack` rewrites those local specs to versioned package dependencies in the packed manifest
- `prepack` also stages bundled runtime copies of those support packages so:
  - clean-room tarball install stays green
  - `pi install` tarball smoke stays green
  - installed-package extension registration smoke stays green
- `postpack` restores the local workspace dependency links after packing
- `npm run build:runtime`
  - regenerates installable runtime `.js` entrypoints

## Verified evidence

### Verified in-package evidence
From `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`:

```bash
npm run check
npm run release:check
npm run docs:list
```

All passed after the de-vendor + release-staging work.

### What `release:check` now proves
- `npm pack --dry-run --json`
- static runtime dependency audit for bare imports
- packed-manifest rewrite from local `file:` specs to versioned package dependencies
- bundled dependency staging in packed artifacts
- clean-room tarball install
- `pi install` tarball registration check
- installed-package extension registration smoke

## Architectural truth

### Correct high-level boundary
The correct long-term move is **package boundaries**, not service/API boundaries, for the interaction runtime layer.

That means the intended architecture is:
- `@tryinget/pi-interaction-kit`
- `@tryinget/pi-trigger-adapter`
- `@tryinget/pi-editor-registry`
- `@tryinget/pi-interaction`

as same-process runtime/library packages.

### Current temporary bridge
The remaining bridge is **not source vendoring anymore**.
It is the release-time bundling/staging needed because `pi-vault-client` must stay install-safe before the shared interaction support packages are fully published and consumable as normal external npm dependencies.

Current evidence:
- `npm view @tryinget/pi-interaction-kit version --json --registry https://registry.npmjs.org/` -> 404
- `npm view @tryinget/pi-trigger-adapter version --json --registry https://registry.npmjs.org/` -> 404
- `npm view @tryinget/pi-editor-registry version --json --registry https://registry.npmjs.org/` -> 404

That bridge is acceptable short-term because it is:
- script-driven
- fed from canonical package-group code
- release-verified
- explicitly documented as temporary packaging glue, not the end state

See:
- `../pi-interaction/docs/dev/package-boundary-architecture.md`

## What is **not** the current problem here

Do **not** resume from these stale assumptions unless new evidence forces it:
- `/vault` is still broken because of tags
- schema-v8 compatibility is still current
- PTX `$$ /...` behavior belongs here
- an API/service boundary is the right fix for interaction helper packaging
- the removed vendored interaction bridge should come back

## Recommended next step

## Single best next step
Choose the next slice based on what is still unproven:

1. **if the blocker is shared-package publication / publish order / bundle-bridge retirement**
   - go to `../pi-interaction`
   - publish or otherwise complete the support-package rollout story
   - then come back here and retire `bundleDependencies` + release-time staged bundling
2. **if the blocker is live coexistence evidence with PTX + pi-interaction + pi-vault-client loaded together**
   - stay split across `../pi-interaction`, `../pi-prompt-template-accelerator`, and this package as needed
   - keep the picker-surface boundary explicit during validation
3. **if the blocker is vault runtime correctness (`/vault`, `/vault:`, `/vault-check`, schema diagnostics, render prep, visibility/tool behavior)**
   - stay here in `pi-vault-client`

### Concrete objective for the next slice
Prove that `pi-vault-client` can eventually remove the temporary bundled-dependency staging path once the shared support packages are truly available as normal external package dependencies, while keeping:
- `npm run check` green
- `npm run release:check` green
- installed-package smoke green

## Suggested kickoff

### In `pi-vault-client`
Start with:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run docs:list
npm run check
npm run release:check:quick
```

### In `packages/pi-interaction/`
If the next slice is publication/bundle retirement work, start with:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction
npm run docs:list

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-interaction-kit
npm run check
npm run release:check:quick

cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-interaction/pi-trigger-adapter
npm run check
npm run release:check:quick
```

## Repo routing rule
- **shared interaction package architecture / publish readiness / bundle-bridge retirement**
  - go to `../pi-interaction`
- **vault runtime correctness (`/vault`, `/vault:`, `/vault-check`, schema diagnostics, render prep, visibility/tool behavior)**
  - stay here in `pi-vault-client`
- **Prompt Vault schema/contracts/data or Prompt Vault-side docs drift**
  - go to `~/ai-society/core/prompt-vault`
- **PTX `$$ /...` picker/prefill behavior**
  - go to `../pi-prompt-template-accelerator`

## Read first next time
### If staying in `pi-vault-client`
1. `AGENTS.md`
2. `README.md`
3. `docs/dev/status.md`
4. `NEXT_SESSION_PROMPT.md`
5. `../pi-interaction/docs/dev/package-boundary-architecture.md`
6. `scripts/prepare-publish-manifest.mjs`
7. `scripts/release-check.sh`

### If moving to `pi-interaction`
1. `../pi-interaction/AGENTS.md`
2. `../pi-interaction/README.md`
3. `../pi-interaction/docs/dev/package-boundary-architecture.md`
4. `../pi-interaction/docs/dev/release-workflow.md`
5. `../pi-interaction/docs/dev/trusted_publishing.md`
6. relevant subpackage `package.json` + `README.md`

## Files most relevant right now
### In `pi-vault-client`
- `package.json`
- `scripts/prepare-publish-manifest.mjs`
- `scripts/build-runtime.mjs`
- `scripts/release-check.sh`
- `scripts/release-smoke.sh`
- `src/fuzzySelector.js`
- `src/triggerAdapter.js`
- `src/vaultCommands.ts`
- `src/vaultDb.ts`
- `src/vaultPicker.ts`
- `src/vaultTools.ts`
- `tests/vault-commands.test.mjs`
- `tests/vault-update.test.mjs`

### In `pi-interaction`
- `../pi-interaction/docs/dev/package-boundary-architecture.md`
- `../pi-interaction/pi-interaction-kit/package.json`
- `../pi-interaction/pi-trigger-adapter/package.json`
- `../pi-interaction/pi-editor-registry/package.json`
- `../pi-interaction/pi-interaction/package.json`
- `../pi-interaction/docs/dev/release-workflow.md`

## Success condition for the next slice
A truthful next session is successful if it does one of these cleanly:

### Preferred success
1. proves the shared `pi-interaction` support packages are available strongly enough to retire the temporary bundled-dependency staging path here
2. keeps `pi-vault-client` on real package-boundary consumption
3. keeps `npm run check` green
4. keeps `npm run release:check` green
5. records any remaining blocker as a publish-order / package-availability issue in the owning repo

### Acceptable fallback success
1. captures the exact remaining publication/live-validation blocker
2. leaves the current package-boundary consumption intact
3. leaves the temporary bundled-dependency staging path release-safe
4. avoids reintroducing manual vendoring or service/API overengineering
