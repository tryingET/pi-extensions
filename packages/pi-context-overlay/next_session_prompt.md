---
summary: "Handoff prompt for package @tryinget/pi-context-overlay inside monorepo workspace."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep the migrated context-overlay package aligned with the template scaffold, monorepo release wiring, and live Pi behavior."
  engine: "Verify live behavior -> tighten package/docs/contracts -> decide whether any backup/local artifacts can be retired."
  fog: "Main risks are host API drift and forgetting that this package was promoted from a formerly local-only extension."
---

# Next session prompt for @tryinget/pi-context-overlay

## Current state

`context-overlay` was promoted from the operator-local extension path:

- old local extension: `~/.pi/agent/extensions/context-overlay`
- local backup: `~/.pi/agent/extensions/.backup-context-overlay-20260328-072333`

The package was then created in the monorepo, backed up, re-scaffolded from the template repo, and remigrated:

- package path: `packages/pi-context-overlay`
- package backup of pre-template manual migration: `/home/tryinget/ai-society/softwareco/owned/_backups/pi-context-overlay-20260328-072717`
- template source used for re-scaffold: `~/ai-society/softwareco/owned/pi-extensions-template`

## What is done

- `/c` context inspector overlay now lives in `extensions/context-overlay.ts`
- overlay/session logic lives in `src/`
- prompt template lives in `prompts/context-report.md`
- host-compat fallback is in place for removed/renamed keybinding-hint API (`appKeyHint` -> `keyHint` path)
- the overlay now rebuilds its live snapshot from `ctx.sessionManager` on `session_start`, `session_tree`, and `session_compact`, so it no longer depends on legacy `session_switch` hooks to stay current-session-aware
- the bounded compatibility note for that lifecycle change lives in `docs/project/2026-04-01-session-start-surface-compatibility.md`
- root release metadata was updated for component `pi-context-overlay`
- local package is installed into Pi from:
  - `/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-context-overlay`
- publish tarball noise was trimmed (`examples/.gitkeep` and `src/.gitkeep` no longer ship)

## Last known validation

Run from `packages/pi-context-overlay`:

```bash
npm run check
npm run release:check:quick
```

Both were passing at handoff time.

Latest additional validation on 2026-03-23:

- `cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-context-overlay && npm run check`
- `cd ~/ai-society/softwareco/owned/pi-extensions && npm run quality:pre-push`
- `PI_OFFLINE=1 pi --no-session -p "/c"` loaded the command surface without a runtime crash while the local package install was active

A full interactive `/reload` + `/c` pass is still the right place to reconfirm footer key-hint rendering and file-open behavior.

## Recommended first step next session

Verify the live package in Pi after `/reload`:

1. run `/c`
2. confirm the overlay opens without runtime errors
3. confirm footer key hints render correctly on the current Pi host
4. navigate the current session in a way that re-emits lifecycle state (`session_start`, tree navigation, or compaction on the active host) and confirm the overlay reflects the current session instead of stale prior context
5. if possible, trigger a case where a file-backed context item can be opened from the overlay

## Likely next improvements

### 1. Add a true live smoke path

Current package validation is good at unit/package level, but it would be useful to add a bounded live smoke for:

- command registration of `/c`
- overlay render/open path
- prompt availability for `/context-report`

### 2. Decide backup retirement policy

If live behavior stays stable for a while, decide whether to keep or remove:

- `~/.pi/agent/extensions/.backup-context-overlay-20260328-072333`
- `/home/tryinget/ai-society/softwareco/owned/_backups/pi-context-overlay-20260328-072717`

### 3. Consider package polish

Potential polish items:

- add explicit package-local docs about zellij/file-open assumptions
- decide whether `context-report` should stay package-local or be generalized
- add more tests around classifier grouping and file-path extraction

## Quick commands

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-context-overlay
npm run check
npm run release:check:quick
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-context-overlay
```

Then in Pi:

```text
/reload
/c
```
