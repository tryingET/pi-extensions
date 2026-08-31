---
summary: "Native Niri layer-shell activity ribbon for live Pi sessions."
read_when:
  - "Starting work in this package workspace."
  - "Installing or verifying the Activity Strip in Pi."
system4d:
  container: "Monorepo package with a Node telemetry broker/controller and native GTK4 layer-shell panel."
  compass: "Show exact workspace-local Pi activity without changing normal terminal workflows or mutating compositor configuration."
  engine: "Pi telemetry -> local broker -> Niri workspace projection -> native layer-shell panel."
  fog: "Main risks are native ABI availability, stale-session identity, and unverified multi-output behavior."
---

# @tryinget/pi-activity-strip

A screen-top activity ribbon for live Pi sessions running in Ghostty.

The runtime is Electron-free. A Node controller retains the tested telemetry, identity, ordering, and exact-focus logic; a small Rust/Relm4/GTK4 panel owns rendering and the Wayland layer-shell surface.

## What it does

- auto-starts with interactive Pi TUI sessions
- shows one card per admitted Ghostty terminal on the focused Niri workspace
- aggregates independent publishers beneath stable terminal cards
- displays repo, phase, tool, detail, elapsed time, and freshness
- marks the exact currently focused terminal card
- keeps monitoring-success cards beside the Activity tile, then active and settled cards
- expands rich details on hover or keyboard focus
- supports Left/Right navigation and Shift+Left/Right manual movement
- focuses the exact matching Ghostty window on click or Enter
- hides completely on workspaces without tracked cards
- releases its 84px exclusive zone automatically when hidden or crashed

## Architecture

```text
Pi publisher streams
  -> Node Unix-socket broker and session store
  -> exact terminal identity + Niri workspace projection
  -> versioned NDJSON child protocol
  -> Rust / Relm4 / GTK4 panel
  -> wlr-layer-shell top surface with an 84px exclusive zone
```

Layer-shell replaces the old floating Electron window and dynamic Niri-config strut helper. The package no longer edits `~/.config/niri/config.kdl`, resets tiled heights, or requires Electron.

The compact surface is 84px tall. One engaged card expands the surface to 252px while the exclusive zone remains 84px, so detail overlays content without repeatedly resizing tiled windows.

## Supported host

The packaged native artifact currently supports:

- Linux x86_64
- Wayland
- a compositor implementing `wlr-layer-shell` (dogfooded on Niri 26.04)
- GTK4 and gtk4-layer-shell runtime libraries

On Arch Linux:

```bash
sudo pacman -S gtk4 gtk4-layer-shell
```

Multi-output replication remains unimplemented. The current surface is single-output and must not be described as multi-monitor complete.

## Installation

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip
pi install "$PWD"
```

Reload already-running Pi tabs with `/reload`. New tabs load the package automatically.

## Commands

```bash
npm run strip:open
npm run strip:status
npm run strip:doctor
npm run strip:snapshot
npm run strip:fix-top
npm run strip:stop
```

Direct CLI:

```bash
node ./bin/pi-activity-strip.mjs open
node ./bin/pi-activity-strip.mjs focus-strip
node ./bin/pi-activity-strip.mjs focus-session <full-pi-session-id>
node ./bin/pi-activity-strip.mjs status
node ./bin/pi-activity-strip.mjs doctor
node ./bin/pi-activity-strip.mjs snapshot
node ./bin/pi-activity-strip.mjs stop
```

`fix-top` is now a compatibility no-op: layer-shell placement is compositor-owned.

## Keyboard-only entry

Bind a Niri key to the fail-closed CLI entrypoint:

```kdl
binds {
    Mod+Shift+A { spawn "node" "/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip/bin/pi-activity-strip.mjs" "focus-strip"; }
}
```

The command temporarily requests exclusive keyboard interactivity, focuses the first card, and releases keyboard ownership after successful activation or Escape. Empty workspaces and click-through mode reject keyboard entry.

## Interaction contract

- **Workspace locality:** Niri focus events trigger immediate reprojection; bounded polling remains a fallback.
- **Hide/reclaim:** zero cards unmaps the layer surface. Niri then removes its exclusive zone as part of normal Wayland surface lifecycle.
- **Crash behavior:** panel lifetime is bound to the Node controller through Linux parent-death signaling and stdin EOF. Unexpected panel exits are restarted with bounded backoff; a dead surface cannot retain an exclusive zone.
- **Exact focus:** card activation returns to Node, which performs existing fail-closed terminal identity resolution and Niri focus.
- **Ordering:** monitoring, active, and settled groups refresh on a calm 15-second clock. Manual moves survive until regroup or restart.
- **Accessibility:** cards expose native GTK labels, selected/expanded state, activation descriptions, and GTK accessible announcements.

## Environment controls

- `PI_ACTIVITY_STRIP_AUTO_START=0` disables extension autostart.
- `PI_ACTIVITY_STRIP_CLICK_THROUGH=1` installs an empty Wayland input region and disables keyboard entry.
- `PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN=/absolute/path` selects another receipted panel artifact.
- `PI_ACTIVITY_STRIP_SOCKET_DIR` and `PI_ACTIVITY_STRIP_SOCKET_PATH` isolate broker fixtures and nested-compositor tests.

Unverified native binaries are rejected unless `PI_ACTIVITY_STRIP_ALLOW_UNVERIFIED_PANEL=1` is explicitly set for development fixtures.

## Verification

```bash
npm run native:build   # exact Rust 1.98 build, tests, staged artifact receipt
npm run check          # canonical Node/package quality gate
npm run native:check   # Rust formatting and tests
npm run release:check  # full packed install and native-artifact smoke
```

The staged artifact receipt binds:

- binary SHA-256
- Cargo lock SHA-256
- complete Rust/CSS source SHA-256
- Rust compiler version
- glibc symbol floor
- required shared libraries

Live verification must inspect Niri layers rather than regular windows:

```bash
niri msg -j layers | jq '[.[] | select(.namespace == "pi-activity-strip")]'
```

## Current scope

Implemented:

- local broker and telemetry publishers
- native GTK4 layer-shell rendering
- workspace-local Niri projection
- hide/reclaim and restore
- pointer and keyboard card interaction
- exact Ghostty activation
- bounded panel restart and parent-death cleanup
- click-through input region

Not implemented:

- one panel per output
- historical timeline
- persisted manual ordering
- remote observers via `pi-server`

## References

- [Project vision](docs/project/vision.md)
- [Project resources](docs/project/resources.md)
- [Verification evidence](docs/project/verification.md)
- [Superseded adaptive-strut design investigation](docs/project/2026-08-31-adaptive-niri-space-design.md)
