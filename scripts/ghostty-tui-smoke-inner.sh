#!/usr/bin/env bash
# Inner command for ghostty-tui-smoke.sh. Runs INSIDE the ghostty window.
# Launches pi TUI under timeout in the repo cwd, then writes bounded results.
# NOTE: pi's stdio must stay attached to the terminal — redirecting stdout
# makes it non-tty and pi exits immediately.
set -u
REPO_ROOT="$1"; RESULTS="$2"
: > "$RESULTS"
echo "inner_started $(date -Is)" >> "$RESULTS"
cd "$REPO_ROOT" || { echo "cd_failed" >> "$RESULTS"; exit 0; }
START=$(date +%s)
timeout -k 5 --signal=INT 30 pi
RC=$?
END=$(date +%s)
echo "pi_exit $RC" >> "$RESULTS"
echo "pi_duration $((END-START))" >> "$RESULTS"
if [ "$RC" -eq 0 ] || [ "$RC" -eq 124 ] || [ "$RC" -eq 137 ]; then
  if [ $((END-START)) -ge 5 ]; then
    echo "marker pi_tui_completed_clean" >> "$RESULTS"
  else
    echo "marker pi_exited_too_fast" >> "$RESULTS"
  fi
fi
echo "inner_done" >> "$RESULTS"
