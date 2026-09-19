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

A screen-top activity ribbon for the coding agents running in your Ghostty tabs. Pi sessions publish their own telemetry; other terminal agents such as Claude Code are discovered from the process table.

The runtime is Electron-free. A Node controller retains the tested telemetry, identity, ordering, and exact-focus logic; a small Rust/Relm4/GTK4 panel owns rendering and the Wayland layer-shell surface.

## What it does

- auto-starts with interactive Pi TUI sessions
- shows one card per admitted Ghostty terminal on the focused Niri workspace, including tabs hidden behind another tab of their Ghostty window
- covers Pi sessions and other terminal agents (Claude Code, Codex, Gemini and more) found in Ghostty tabs
- restores tiled windows left at the wrong height when its reserved band appears or disappears
- draws itself in Ghostty's own theme and follows the desktop between light and dark
- sits on the same gap rhythm and corner radius as tiled windows, rather than as a bar on the screen edge
- aggregates independent publishers beneath stable terminal cards
- shows the AK task a session is working on: read-only `ak` output is joined onto cards, clicking the task reference focuses the claiming terminal, and claims that outlive their session or deferred tasks appear as non-clickable badges
- displays repo, phase, tool, detail, elapsed time, and freshness
- marks the exact currently focused terminal card and prefixes hidden-tab cards with `⧉`
- labels each card with its Niri window id (`#43`), so a window an agent or tool names by id can be found on the ribbon
- keeps monitoring-success cards beside the Activity tile, then active and settled cards
- expands rich details on hover or keyboard focus
- supports Left/Right navigation and Shift+Left/Right manual movement
- focuses the exact matching Ghostty window on click or Enter, presenting a hidden tab first
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

Every child-protocol message carries `protocol: 1`, and the panel drops any view carrying another version. A new card field is therefore added as an optional field: a panel that does not know it ignores it, and a panel talking to a controller that does not send it falls back to a default. The version changes only for a change an existing panel would misread.

Layer-shell replaces the old floating Electron window and dynamic Niri-config strut helper. The package no longer edits `~/.config/niri/config.kdl`, resets tiled heights, or requires Electron.

The compact surface is 84px tall and sits inset by an 8px margin on the top, left and right, matching the compositor's window gaps, with the same 12px corner radius as tiled windows. It therefore reserves 92px in total. One engaged card expands the surface to at least 276px, taller when its detail rows wrap, while the reservation is unchanged, so detail overlays content without repeatedly resizing tiled windows.

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
node ./bin/pi-activity-strip.mjs claude-hooks
node ./bin/pi-activity-strip.mjs stop
```

`stop` returns once the runtime has exited and released its lock, waiting up to 15 seconds and exiting non-zero if it has not, so `npm run strip:stop && npm run strip:open` restarts cleanly. An `open` that finds the lock still held by a runtime that never answers says so instead of timing out silently.

`fix-top` is now a compatibility no-op: layer-shell placement is compositor-owned.

## Keyboard-only entry

Bind a Niri key to the fail-closed CLI entrypoint:

```kdl
binds {
    Mod+Shift+A repeat=false allow-inhibiting=false hotkey-overlay-title="Toggle Pi Activity Ribbon keyboard mode" { spawn "/usr/bin/node" "/home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-activity-strip/bin/pi-activity-strip.mjs" "focus-strip"; }
}
```

The shortcut toggles exclusive keyboard mode. On entry, the first card is selected. Left/Right wraps through cards, Shift+Left/Right moves the selected card with wraparound, Enter focuses its exact Ghostty terminal and exits, and Escape or a second shortcut press exits without activation. Space does not activate a card. Pointer hover expands detail but deliberately does not capture keyboard input. Empty workspaces and click-through mode reject keyboard entry.

## Interaction contract

- **Workspace locality:** Niri focus events and workspace list changes trigger immediate reprojection; bounded polling remains a fallback.
- **Hide/reclaim:** zero cards unmaps the layer surface. Niri then removes its exclusive zone as part of normal Wayland surface lifecycle.
- **Crash behavior:** panel lifetime is bound to the Node controller through Linux parent-death signaling and stdin EOF. Unexpected panel exits are restarted with bounded backoff; a dead surface cannot retain an exclusive zone.
- **Exact focus:** card activation returns to Node, which performs existing fail-closed terminal identity resolution and Niri focus.
- **Hidden tabs:** a Ghostty window title only names its active tab. A bound surface whose title is not visible is placed through its Ghostty host process: one host window is exact containment; several host windows use the window remembered for that tab. Memory comes from titles seen while the strip runs and from a read-only AT-SPI inventory of tab labels, and is persisted per Niri instance under `~/.pi/agent/state/pi-activity-strip/surface-bindings.json`. A tab whose window has never been observed stays unplaced rather than guessed; `status` reports that count. Activating a hidden-tab card calls the host process's `present-surface` action on the session bus, then focuses the window, and reports success only after the title proves the tab is visible.
- **Window ids:** agents and tools name windows by their Niri window id (`claude-window` prints `window_id`, continuity receipts carry it). Each card shows that id as a quiet `#43` chip at the start of its footer; a hidden tab has no window of its own, so its chip shows the window hosting it. Hover or keyboard detail adds a `window` row with the workspace number the operator sees, Niri's workspace `idx` and never its internal workspace id, for example `#43 · workspace 2` or `host #43 · workspace 2` for a hidden tab. The tooltip and accessible label name the window too. Off Niri there is no window id, so no chip is drawn.
- **Agent tabs:** a tab is admitted as an agent when the process owning its terminal is a recognized agent CLI, never on a window title alone, so plain terminal programs are not cards. Claude Code tabs are identified exactly through the per-session scratchpad the process holds open, which yields the session id and the title Claude Code put on the terminal; that title places the tab in its window and is remembered so the tab stays placed once hidden.
- **AK task references:** cards can show the Agent Kernel task their session is working on. The controller reads the read-only `ak` CLI (`ak task list --status claimed --format json --all --verbose` and `ak task deferred --format json --all`) on a calm 15-second clock and joins claims by exact Pi session id under the AK5700 claim semantics: only `session-<uuid>` claims count, and an expired lease is vacant custody that renders nothing. A card whose session holds a live claim shows a clickable `AK #id · title` chip that reuses the card's own activation, so clicking it focuses the exact Ghostty window of the claiming session, presenting hidden tabs first. Claims whose lease has not lapsed but whose claiming session no longer exists ("claim outlives session") and tasks carrying an active deferral are joined by task repo onto cards working inside that repo and render as inert badges, never buttons — there is no live window to focus and no AK action is ever offered. Ambiguous session matches (one logical session resumed into two terminals), a missing `ak` binary, or malformed output bind nothing: fail closed, no chip, no invented state, strip behavior unchanged. The strip never writes AK state and never touches the society database directly.
- **Codex telemetry:** Codex keeps a thread index naming every session's rollout file, working directory and title. A process binds to its thread by an open rollout descriptor, or, before any task has run, by being the only session created in that directory after the process started; anything ambiguous binds nothing. The rollout tail then reports the running tool and its command, turn count, approval and sandbox policy, prompt and reply. Reading the index needs the runtime's built-in SQLite, and a host without it degrades to a process-only card.
- **Claude Code telemetry:** cards read live state from the tail of the session transcript, giving the topic, current tool and its target, last prompt, latest reply, turn count and activity clock with no configuration. That format is internal to Claude Code and can change between releases, so a transcript that no longer parses degrades to a process-only card rather than inventing activity. Optional hooks add the one state a transcript cannot express, that a session is blocked waiting for you; run `claude-hooks` for the settings fragment. Only low-frequency events are hooked, so nothing runs per tool call. OpenTelemetry is deliberately not used: it reports aggregate usage and cost, not which tool a session is running now.
- **Appearance:** the ribbon reads the same theme files Ghostty reads. It resolves the `theme` setting for the desktop's current colour scheme, including the `light:…,dark:…` form, and takes colours set directly in the config over the theme file, exactly as Ghostty layers them. State colours reuse the terminal's own meanings, so green is settled, yellow is working, red failed, and the cursor colour marks a session waiting for you. The panel derives every shade from eight named colours, so a theme change is a handful of values and one stylesheet reload rather than a restart. A theme that cannot be read falls back to a neutral palette.
- **Height repair:** showing or hiding the ribbon changes the output working area, and a window whose height is not automatic keeps the old value. After each change the strip compares window heights before and after, and resets to automatic only those windows still sitting at a height the moving windows just vacated. A height nobody vacated is never touched, each window is reset at most once per height, and a pass is bounded.
- **Two identity keys:** a Ghostty surface id is a per-process handle that can drift away from the value a long-lived Pi process captured at startup, while the 32-hex session token in the same title never does. Memory therefore stores both, and lookups prefer the exact surface. A session token that two windows claim is ambiguous and binds nothing; two terminals resuming one logical session in the same window are both placed there.
- **Ordering:** monitoring, active, and settled groups refresh on a calm 15-second clock. Manual moves survive until regroup or restart.
- **Accessibility:** cards expose native GTK labels, selected/expanded state, activation descriptions, and GTK accessible announcements.

## Environment controls

- `PI_ACTIVITY_STRIP_AUTO_START=0` disables extension autostart.
- `PI_ACTIVITY_STRIP_CLICK_THROUGH=1` installs an empty Wayland input region and disables keyboard entry.
- `PI_ACTIVITY_STRIP_NATIVE_PANEL_BIN=/absolute/path` selects another receipted panel artifact.
- `PI_ACTIVITY_STRIP_SOCKET_DIR` and `PI_ACTIVITY_STRIP_SOCKET_PATH` isolate broker fixtures and nested-compositor tests.
- `PI_ACTIVITY_STRIP_TAB_INVENTORY=0` disables the read-only AT-SPI tab inventory; hidden tabs are then placed only from titles seen while the strip runs.
- `PI_ACTIVITY_STRIP_AK_TASKS=0` disables AK task reference joining.
- `PI_ACTIVITY_STRIP_AK_BIN=/absolute/path` selects the `ak` binary used for the read-only task queries (default `ak` on `PATH`).
- `PI_ACTIVITY_STRIP_AGENT_TABS=0` disables discovery of non-Pi agent tabs.
- `PI_ACTIVITY_STRIP_AGENT_KINDS_DISABLED=claude,codex` excludes named agent kinds from discovery.
- `CODEX_HOME` selects a non-default Codex home when reading its thread index (default `~/.codex`).
- `PI_ACTIVITY_STRIP_PYTHON` selects the interpreter for the tab inventory (default `python3`).
- `PI_ACTIVITY_STRIP_HEIGHT_REPAIR=0` disables restoring windows stranded at the previous working-area height.
- `PI_ACTIVITY_STRIP_COLOR_SCHEME=light|dark` pins the ribbon to one scheme instead of following the desktop.

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

To see the panel without touching the live ribbon, run its built-in demo cards in a nested Niri with a config that spawns nothing:

```bash
printf 'prefer-no-csd\nhotkey-overlay {\n    skip-at-startup\n}\n' >/tmp/pi-activity-preview.kdl
niri -c /tmp/pi-activity-preview.kdl -- env PI_ACTIVITY_STRIP_PANEL_DEMO=1 \
  "$PWD/native/bin/linux-x64-gnu/pi-activity-strip-panel"
```

The panel is unique per Wayland display: this demo runs beside the live ribbon, while a second panel on the live display is refused with an error rather than reserving a second band. Never run the panel under a private session bus such as `dbus-run-session`: GTK then starts a second accessibility bus that takes over the desktop's AT-SPI socket and leaves it dead when it exits.

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
- exact Ghostty activation, including hidden tabs via `present-surface`
- hidden Ghostty tab placement through host process containment and learned window memory
- clickable AK task references joined from read-only `ak` output, with claim-outlives-session and deferred badges
- Niri window id on every card, and its workspace number in the detail
- non-Pi agent tab discovery with an exact Claude Code adapter
- live Claude Code telemetry from its transcript, with optional hooks for blocked-on-you states
- live Codex telemetry from its thread index and rollout files
- Ghostty theme following, light and dark
- repair of windows stranded at the previous working-area height
- bounded panel restart and parent-death cleanup
- click-through input region

Not implemented:

- placement of a tab whose window has never been observed, on a host without the AT-SPI inventory (Ghostty exposes no surface listing of its own)
- distinguishing two terminals that resume one logical session when only the drifted session token is available; both are placed in the one window that claims that token
- live phase and tool detail for agents other than Claude Code and Codex, which have no adapter yet; their cards show the agent, directory, elapsed time and pid
- placement of an agent other than Claude Code whose tab is hidden inside a multi-window Ghostty process, since only Claude Code exposes a per-tab title identity
- one panel per output
- historical timeline
- any AK mutation from the strip (unclaim, land, reconstruct, apply); the ribbon is a read-only projection by construction
- persisted manual ordering
- remote observers via `pi-server`

## References

- [Project vision](docs/project/vision.md)
- [Project resources](docs/project/resources.md)
- [Verification evidence](docs/project/verification.md)
- [Superseded adaptive-strut design investigation](docs/project/2026-08-31-adaptive-niri-space-design.md)
