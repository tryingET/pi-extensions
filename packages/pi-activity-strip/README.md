---
summary: "Top-row live activity strip for local Pi sessions running in Ghostty or other terminals."
read_when:
  - "Starting work in this package workspace."
  - "Installing or verifying the activity strip in Pi."
system4d:
  container: "Monorepo package for a local broker + Electron overlay + Pi extension telemetry seam."
  compass: "Make Pi session activity visible at a glance without changing the operator's normal terminal workflow."
  engine: "Pi extension emits session telemetry -> local broker aggregates -> top-row Electron strip renders live state."
  fog: "Main risks are runtime drift across Pi host versions, Electron availability, and stale-session behavior under real long-running work."
---

# @tryinget/pi-activity-strip

A Pi extension package that gives you a **screen-top activity strip** showing what your live Pi sessions are doing.

This package is designed for the exact workflow you asked for:
- multiple Ghostty tabs
- multiple Pi sessions
- a persistent top-row ribbon
- fine-grained live detail without changing how you normally run Pi

## What it does

- auto-starts a local top-row overlay when Pi starts in a TUI session
- tracks each active Pi session independently
- shows one card per live session
- surfaces:
  - repo/session label
  - current phase
  - current tool or target
  - fine-grained detail text
  - elapsed time
  - state color (`thinking`, `tool`, `waiting`, `done`, `error`)
- keeps a local broker so multiple Pi processes can report into one strip

## Architecture

```text
Pi session
  -> activity-strip extension
  -> local unix-socket broker
  -> Electron top-row overlay
```

This is intentionally **local-first**.
It does not require moving your workflow onto `pi-server` first.

## Current scope

Implemented now:
- local per-host broker
- primary-display top-row strip
- one card per active Pi session
- headless-safe telemetry publishing
- explicit open/status/snapshot/fix-top/stop commands
- local visual capture helpers so the agent can inspect the strip directly

Not implemented yet:
- multi-monitor strip replication
- historical timeline / expand-on-hover detail
- remote observers via `pi-server`

## Installation in Pi

From this package directory:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip
pi install "$PWD"
```

Then for **existing Pi tabs**:
- run `/reload` in each tab you want tracked

For **new Pi tabs**:
- the package will load automatically from your Pi settings

## Operator commands

### Package-local CLI

```bash
npm run strip:open
npm run strip:status
npm run strip:snapshot
npm run strip:fix-top
npm run strip:stop
```

or directly:

```bash
node ./bin/pi-activity-strip.mjs open
node ./bin/pi-activity-strip.mjs snapshot
node ./bin/pi-activity-strip.mjs fix-top
```

### Pi slash commands

Inside Pi:

```text
/activity-strip
/activity-strip status
/activity-strip fix-top
/activity-strip stop
/activity-strip-stop
```

## Verification commands

### Package checks

```bash
npm install
npm run check
npm run release:check:quick
```

### Run the strip locally

```bash
npm run strip:open
npm run strip:status
npm run strip:snapshot
```

### Capture what the agent should inspect

```bash
npm run capture:strip   # just the Pi activity strip window
npm run capture:top     # top band of the focused output, including the strip + upper window area
```

These are specifically useful so the agent can inspect the current visual state without you manually posting screenshots.

### Simulate multiple sessions

```bash
npm run demo:simulate
```

### Real Pi smoke on the live broker

```bash
npm run smoke:headless-live
```

This smoke:
- opens the strip
- runs a real headless Pi session with this extension loaded
- exercises a real tool call
- verifies that the broker observed the session while it was active

## Environment controls

- `PI_ACTIVITY_STRIP_AUTO_START=0`
  - disable automatic strip opening on Pi session start
- `PI_ACTIVITY_STRIP_CLICK_THROUGH=0`
  - make the overlay clickable instead of mouse-transparent
- `PI_ACTIVITY_STRIP_ELECTRON_BIN=/path/to/electron`
  - override Electron binary discovery
- `GLIMPSE_ELECTRON_BIN=/path/to/electron`
  - shared Electron override also respected

## Practical usage for your Ghostty tabs

If you want this for all current tabs:

1. install the package once with `pi install`
2. run `/reload` inside each already-open Pi tab
3. open the strip once with `/activity-strip` or `npm run strip:open`
4. from then on, every loaded Pi session should report into the same top-row ribbon

## References

- [Project vision](docs/project/vision.md)
- [Project resources](docs/project/resources.md)
- [Verification notes](docs/project/verification.md)
- [Next session prompt](next_session_prompt.md)
