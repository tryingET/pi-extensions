#!/usr/bin/env bash
# summary: "verify the installed activity-strip artifact headlessly without model or provider credentials"
# read_when:
#   - "changing packed activity-strip registration, headless doctor behavior, or release isolation"
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR must be set by release-check.sh}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC must be set by release-check.sh}"
: "${INSTALLED_PACKAGE_ROOT:?INSTALLED_PACKAGE_ROOT must be set by release-check.sh}"
: "${TMPDIR:?TMPDIR must be set by release-check.sh}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
INSTALLED_PACKAGE_ROOT="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$INSTALLED_PACKAGE_ROOT")"
case "$INSTALLED_PACKAGE_ROOT" in
  "$PI_CODING_AGENT_DIR"/*) ;;
  *) echo "installed activity-strip artifact escaped isolated Pi state: $INSTALLED_PACKAGE_ROOT" >&2; exit 1 ;;
esac

HEADLESS_DOCTOR_FILE="$PI_CODING_AGENT_DIR/activity-strip-headless-doctor.json"

echo "== installed headless doctor compatibility check"
set +e
env -u WAYLAND_DISPLAY -u DISPLAY -u NIRI_SOCKET XDG_SESSION_TYPE= \
  node "$INSTALLED_PACKAGE_ROOT/bin/pi-activity-strip.mjs" doctor --json >"$HEADLESS_DOCTOR_FILE"
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
if (payload.ok !== false) throw new Error("expected headless doctor payload.ok=false");
if (!payload.blockers?.some((entry) => /graphical display session/i.test(String(entry)))) {
  throw new Error("expected missing graphical display blocker");
}
console.log("installed headless doctor fail-closed check OK");
NODE

echo "== installed extension registration smoke"
PI_ACTIVITY_STRIP_AUTO_START=0 INSTALLED_PACKAGE_ROOT="$INSTALLED_PACKAGE_ROOT" node --input-type=module <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.env.INSTALLED_PACKAGE_ROOT;
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.ok(pkg.pi?.extensions?.includes("./extensions/activity-strip.js"));
for (const required of ["extensions/activity-strip.js", "bin/pi-activity-strip.mjs", "src/client/session-telemetry.mjs"]) {
  assert.ok(fs.existsSync(path.join(root, required)), `packed artifact missing ${required}`);
}
const module = await import(`${pathToFileURL(path.join(root, "extensions/activity-strip.js")).href}?release=${Date.now()}`);
assert.equal(typeof module.default, "function");
const commands = new Map();
const events = new Map();
module.default({
  registerCommand(name, command) { commands.set(name, command); },
  on(name, handler) { events.set(name, [...(events.get(name) ?? []), handler]); },
});
assert.equal(typeof commands.get("activity-strip")?.handler, "function");
assert.equal(typeof commands.get("activity-strip-stop")?.handler, "function");
for (const event of ["session_start", "before_agent_start", "turn_start", "message_update", "tool_execution_start", "tool_execution_update", "tool_execution_end", "turn_end", "agent_settled", "session_shutdown"]) {
  assert.ok(events.has(event), `packed extension did not register ${event}`);
}
console.log("packed activity-strip commands and lifecycle handlers registered OK");
NODE

echo "release smoke done: installed artifact from $PACKAGE_SPEC passed provider-free headless and registration proofs."
