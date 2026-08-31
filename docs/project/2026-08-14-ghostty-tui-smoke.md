---
summary: "Reality-oriented Ghostty TUI smoke harness, coverage, and explicit interactive-input gaps."
read_when:
  - "You are changing Ghostty-backed Pi launch commands or their live verification contract."
  - "You need to understand what the root Ghostty smoke harness proves."
---

# Ghostty-driven TUI smoke harness (2026-08-14)

## What was built

- `scripts/ghostty-tui-smoke.sh` — harness (exit 0=pass / 1=assert failed / 2=harness failure, 90s guard, no repo mutations).
- `scripts/ghostty-tui-smoke-inner.sh` — bounded command that runs inside the spawned ghostty window: `timeout -k 5 --signal=INT 30 pi` in the repo cwd, then writes marker lines to a results file.
- `Justfile` recipe `ghostty-tui-smoke` next to `tui-smoke`.

## Covered (proved by real runs, 2026-08-14)

1. Ghostty D-Bus name `com.mitchellh.ghostty` is resolvable on the live user bus.
2. Sidequest companion systemd user service `app-com.tryinget.ghosttysidequest.service` is active (its D-Bus name `com.tryinget.ghosttysidequest` is also on the bus).
3. A **new** ghostty instance (`--gtk-single-instance=false -e ...`) launches a real terminal window; pi TUI mode runs inside it attached to the real terminal emulator and the user D-Bus session for the full bounded duration (35s run: 30s INT + 5s KILL escalation; pi TUI traps SIGINT, so `timeout -k` SIGKILL is the bounded exit path and exit 137 is accepted).
4. The spawned window closes itself when its child exits; the harness verifies the spawned process is gone and never kills/restarts the operator's running ghostty.

## How it works / environment notes

- Agent/tty sessions have no `DISPLAY`/`WAYLAND_DISPLAY`; the harness inherits them from `systemctl --user show-environment` so it can spawn windows on the live graphical session (Wayland, `DISPLAY=:0` for Xwayland).
- pi's stdio must stay attached to the window's tty: redirecting stdout makes it non-tty and pi exits instantly (found empirically; the inner script therefore asserts a minimum 5s runtime to catch this regression).

## Residual gaps (operator-driven, not covered headlessly)

- **No interactive input driving.** xdotool exists but the desktop runs Wayland and ghostty windows are native Wayland surfaces, so `xdotool search` cannot see or type into them. The harness cannot send `/changelog`, `/sidequest`, `/fresh-handoff`, `fresh_handoff_spawn`, or surface-id targeting into the real window. Those TUI-only interactive paths remain covered only by manual operator testing (or a future ydotool/wtype-based driver with uinput permissions).
- **No pane-content assertions** inside the ghostty window (no capture mechanism equivalent to `tmux capture-pane`); assertions are process/marker-level.
- **Sidequest D-Bus surface is checked for presence/activity only** — actual `/sidequest` tab-attach behavior against the companion is not exercised.
