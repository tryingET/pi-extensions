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
- tracks each publisher stream independently while aggregating them beneath one stable terminal card
- on Niri, shows one card per admitted live Ghostty terminal surface on only the focused workspace; two terminals may safely resume the same logical Pi session
- surfaces:
  - repo/session label
  - current phase
  - current tool or target
  - fine-grained detail text
  - elapsed time plus last-seen freshness
  - state color (`thinking`, `tool`, `waiting`, `done`, `error`)
- keeps a local broker so multiple Pi processes can report into one strip
- marks the Pi session in the currently focused Niri/Ghostty terminal with a stronger border and left rail, without adding another label
- keeps green `done`/`monitoring` cards directly beside the Activity tile, followed by active work and then other settled sessions, on a calm 15-second ordering clock
- reveals prompt, response, path, and full activity detail on hover or keyboard focus
- focuses the exact matching Ghostty/Niri window on click or Enter, failing closed when identity is missing or ambiguous
- keeps an aligned strip resident on its Niri workspace while that workspace still has tracked terminals, so visiting an empty workspace does not unmap or reposition it

## Architecture

```text
Pi publisher stream
  -> admitted terminal binding or unbound logical-session containment
  -> local unix-socket broker with publisher leases
  -> stable terminal-card projection
  -> Electron top-row overlay
```

This is intentionally **local-first**.
It does not require moving your workflow onto `pi-server` first.

## Current scope

Implemented now:
- local per-host broker
- primary-display top-row strip
- one card per admitted Ghostty terminal surface on the focused Niri workspace, regardless of activity state
- aggregation of multiple publisher incarnations beneath one terminal card, with active real-event work preferred over idle heartbeats
- headless-safe telemetry publishing that cannot claim an inherited Ghostty surface
- explicit open/focus-strip/focus-session/status/doctor/snapshot/fix-top/stop commands
- focus-scoped Left/Right navigation and Shift+Left/Right manual card movement
- local visual capture helpers so the agent can inspect the strip directly

Not implemented yet:
- multi-monitor strip replication
- historical timeline
- persisted manual card order across strip restarts
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
npm run strip:doctor
npm run strip:snapshot
npm run strip:fix-top
npm run strip:stop
```

or directly:

```bash
node ./bin/pi-activity-strip.mjs open
node ./bin/pi-activity-strip.mjs focus-strip
node ./bin/pi-activity-strip.mjs focus-session <full-pi-session-id>
node ./bin/pi-activity-strip.mjs status
node ./bin/pi-activity-strip.mjs doctor
node ./bin/pi-activity-strip.mjs snapshot
node ./bin/pi-activity-strip.mjs fix-top
```

### Pi slash commands

Inside Pi:

```text
/activity-strip
/activity-strip status
/activity-strip doctor
/activity-strip fix-top
/activity-strip stop
/activity-strip-stop
```

In Pi with UI support:
- `/activity-strip status` opens a detailed runtime status report when an editor surface is available
- `/activity-strip doctor` opens the host-compatibility report

## Interaction model

- **Workspace locality:** one strip follows the Niri workspace selected with Up/Down and renders only tracked Pi terminals whose exact Ghostty windows are on that workspace. Focused-workspace events trigger reconciliation immediately, with polling retained as a fallback. When an empty workspace is visited, an aligned strip whose resident workspace still has tracked terminals remains rendered on that prior workspace; Niri keeps it off the empty workspace and returning brings the already-positioned strip back with its row. If its resident terminals disappear, the renderer is concealed and input-disabled. When an actual remap or floating correction is unavoidable, reveal waits beyond Niri's compositor movement animation and then re-verifies placement and membership. The broker remains global and non-Niri desktops retain the global card view.
- **Ordering:** green `done` cards whose footer reads `monitoring` stay at the far left beside the Activity tile. Active tool/thinking/waiting cards follow, then other settled cards. The group order refreshes every 15 seconds rather than on every telemetry packet; text and timers still update live.
- **Current terminal:** on Niri, the card matching the focused Ghostty window gets a stronger border and left rail without an extra label. Current titles carry a `gs:<family>:<surface>` segment before the final logical-session token, so two terminals that resumed the same session remain distinct.
- **Pointer:** hover expands the strip and reveals detail, last prompt, assistant preview, and path. Leaving the strip or activating another window collapses it immediately. Single click asks Niri to focus the exact terminal-surface title; legacy session-only titles remain a fail-closed migration fallback.
- **Keyboard inside the strip:** Left/Right changes card focus, Enter activates the focused card, and Shift+Left/Right manually moves it. Manual movement lasts until a later activity regroup or runtime restart.
- **Fail-closed focus:** terminal, publisher, process, and logical-session identities remain separate. A surface binding requires an interactive UI, a real TTY, a recognized Ghostty process family, and a bounded surface ID. Already-running legacy tabs may recover only through a process-bound `pi-session-presence` sidecar whose source, PID, and cwd agree. Ambiguity disables only the unsafe focus action; it does not churn or conceal unrelated cards.

### Keyboard-only entry on Niri

The package deliberately does not reserve a global Electron shortcut. Bind one compositor key to the fail-closed CLI entrypoint instead:

```kdl
binds {
    Mod+Shift+A { spawn "node" "/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip/bin/pi-activity-strip.mjs" "focus-strip"; }
}
```

`focus-strip` gives keyboard focus only to the unique strip already resident on the currently focused workspace; it never moves a strip between workspaces. When the focused workspace has no tracked live Pi terminals, the command fails closed rather than forcing an empty bar into view. This keeps shortcut ownership explicit in Niri and avoids application-level global-key collisions.

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
npm run strip:doctor
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

### Compatibility diagnostics

```bash
npm run strip:doctor
node ./bin/pi-activity-strip.mjs doctor --json
```

Use `doctor` before opening the strip when the host/display assumptions are uncertain. It reports:
- whether a graphical session is present
- whether Electron can be resolved
- whether Niri-specific top-edge repair is available
- whether the current setup is multi-display even though the strip remains primary-display-only

## Environment controls

- `PI_ACTIVITY_STRIP_AUTO_START=0`
  - disable automatic strip opening on Pi session start
- `PI_ACTIVITY_STRIP_CLICK_THROUGH=1`
  - opt out of interaction and restore a mouse-transparent overlay; interactive hover/click/keyboard behavior is the default
- `PI_ACTIVITY_STRIP_ELECTRON_BIN=/path/to/electron`
  - override Electron binary discovery
- `GLIMPSE_ELECTRON_BIN=/path/to/electron`
  - shared Electron override also respected

## Practical usage for your Ghostty tabs

If you want this for all current tabs:

1. install both local package paths with `pi install`
2. stop any already-running old strip broker with `npm run strip:stop`
3. run `/reload` inside each already-open Pi tab so telemetry and session-presence title contracts advance together
4. open the new broker once with `/activity-strip` or `npm run strip:open`
5. confirm current titles use `· gs:<family>:<surface> · <full-32-hex-session-id-token>`; the final session suffix preserves old-consumer compatibility, while the surface segment disambiguates duplicate resumes

## References

- [Project vision](docs/project/vision.md)
- [Project resources](docs/project/resources.md)
- [Verification notes](docs/project/verification.md)
- [Next session prompt](next_session_prompt.md)
