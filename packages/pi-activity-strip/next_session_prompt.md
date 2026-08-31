---
summary: "Handoff prompt for package @tryinget/pi-activity-strip inside monorepo workspace."
read_when:
  - "Starting the next focused package-development session."
system4d:
  container: "Package session handoff artifact."
  compass: "Keep the local top-row strip stable while widening real operator usefulness carefully."
  engine: "Verify current broker/overlay behavior -> improve one focused interaction slice -> keep docs and smoke tests current."
  fog: "Biggest risks are runtime drift across Pi host updates, stale-session behavior, and over-expanding scope before the local UX is solid."
---

# Next session prompt for @tryinget/pi-activity-strip

## Current truth

- the package now provides a local broker/controller, native GTK4 layer-shell strip, and Pi telemetry extension
- local capture helpers now let the operator/agent inspect the strip directly (`npm run capture:strip`, `npm run capture:top`)
- layer-shell owns top placement and exclusive-zone release; `fix-top` is now a compatibility no-op
- package validation passed through `npm run check`
- publish-surface verification passed through `npm run release:check`
- a real headless Pi smoke passed through `npm run smoke:headless-live`
- the package is installed into Pi at:
  - `/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip`

## Next likely slices

1. verify several real interactive Ghostty Pi tabs after `/reload`
2. extend nested-Niri fault and accessibility coverage without regressing the dogfooded native path
3. decide whether to add one layer surface per output or retain the current single-output scope
4. explore a future optional `pi-server` adapter without making it a prerequisite for the local workflow

## Quick start

```bash
npm run check
npm run release:check
npm run smoke:headless-live
```

## Live operator commands

```bash
npm run strip:open
npm run strip:snapshot
npm run strip:fix-top
npm run strip:stop
```

Inside Pi:

```text
/activity-strip
/activity-strip status
/activity-strip fix-top
/activity-strip stop
```
