---
summary: "pi-vault-client now consumes published pi-interaction support packages through normal semver dependencies, with installed headless runtime evidence for tool surfaces and live /vault:, and the next truthful slice is same-session interactive /reload parity for /vault, /route, and /vault-check or deeper runtime work only if new evidence points there."
read_when:
  - "Starting the next focused session in packages/pi-vault-client."
  - "Deciding whether the next slice belongs here or in packages/pi-interaction."
system4d:
  container: "Canonical post-packaging-simplification handoff for the current pi-vault-client runtime + packaging state."
  compass: "Preserve the repaired release/install path, avoid reintroducing vendoring or bundle shims, and keep package-boundary ownership explicit."
  engine: "Reacquire current truth -> verify whether the next blocker is live runtime evidence or vault behavior -> keep release/install safety intact -> only then expand scope."
  fog: "Main risks are resuming from stale bundling narratives, confusing package boundaries with service/API boundaries, or changing runtime behavior before collecting installed-runtime evidence."
---

# Next session prompt for `pi-vault-client`

## One-line handoff

`pi-vault-client` is now **release-safe and functionally repaired** for Prompt Vault schema v9, with generated installable runtime entrypoints, scoped Dolt commits, fail-closed visibility-sensitive tool reads, `/route` sharing the same preparation boundary as `/vault`, and **normal semver consumption** of the shared `pi-interaction` helpers. There is no remaining vendored source bridge and no remaining temporary bundled-dependency staging bridge in this package, and installed headless runtime evidence now exists for tool surfaces plus live `/vault:`.

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
- Shared interaction helpers are consumed through published package dependencies:
  - `@tryinget/pi-interaction-kit@^0.1.0`
  - `@tryinget/pi-trigger-adapter@^0.1.0`
- The old generated vendored bridge is gone.
- The temporary bundled-dependency staging bridge is also gone.

### Current packaging contract
Do **not** hand-edit generated runtime artifacts unless you are intentionally changing the generation flow:

- generated runtime artifacts:
  - `extensions/vault.js`
  - `src/*.js` generated from package TS entrypoints

Current release/install flow:
- package source control uses normal published semver dependencies for shared interaction helpers
- `prepack` regenerates installable runtime `.js` entrypoints
- `release:check` verifies clean-room install and installed-package smoke using the real published dependency graph

## Verified evidence

### Verified in-package evidence
From `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`:

```bash
npm run check
npm run release:check
npm run docs:list
```

All passed after retiring the local bundling bridge.

Additional installed-runtime evidence in an isolated `PI_CODING_AGENT_DIR`:

```bash
PI_COMPANY=software pi -p "...vault_schema_diagnostics..."
PI_COMPANY=software pi -p "...vault_query..."
PI_COMPANY=software pi --no-session --mode json --print '/vault:meta-orchestration::phase-1-live'
```

Observed:
- installed-package tool diagnostics succeeded
- installed-package visibility-aware query succeeded
- installed-package live `/vault:` exact-name path prepared the template successfully with context preserved

### What `release:check` now proves
- `npm pack --dry-run --json`
- static runtime dependency audit for bare imports
- packed-manifest dependency hygiene (no `file:` runtime deps, no bundle bridge)
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

### Packaging status
The packaging simplification is done here.
If future issues appear, treat them as one of these classes first:
1. installed-runtime/live Pi validation gap
2. published-package contract drift
3. vault runtime correctness issue

Do **not** jump back to vendoring or local bundle shims unless new evidence forces it.

See:
- `../pi-interaction/docs/dev/package-boundary-architecture.md`

## What is **not** the current problem here

Do **not** resume from these stale assumptions unless new evidence forces it:
- `/vault` is still broken because of tags
- schema-v8 compatibility is still current
- PTX `$$ /...` behavior belongs here
- an API/service boundary is the right fix for interaction helper packaging
- source vendoring or bundle staging should return

## Recommended next step

## Single best next step
Choose the next slice based on what is still unproven:

1. **if the blocker is same-session interactive runtime confidence**
   - stay here in `pi-vault-client`
   - reinstall into Pi from the package path
   - `/reload`
   - validate the interactive command-handler paths `/vault`, `/route`, and `/vault-check` in a normal TUI runtime with the published interaction-package path now in place
2. **if the blocker is live coexistence evidence with PTX + pi-interaction + pi-vault-client loaded together**
   - stay split across `../pi-interaction`, `../pi-prompt-template-accelerator`, and this package as needed
   - keep the picker-surface boundary explicit during validation
3. **if the blocker is vault runtime correctness (`/vault`, `/vault:`, `/vault-check`, schema diagnostics, render prep, visibility/tool behavior)**
   - stay here in `pi-vault-client`

### Concrete objective for the next slice
Capture durable same-session interactive `/reload` evidence for the command-handler paths that are still TUI-specific (`/vault`, `/route`, `/vault-check`) now that headless installed-runtime evidence already exists for tool surfaces and live `/vault:`, while keeping:
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
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
```

Then in Pi:

```text
/reload
/vault-check
/vault meta-orchestration
/vault:
/route <real context>
```

## Repo routing rule
- **vault runtime correctness (`/vault`, `/vault:`, `/vault-check`, schema diagnostics, render prep, visibility/tool behavior)**
  - stay here in `pi-vault-client`
- **shared interaction package architecture / published package contract drift**
  - go to `../pi-interaction`
- **Prompt Vault schema/contracts/data or Prompt Vault-side docs drift**
  - go to `~/ai-society/core/prompt-vault`
- **PTX `$$ /...` picker/prefill behavior**
  - go to `../pi-prompt-template-accelerator`

## Read first next time
1. `AGENTS.md`
2. `README.md`
3. `docs/dev/status.md`
4. `NEXT_SESSION_PROMPT.md`
5. `../pi-interaction/docs/dev/package-boundary-architecture.md`
6. `scripts/release-check.sh`
7. `scripts/release-smoke.sh`

## Files most relevant right now
- `package.json`
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

## Success condition for the next slice
A truthful next session is successful if it does one of these cleanly:

### Preferred success
1. captures durable same-session interactive `/reload` evidence for `/vault`, `/route`, and `/vault-check`
2. keeps the already-verified installed headless `/vault:` and tool-surface evidence intact
3. keeps `pi-vault-client` on published semver interaction dependencies
4. keeps `npm run check` green
5. keeps `npm run release:check` green
6. records any remaining issue as runtime behavior or published-package contract drift, not as a packaging workaround problem

### Acceptable fallback success
1. identifies the exact installed-runtime drift point
2. leaves the current package-boundary consumption intact
3. avoids reintroducing vendoring or bundle bridges
4. narrows the next fix to the owning runtime boundary
