---
summary: "PTY/tmux Pi TUI smoke harness, covered command behavior, and Ghostty-specific limitations."
read_when:
  - "You are changing Pi TUI smoke coverage or command registration verification."
  - "You need to distinguish headless TUI assertions from real Ghostty launch proof."
---

# TUI Smoke Harness (2026-08-14)

## What it is

`scripts/tui-smoke.sh` gives the pi-extensions monorepo a scripted smoke test for
paths that only exist when pi runs in interactive TUI mode (`ctx.hasUI=true`).
`just tui-smoke` runs it. Exit codes: `0` pass, `1` assertion failed, `2` harness
failure. Each assertion prints PASS/FAIL.

## How it drives the TUI

- Prefers `tmux` (`tmux new-session -d ... -x 120 -y 40 -c <repo> pi`, capture via
  `tmux capture-pane -p`, drive via `send-keys`).
- On this workstation tmux is not installed and there is no sudo, so the harness
  falls back to `scripts/tui-smoke-pty.py`: a python3 `pty.fork()` driver that
  allocates a 120x40 pseudo-terminal, spawns `pi` with cwd = the repo root,
  captures bytes, types the slash command char-by-char, and captures the result.
- Timeout guard defaults to 90s (`TUI_SMOKE_TIMEOUT` overrides); sessions are
  killed on exit.

## Assertions

1. TUI chrome rendered — startup capture contains the repo path status line
   (`pi-extensions`).
2. Extension-provided resources loaded — the startup panel shows `[Skills]` and
   `[Prompts]` sections (repo packages `pi-extensions-operator` skill, `/commit`
   prompt), proving package extensions are active in a TUI session.
3. A built-in slash command executes — `/changelog` is typed and its output must
   contain the running pi version (`pi --version`). Note: `/help` and `/doctor`
   are NOT built-in pi commands; unknown `/x` inputs fall through to the model as
   a chat prompt, so they were deliberately not used.

## What it deliberately does NOT cover

- **Ghostty D-Bus / window-targeting surfaces**: `pi-little-helpers` `/sidequest`
  plus `/fresh-handoff` and `fresh_handoff_spawn` launch require a real Ghostty session with its D-Bus
  observer running; a tmux/pty pane has no Ghostty window identity. To exercise
  these, a human/operator opens a fresh Ghostty tab, runs `pi` there in TUI mode,
  drives `/sidequest` and `/fresh-handoff`, invokes `fresh_handoff_spawn`, and confirms the target launch — per the repo root AGENTS
  live-verification rule.
- **pi-activity-strip overlay**: the strip renders in an Electron top-row overlay
  plus a broker socket, not in the pi pane, so in-pane assertions cannot see it.
  Its extension side (telemetry load in TUI) is only indirectly covered by
  assertion 2.
- **pi-ontology-workflows / ASC observer TUI-only paths**: reachable but not
  driven here; extending this harness would need dedicated safe commands.
- Visual rendering fidelity, themes, mouse interaction, resize behavior.

## How to run

```bash
just tui-smoke
# or
./scripts/tui-smoke.sh
```

Read-only regarding the repo: no files are committed or modified. Side effects are
limited to pi session files under `~/.pi/agent/sessions/` (and, if a stray chat
prompt were submitted, ordinary session logs — the harness avoids sending chat
prompts).


## 2026-08-15: /reload regression phase (assert 4)

Added after a real crash class: `@marckrenn/pi-sub-bar` 1.5.0 captured the
extension ctx in its usage-widget render closure; after `/reload` the orphaned
closure threw from the TUI render timer and killed pi (uncaughtException).
Root cause + fix tracked upstream (marckrenn/pi-sub#76, earendil-works/pi#8150);
local stopgap patch: `scripts/patches/pi-sub-bar-1.5.0-stale-ctx-crash.patch`
(re-apply after any pi-sub-bar update — npm updates silently revert it).

The harness now drives `/reload` mid-session and asserts the TUI stays alive
and responsive (a second `/changelog` must still render).

Coverage limit, stated honestly: this exercises the reload lifecycle, but the
sub-bar crash specifically requires live usage data (pi-sub-core snapshot) which
the harness never generates (no model calls). The unpatched red case is proven
by the operator's production crash, not by this harness.
