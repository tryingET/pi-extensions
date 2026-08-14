#!/usr/bin/env bash
# TUI smoke harness for pi-extensions.
# Launches pi (TUI mode) in this repo, asserts TUI chrome + extension-loaded
# resources render, runs a built-in slash command (/changelog), and exits cleanly.
# Exit codes: 0=pass, 1=assertion failed, 2=harness failure.
# Prefers tmux; falls back to a python3 pty driver when tmux is unavailable.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMEOUT_SECS="${TUI_SMOKE_TIMEOUT:-90}"
SESSION="pi-tui-smoke-$$"

fail_assert() { echo "FAIL: $1"; exit 1; }

if ! command -v pi >/dev/null 2>&1; then
  echo "HARNESS FAILURE: pi not on PATH" >&2; exit 2
fi

run_tmux() {
  command -v tmux >/dev/null 2>&1
}

if run_tmux; then
  echo "driver: tmux"
  tmux new-session -d -s "$SESSION" -x 120 -y 40 -c "$REPO_ROOT" pi || { echo "HARNESS FAILURE: tmux launch" >&2; exit 2; }
  trap 'tmux kill-session -t "$SESSION" 2>/dev/null || true' EXIT
  sleep 15
  STARTUP="$(tmux capture-pane -p -t "$SESSION")"
  for ch in / c h a n g e l o g; do tmux send-keys -t "$SESSION" "$ch"; sleep 0.3; done
  sleep 2
  tmux send-keys -t "$SESSION" Enter
  sleep 8
  CMDOUT="$(tmux capture-pane -p -t "$SESSION")"
  tmux send-keys -t "$SESSION" "/quit"
  sleep 2
  tmux kill-session -t "$SESSION" 2>/dev/null
else
  echo "driver: python3 pty (tmux not found on PATH)"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "HARNESS FAILURE: neither tmux nor python3 available" >&2; exit 2
  fi
  OUT="$(python3 "$REPO_ROOT/scripts/tui-smoke-pty.py" "$REPO_ROOT" "$TIMEOUT_SECS")" \
    || { echo "HARNESS FAILURE: pty driver exited nonzero" >&2; exit 2; }
  STARTUP="$(printf '%s' "$OUT" | sed -n '/---STARTUP---/,/---CMDOUT---/p' | grep -v -- '---')"
  CMDOUT="$(printf '%s' "$OUT" | sed -n '/---CMDOUT---/,$p' | grep -v -- '---')"
fi

PI_VER="$(pi --version 2>/dev/null || echo unknown)"
echo "assert 1: TUI chrome rendered (status line with repo path)"
echo "$STARTUP" | grep -q "pi-extensions" || fail_assert "no repo path in startup capture"
echo "PASS: repo path present in TUI status line"

echo "assert 2: extension-provided resources loaded (Skills/Prompts from packages)"
if ! echo "$STARTUP" | grep -q "\[Skills\]"; then fail_assert "no [Skills] section in startup capture"; fi
if ! echo "$STARTUP" | grep -q "\[Prompts\]"; then fail_assert "no [Prompts] section in startup capture"; fi
echo "PASS: [Skills]/[Prompts] extension resources rendered"

echo "assert 3: built-in slash command /changelog executed (shows version ${PI_VER})"
echo "$CMDOUT" | grep -q "${PI_VER}" || fail_assert "version '${PI_VER}' not found after /changelog"
echo "PASS: /changelog output shows ${PI_VER}"

echo "tui-smoke: ALL PASS"
exit 0
