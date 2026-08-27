#!/usr/bin/env bash
# summary: "execute JavaScript and Python through the installed eval-kernel artifact without provider credentials"
# read_when:
#   - "verifying packed eval registration, kernel execution, or provider-free release isolation"
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required}"
: "${INSTALLED_PACKAGE_ROOT:?INSTALLED_PACKAGE_ROOT is required}"
: "${TMPDIR:?TMPDIR is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(git -C "$ROOT_DIR" rev-parse --show-toplevel)"
cd "$ROOT_DIR"

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
INSTALLED_PACKAGE_ROOT="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$INSTALLED_PACKAGE_ROOT")"
case "$INSTALLED_PACKAGE_ROOT" in
  "$PI_CODING_AGENT_DIR"/*) ;;
  *) echo "installed eval artifact escaped isolated Pi state: $INSTALLED_PACKAGE_ROOT" >&2; exit 1 ;;
esac

TSX_BIN=""
for candidate in \
  "$ROOT_DIR/node_modules/.bin/tsx" \
  "$MONOREPO_ROOT/node_modules/.bin/tsx" \
  "$MONOREPO_ROOT"/packages/*/node_modules/.bin/tsx \
  "$MONOREPO_ROOT"/packages/*/*/node_modules/.bin/tsx; do
  if [[ -x "$candidate" ]]; then TSX_BIN="$candidate"; break; fi
done
if [[ -z "$TSX_BIN" ]]; then
  echo "release smoke requires a repo-local tsx binary" >&2
  exit 1
fi

PACKAGE_NAME="$PACKAGE_NAME" PACKAGE_VERSION="$PACKAGE_VERSION" \
INSTALLED_PACKAGE_ROOT="$INSTALLED_PACKAGE_ROOT" "$TSX_BIN" --eval '
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const root = process.env.INSTALLED_PACKAGE_ROOT;
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.name, process.env.PACKAGE_NAME);
  assert.equal(pkg.version, process.env.PACKAGE_VERSION);
  assert.ok(pkg.pi?.extensions?.includes("./extensions/eval.ts"));
  for (const required of [
    "extensions/eval.ts",
    "src/extension.ts",
    "runtime/javascript-kernel.mjs",
    "runtime/python-kernel.py",
    "runtime/protocol-broker.mjs",
  ]) assert.ok(fs.existsSync(path.join(root, required)), `packed artifact missing ${required}`);

  const module = await import(`${pathToFileURL(path.join(root, "extensions/eval.ts")).href}?release=${Date.now()}`);
  assert.equal(typeof module.createCodeModeExtension, "function");
  const tools = new Map();
  const commands = new Map();
  const events = new Map();
  module.createCodeModeExtension({ requireConfirmation: false })({
    registerTool(tool) { tools.set(tool.name, tool); },
    registerCommand(name, command) { commands.set(name, command); },
    on(name, handler) { events.set(name, [...(events.get(name) || []), handler]); },
  });
  assert.ok(commands.has("code-mode"));
  assert.ok(commands.has("eval-reset"));
  const tool = tools.get("eval");
  assert.ok(tool, "packed extension did not register eval");
  const context = { cwd: process.cwd(), hasUI: false, ui: { confirm: async () => true, notify() {} } };

  const cases = [
    ["javascript", "return { smoke: \"packed-javascript\", value: 6 * 7 }", "packed-javascript"],
    ["python", "{\"smoke\": \"packed-python\", \"value\": 6 * 7}", "packed-python"],
  ];
  for (const [language, code, marker] of cases) {
    const result = await tool.execute(`release-${language}`, { language, code }, undefined, undefined, context);
    assert.equal(result.details?.ok, true, `${language} eval did not report ok`);
    assert.equal(result.details?.language, language);
    const text = (result.content || []).map((entry) => entry.text || "").join("\n");
    assert.match(text, new RegExp(marker));
    assert.match(text, /42/);
  }
  for (const handler of events.get("session_shutdown") || []) await handler();
  console.log("packed provider-free JavaScript and Python eval execution OK");
})().catch((error) => { console.error(error); process.exit(1); });
'

echo "release smoke done: installed $PACKAGE_NAME@$PACKAGE_VERSION from $PACKAGE_SPEC and directly executed packed JavaScript/Python eval without model or provider credentials."
