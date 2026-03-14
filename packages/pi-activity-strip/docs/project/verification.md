---
summary: "Verification notes for the local broker, overlay, and Pi telemetry path."
read_when:
  - "Checking whether the package is actually working end to end."
  - "Reviewing what has been verified versus what is still manual."
system4d:
  container: "Evidence record for current package behavior."
  compass: "Prefer explicit runnable verification over implied confidence."
  engine: "Run package checks -> run broker/overlay commands -> run real Pi smoke -> record evidence."
  fog: "GUI behavior on the live desktop can still differ from long-running day-to-day usage."
---

# Verification

## Verified on 2026-03-14

### 1. Package quality gate

Command:

```bash
npm run check
```

Observed result:
- structure validation passed
- Biome/lint passed
- package tests passed (`6/6`)
- `npm pack --dry-run` succeeded through the package gate

### 2. Publish-surface verification

Commands:

```bash
npm run release:check:quick
npm run release:check
```

Observed result:
- tarball whitelist check passed
- `npm publish --dry-run` passed
- isolated `pi install` of the packed tarball passed
- package-specific installed-runtime smoke passed via `scripts/release-smoke.sh`

### 3. Real Pi telemetry path into the live broker

Command:

```bash
PI_ACTIVITY_STRIP_KEEP_RUNNING=1 npm run smoke:headless-live
```

Observed result:
- the strip started successfully
- a real headless Pi run loaded this package
- the broker observed a live Pi session while that run was active
- the smoke finished with `live headless smoke OK`

### 4. Global Pi installation

Command:

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip
```

Observed result:
- package installed successfully into Pi settings
- `pi list` shows the installed local package path

### 5. Broker/overlay status after install

Commands:

```bash
node ./bin/pi-activity-strip.mjs status
node ./bin/pi-activity-strip.mjs snapshot
node ./bin/pi-activity-strip.mjs fix-top
npm run capture:strip
npm run capture:top
```

Observed result:
- broker reported `running`
- snapshot command returned valid JSON
- `fix-top` successfully moved the strip to the top edge in Niri when it drifted downward
- local capture helpers produced direct strip/top-band screenshots for agent inspection

## Verified behavior summary

What is now proven:
- package passes local monorepo quality gates
- tarball packaging is sane
- the extension loads inside Pi without breaking headless runs
- the extension emits telemetry into the local broker
- the broker feeds the top-row strip runtime
- the package is installed into your Pi environment
- the operator/agent can capture the strip directly for visual inspection
- the strip can be forced back to the top edge with an explicit repair command

## Remaining manual/operator verification

Still worth checking in normal use:
- reload several already-open interactive Ghostty Pi tabs and confirm they all appear as separate cards
- judge whether the current detail level is rich enough for long-running sessions
- decide whether the strip should remain primary-display-only or grow multi-monitor behavior
- decide whether click-through should stay the default for your workstation
