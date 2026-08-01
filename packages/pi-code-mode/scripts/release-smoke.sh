#!/usr/bin/env bash
# ---
# summary: "Smoke-test the installed pi-code-mode tarball through an isolated Pi runtime."
# read_when:
#   - "Verifying packed-artifact installation, extension loading, or Python/JavaScript eval execution."
# ---
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${NPM_CONFIG_PREFIX:?NPM_CONFIG_PREFIX is required}"
: "${NPM_CONFIG_CACHE:?NPM_CONFIG_CACHE is required}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required}"
: "${INSTALLED_PACKAGE_ROOT:?INSTALLED_PACKAGE_ROOT is required}"
: "${TMPDIR:?TMPDIR must point to managed disk-backed scratch storage}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pi >/dev/null 2>&1; then
  echo "pi CLI not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$PI_CODING_AGENT_DIR/settings.json" ]]; then
  echo "Isolated Pi settings missing: $PI_CODING_AGENT_DIR/settings.json" >&2
  exit 1
fi

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
INSTALLED_PACKAGE_ROOT="$(realpath "$INSTALLED_PACKAGE_ROOT")"

case "$INSTALLED_PACKAGE_ROOT" in
  "$(realpath "$PI_CODING_AGENT_DIR")"/* | "$(realpath "$NPM_CONFIG_PREFIX")"/*) ;;
  *)
    echo "Installed package root escaped isolated release roots: $INSTALLED_PACKAGE_ROOT" >&2
    exit 1
    ;;
esac

node --input-type=module - \
  "$PI_CODING_AGENT_DIR/settings.json" \
  "$PACKAGE_SPEC" \
  "$INSTALLED_PACKAGE_ROOT" \
  "$PACKAGE_NAME" \
  "$PACKAGE_VERSION" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [settingsPath, packageSpec, packageRoot, packageName, packageVersion] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const packages = Array.isArray(settings.packages) ? settings.packages : [];
assert.ok(
  packages.some((entry) => entry === packageSpec || entry?.source === packageSpec),
  `Missing ${packageSpec} in isolated Pi settings`,
);

const packageJsonPath = path.join(packageRoot, "package.json");
assert.ok(fs.existsSync(packageJsonPath), `Installed package.json missing: ${packageJsonPath}`);
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
assert.equal(pkg.name, packageName, "Installed package name mismatch");
assert.equal(pkg.version, packageVersion, "Installed package version mismatch");
assert.ok(
  pkg.pi?.extensions?.includes("./extensions/eval.ts"),
  "Installed package does not declare ./extensions/eval.ts",
);
for (const requiredPath of [
  "extensions/eval.ts",
  "src/extension.ts",
  "runtime/javascript-kernel.mjs",
  "runtime/python-kernel.py",
  "runtime/protocol-broker.mjs",
]) {
  assert.ok(fs.existsSync(path.join(packageRoot, requiredPath)), `Installed package missing ${requiredPath}`);
}
console.log(`installed artifact OK: ${packageName}@${packageVersion}`);
NODE

SMOKE_DIR=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" && -n "$SMOKE_DIR" && -d "$SMOKE_DIR" ]]; then
    rm -rf "$SMOKE_DIR"
  fi
}
trap cleanup EXIT

SMOKE_DIR="$(mktemp -d "$TMPDIR/pi-code-mode-release-smoke.XXXXXX")"
WRAPPER_PATH="$SMOKE_DIR/eval-packed-smoke.ts"
JAVASCRIPT_OUTPUT="$SMOKE_DIR/javascript.jsonl"
PYTHON_OUTPUT="$SMOKE_DIR/python.jsonl"

node --input-type=module - "$WRAPPER_PATH" "$INSTALLED_PACKAGE_ROOT/src/extension.ts" <<'NODE'
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const [wrapperPath, extensionPath] = process.argv.slice(2);
const extensionUrl = pathToFileURL(extensionPath).href;
fs.writeFileSync(
  wrapperPath,
  `import { createCodeModeExtension } from ${JSON.stringify(extensionUrl)};\n` +
    "export default createCodeModeExtension({ allowNonInteractive: true });\n",
  "utf8",
);
NODE

run_eval_smoke() {
  local prompt="$1"
  local output_path="$2"
  (
    cd "$SMOKE_DIR"
    PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" \
      NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" \
      NPM_CONFIG_CACHE="$NPM_CONFIG_CACHE" \
      npm_config_prefix="$NPM_CONFIG_PREFIX" \
      npm_config_cache="$NPM_CONFIG_CACHE" \
      pi --no-extensions \
        --extension "$WRAPPER_PATH" \
        --no-skills --no-prompt-templates --no-context-files --no-themes \
        --no-session --tools eval --mode json --approve \
        -p "$prompt"
  ) >"$output_path"
}

echo "== packed JavaScript eval through isolated Pi"
run_eval_smoke \
  "Use eval exactly once with JavaScript and no other tool. Return {smoke: 'packed-javascript', value: 6 * 7}. After a successful result, reply with exactly PACKED_JS_OK." \
  "$JAVASCRIPT_OUTPUT"

echo "== packed Python eval through isolated Pi"
run_eval_smoke \
  "Use eval exactly once with Python and no other tool. The final expression must be {'smoke': 'packed-python', 'value': 6 * 7}. After a successful result, reply with exactly PACKED_PY_OK." \
  "$PYTHON_OUTPUT"

node - "$JAVASCRIPT_OUTPUT" "javascript" "packed-javascript" "PACKED_JS_OK" \
  "$PYTHON_OUTPUT" "python" "packed-python" "PACKED_PY_OK" <<'NODE'
const fs = require("node:fs");

function textContent(message) {
  return (message?.content ?? [])
    .filter((entry) => entry?.type === "text" && typeof entry.text === "string")
    .map((entry) => entry.text)
    .join("");
}

function assertSmoke(outputPath, language, resultMarker, finalMarker) {
  const events = fs
    .readFileSync(outputPath, "utf8")
    .split(/\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const evalEnds = events.filter(
    (event) => event.type === "tool_execution_end" && event.toolName === "eval",
  );
  if (evalEnds.length !== 1 || evalEnds[0].isError) {
    const terminalAssistant = events
      .filter((event) => event.type === "message_end" && event.message?.role === "assistant")
      .at(-1)?.message;
    const terminalFailure = terminalAssistant?.errorMessage
      ? `; assistant ${terminalAssistant.stopReason ?? "error"}: ${terminalAssistant.errorMessage}`
      : "";
    throw new Error(`${outputPath}: expected one successful eval execution${terminalFailure}`);
  }

  const evalEnd = evalEnds[0];
  if (evalEnd.result?.details?.ok !== true || evalEnd.result?.details?.language !== language) {
    throw new Error(`${outputPath}: eval details did not confirm successful ${language} execution`);
  }
  const resultText = textContent(evalEnd.result);
  if (!resultText.includes(resultMarker) || !resultText.includes('"value": 42')) {
    throw new Error(`${outputPath}: eval result did not contain ${resultMarker} with value 42`);
  }

  const finalMessages = events.filter(
    (event) =>
      event.type === "message_end" &&
      event.message?.role === "assistant" &&
      event.message?.stopReason === "stop",
  );
  const finalText = textContent(finalMessages.at(-1)?.message).trim();
  if (finalText !== finalMarker) {
    throw new Error(`${outputPath}: final assistant response was not exactly ${finalMarker}`);
  }
}

const [jsPath, jsLanguage, jsResult, jsFinal, pyPath, pyLanguage, pyResult, pyFinal] =
  process.argv.slice(2);
assertSmoke(jsPath, jsLanguage, jsResult, jsFinal);
assertSmoke(pyPath, pyLanguage, pyResult, pyFinal);
console.log("packed JavaScript and Python eval smokes passed");
NODE

echo "release smoke done: installed $PACKAGE_NAME@$PACKAGE_VERSION from $PACKAGE_SPEC and executed packed JavaScript and Python eval through isolated Pi."
