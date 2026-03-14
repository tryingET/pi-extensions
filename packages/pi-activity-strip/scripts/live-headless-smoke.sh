#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pi >/dev/null 2>&1; then
  echo "pi CLI not found in PATH" >&2
  exit 1
fi

KEEP_RUNNING="${PI_ACTIVITY_STRIP_KEEP_RUNNING:-0}"
OUTPUT_FILE="$(mktemp)"
SNAPSHOT_FILE="$(mktemp)"
cleanup() {
  rm -f "$OUTPUT_FILE" "$SNAPSHOT_FILE"
  if [[ "$KEEP_RUNNING" != "1" ]]; then
    node ./bin/pi-activity-strip.mjs stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

node ./bin/pi-activity-strip.mjs open >/dev/null
node ./bin/pi-activity-strip.mjs status >/dev/null

PI_ACTIVITY_STRIP_AUTO_START=0 \
pi --no-extensions -e "$ROOT_DIR" -p "Use the bash tool exactly once to run \"bash -lc 'echo strip-live-smoke; sleep 2; echo strip-live-smoke-done'\". After the tool returns, reply with only STRIP_OK." \
  >"$OUTPUT_FILE" &
PI_PID=$!

observed=0
for _ in $(seq 1 40); do
  if node ./bin/pi-activity-strip.mjs snapshot >"$SNAPSHOT_FILE" 2>/dev/null; then
    if node -e 'const fs=require("node:fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.exit(Array.isArray(data.sessions)&&data.sessions.length>0?0:1)' "$SNAPSHOT_FILE"; then
      observed=1
      break
    fi
  fi
  sleep 0.25
done

wait "$PI_PID"

if ! grep -q "STRIP_OK" "$OUTPUT_FILE"; then
  echo "pi headless smoke did not produce STRIP_OK" >&2
  cat "$OUTPUT_FILE" >&2
  exit 1
fi

if [[ "$observed" != "1" ]]; then
  echo "activity strip broker never observed a live pi session during the smoke run" >&2
  exit 1
fi

echo "live headless smoke OK"
