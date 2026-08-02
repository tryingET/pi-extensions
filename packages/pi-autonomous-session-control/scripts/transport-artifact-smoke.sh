#!/usr/bin/env bash
# Verify the packed transport helper from a real node_modules path without an ambient TS loader.
set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $0 <package-tarball>" >&2; exit 2; }
TARBALL_PATH="$(realpath "$1")"
[[ -f "$TARBALL_PATH" ]] || { echo "tarball not found: $TARBALL_PATH" >&2; exit 2; }

NODE_BIN="$(command -v node)"
[[ -x "$NODE_BIN" ]] || { echo "node is required" >&2; exit 1; }
TMP_PARENT="${TMPDIR:-$(dirname "$TARBALL_PATH")}"
SMOKE_ROOT="$(mktemp -d "$TMP_PARENT/asc-packed-transport-XXXXXX")"
cleanup() {
  rm -rf "$SMOKE_ROOT"
}
trap cleanup EXIT

PACKAGE_ROOT="$SMOKE_ROOT/node_modules/@tryinget/pi-autonomous-session-control"
FAKE_BIN="$SMOKE_ROOT/bin"
AGENT_DIR="$SMOKE_ROOT/agent"
HOME_DIR="$SMOKE_ROOT/home"
RUNTIME_TMP="$SMOKE_ROOT/tmp"
mkdir -p "$PACKAGE_ROOT" "$FAKE_BIN" "$AGENT_DIR" "$HOME_DIR" "$RUNTIME_TMP"
tar -xzf "$TARBALL_PATH" --strip-components=1 -C "$PACKAGE_ROOT"

PUBLIC_EXECUTION="$PACKAGE_ROOT/dist/execution.js"
PUBLIC_EXECUTION_TYPES="$PACKAGE_ROOT/dist/execution.d.ts"
HELPER="$PACKAGE_ROOT/dist/extensions/self/subagent-pi-json-filter.js"
for required in "$PUBLIC_EXECUTION" "$PUBLIC_EXECUTION_TYPES" "$HELPER"; do
  [[ -f "$required" ]] || { echo "packed artifact missing $required" >&2; exit 1; }
done
[[ ! -e "$PACKAGE_ROOT/dist/extensions/self/subagent-pi-json-filter.ts" ]] || {
  echo "packed transport must not execute TypeScript" >&2
  exit 1
}

(
  cd "$SMOKE_ROOT"
  env -i \
    PATH="$(dirname "$NODE_BIN"):/usr/bin:/bin" \
    HOME="$HOME_DIR" \
    TMPDIR="$RUNTIME_TMP" \
    "$NODE_BIN" --input-type=module <<'NODE'
import assert from "node:assert/strict";
import { createAscExecutionRuntime } from "@tryinget/pi-autonomous-session-control/execution";
assert.equal(typeof createAscExecutionRuntime, "function");
NODE
)

cat > "$FAKE_BIN/pi" <<'FAKE_PI'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--version" ]]; then
  printf '%s\n' '0.83.0'
  exit 0
fi
printf '%s\n' \
  '{"type":"agent_start"}' \
  '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"packed helper ok"}],"stopReason":"stop"}}' \
  '{"type":"agent_settled"}'
FAKE_PI
chmod 700 "$FAKE_BIN/pi"

OUTPUT="$({
  env -i \
    PATH="$FAKE_BIN:$(dirname "$NODE_BIN"):/usr/bin:/bin" \
    HOME="$HOME_DIR" \
    TMPDIR="$RUNTIME_TMP" \
    PI_CODING_AGENT_DIR="$AGENT_DIR" \
    "$NODE_BIN" "$HELPER" \
      --cwd "$SMOKE_ROOT" \
      --model test/model \
      --tools read \
      --thinking off \
      --session-file "$SMOKE_ROOT/session.jsonl" \
      --objective "packed transport smoke"
} 2>&1)"
printf '%s\n' "$OUTPUT"

OUTPUT="$OUTPUT" "$NODE_BIN" --input-type=module <<'NODE'
import assert from "node:assert/strict";
const lines = process.env.OUTPUT.split("\n").filter(Boolean).map((line) => JSON.parse(line));
assert.equal(lines.filter((event) => event.type === "raw_child_spawn_intent").length, 1);
assert.equal(lines.filter((event) => event.type === "transport_ready").length, 1);
assert.equal(lines.find((event) => event.type === "transport_ready")?.piVersion, "0.83.0");
assert.equal(lines.find((event) => event.type === "assistant_message_end")?.text, "packed helper ok");
assert.equal(lines.filter((event) => event.type === "agent_settled").length, 1);
NODE

echo "packed transport smoke OK: JavaScript helper executed from node_modules without NODE_OPTIONS"
