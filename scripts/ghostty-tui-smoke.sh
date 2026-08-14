#!/usr/bin/env bash
# Ghostty-driven TUI smoke harness for pi-extensions.
#
# Covers paths scripts/tui-smoke.sh cannot reach: pi TUI mode inside a real
# Ghostty terminal window on the live graphical desktop (real emulator + real
# user D-Bus session), plus the Ghostty sidequest D-Bus companion preflight.
#
# Never kills/restarts any running ghostty; spawns one new ghostty instance
# whose window closes itself when its bounded child command exits.
#
# Environment: works from a headless/tty agent session by inheriting the
# graphical session env (DISPLAY/WAYLAND_DISPLAY) from systemd --user if not set.
#
# Exit codes: 0=pass, 1=assertion failed, 2=harness failure.
set -u
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMEOUT_SECS="${GHOSTTY_TUI_SMOKE_TIMEOUT:-90}"
RESULTS="$(mktemp "${TMPDIR:-/tmp}/ghostty-tui-smoke.XXXXXX")"
SPAWN_PID=""

cleanup() {
  # Bounded wait for the spawned ghostty to exit on its own; then escalate
  # only against OUR spawned instance (never the running operator ghostty).
  if [ -n "$SPAWN_PID" ] && kill -0 "$SPAWN_PID" 2>/dev/null; then
    for _ in $(seq 1 10); do kill -0 "$SPAWN_PID" 2>/dev/null || break; sleep 1; done
    kill -0 "$SPAWN_PID" 2>/dev/null && kill "$SPAWN_PID" 2>/dev/null
  fi
  if [ -n "${GHOSTTY_TUI_SMOKE_KEEP:-}" ]; then echo "results kept: $RESULTS" >&2; else rm -f "$RESULTS"; fi
}
trap cleanup EXIT

fail_assert() { echo "FAIL: $1"; exit 1; }
harness_fail() { echo "HARNESS FAILURE: $1" >&2; exit 2; }

command -v ghostty >/dev/null 2>&1 || harness_fail "ghostty not on PATH"
command -v timeout >/dev/null 2>&1 || harness_fail "timeout not on PATH"
command -v pi >/dev/null 2>&1 || harness_fail "pi not on PATH"

# Inherit graphical session env when running from a tty/agent session.
if [ -z "${DISPLAY:-}" ] || [ -z "${WAYLAND_DISPLAY:-}" ]; then
  eval "$(systemctl --user show-environment 2>/dev/null | grep -E '^(DISPLAY|WAYLAND_DISPLAY)=' | sed 's/^/export /')" || true
fi
[ -n "${DISPLAY:-}" ] || harness_fail "no graphical session (DISPLAY) discoverable; cannot spawn a ghostty window"

echo "== Ghostty TUI smoke (pi-extensions) =="

# --- Assert 1: Ghostty D-Bus name resolvable on the live user bus ---
echo "assert 1: ghostty D-Bus name com.mitchellh.ghostty resolvable"
busctl --user list 2>/dev/null | grep -q "com.mitchellh.ghostty" || fail_assert "com.mitchellh.ghostty not on user bus"
echo "PASS: com.mitchellh.ghostty present on user bus"

# --- Assert 2: sidequest companion D-Bus service active ---
echo "assert 2: sidequest companion service active"
STATE="$(systemctl --user is-active app-com.tryinget.ghosttysidequest.service 2>/dev/null || echo inactive)"
[ "$STATE" = "active" ] || fail_assert "app-com.tryinget.ghosttysidequest.service is '$STATE' (expected active)"
echo "PASS: app-com.tryinget.ghosttysidequest.service active"

# --- Assert 3: pi TUI runs in a new ghostty window and completes bounded ---
echo "assert 3: pi TUI launches in a new ghostty window and completes a bounded run"
ghostty --gtk-single-instance=false -e bash "$REPO_ROOT/scripts/ghostty-tui-smoke-inner.sh" "$REPO_ROOT" "$RESULTS" \
  >/dev/null 2>&1 &
SPAWN_PID=$!

# Wait for the inner script to finish (inner timeout 30s bounds pi runtime).
DEADLINE=$(( $(date +%s) + TIMEOUT_SECS ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  grep -q "^inner_done$" "$RESULTS" 2>/dev/null && break
  kill -0 "$SPAWN_PID" 2>/dev/null || break
  sleep 2
done
grep -q "^inner_done$" "$RESULTS" || harness_fail "inner script did not finish within ${TIMEOUT_SECS}s"

grep -q "^inner_started " "$RESULTS" || fail_assert "inner script never started (ghostty window may not have launched)"
grep -q "^cd_failed$" "$RESULTS" && harness_fail "inner script could not cd to repo"
RC="$(sed -n 's/^pi_exit //p' "$RESULTS")"
DUR="$(sed -n 's/^pi_duration //p' "$RESULTS")"
case "$RC" in 0|124|137) ;; *) fail_assert "pi exited with unexpected code $RC";; esac
grep -q "^marker pi_tui_completed_clean$" "$RESULTS" || fail_assert "clean-completion marker missing"
echo "PASS: pi TUI ran in new ghostty window (exit=$RC, ${DUR}s, bounded 30s)"

# --- Assert 4: spawned window closed itself (ghostty exits with its child) ---
echo "assert 4: spawned ghostty window closed after bounded run"
DEADLINE=$(( $(date +%s) + 15 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  kill -0 "$SPAWN_PID" 2>/dev/null || break
  sleep 1
done
if kill -0 "$SPAWN_PID" 2>/dev/null; then
  fail_assert "spawned ghostty (pid $SPAWN_PID) still running after child exit; window not closed"
fi
echo "PASS: spawned ghostty exited; window closed"

echo "RESULT: all assertions passed"
