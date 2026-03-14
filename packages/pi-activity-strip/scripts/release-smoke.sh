#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR must be set by release-check.sh}"

if ! command -v pi >/dev/null 2>&1; then
  echo "pi CLI not found in PATH" >&2
  exit 1
fi

OUTPUT_FILE="$(mktemp)"
cleanup() {
  rm -f "$OUTPUT_FILE"
}
trap cleanup EXIT

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
