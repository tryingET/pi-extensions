#!/usr/bin/env bash

# summary: "Exercises the installed activity-strip package in forced-headless doctor and Pi session smoke scenarios."
# read_when:
#   - "Changing release-time headless compatibility assertions or installed-extension smoke expectations."
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR must be set by release-check.sh}"

if ! command -v pi >/dev/null 2>&1; then
  echo "pi CLI not found in PATH" >&2
  exit 1
fi

OUTPUT_FILE="$(mktemp)"
HEADLESS_DOCTOR_FILE="$(mktemp)"
cleanup() {
  rm -f "$OUTPUT_FILE" "$HEADLESS_DOCTOR_FILE"
}
trap cleanup EXIT

echo "== headless doctor compatibility check"
set +e
env -u WAYLAND_DISPLAY -u DISPLAY -u NIRI_SOCKET XDG_SESSION_TYPE= \
  node ./bin/pi-activity-strip.mjs doctor --json >"$HEADLESS_DOCTOR_FILE"
HEADLESS_DOCTOR_EXIT=$?
set -e

if [[ "$HEADLESS_DOCTOR_EXIT" -eq 0 ]]; then
  echo "headless doctor should fail closed without a graphical session" >&2
  cat "$HEADLESS_DOCTOR_FILE" >&2
  exit 1
fi

node - "$HEADLESS_DOCTOR_FILE" <<'NODE'
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (payload.ok !== false) {
  console.error("Expected doctor payload.ok=false in forced headless mode.");
  process.exit(1);
}
if (!Array.isArray(payload.blockers) || !payload.blockers.some((entry) => /graphical display session/i.test(String(entry)))) {
  console.error("Expected doctor blockers to mention the missing graphical display session.");
  process.exit(1);
}
console.log("headless doctor fail-closed check OK");
NODE

PI_ACTIVITY_STRIP_AUTO_START=0 \
PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" \
pi -p "Use the bash tool exactly once to run 'printf release-strip-smoke'. After the tool returns, reply with only STRIP_OK." \
  >"$OUTPUT_FILE"

if ! grep -q "STRIP_OK" "$OUTPUT_FILE"; then
  echo "release smoke did not produce STRIP_OK" >&2
  cat "$OUTPUT_FILE" >&2
  exit 1
fi

echo "release smoke OK"
