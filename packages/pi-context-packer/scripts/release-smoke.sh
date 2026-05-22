#!/usr/bin/env bash
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required so release smoke cannot touch operator pi settings}"
: "${NPM_CONFIG_PREFIX:?NPM_CONFIG_PREFIX is required so release smoke cannot touch global npm packages}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required; release-check.sh sets it to the packed tarball spec}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v pi >/dev/null 2>&1; then
  echo "pi CLI not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$PI_CODING_AGENT_DIR/settings.json" ]]; then
  echo "Isolated pi settings missing: $PI_CODING_AGENT_DIR/settings.json" >&2
  exit 1
fi

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
GLOBAL_NODE_MODULES="$(NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" npm_config_prefix="$NPM_CONFIG_PREFIX" npm root -g)"
INSTALLED_PACKAGE_ROOT="$GLOBAL_NODE_MODULES/$PACKAGE_NAME"

case "$INSTALLED_PACKAGE_ROOT" in
  "$NPM_CONFIG_PREFIX"/*) ;;
  *)
    echo "Installed package root escaped isolated npm prefix: $INSTALLED_PACKAGE_ROOT" >&2
    exit 1
    ;;
esac

echo "== context-packer installed artifact smoke"
node --input-type=module - "$PI_CODING_AGENT_DIR/settings.json" "$PACKAGE_SPEC" "$INSTALLED_PACKAGE_ROOT" "$PACKAGE_NAME" "$PACKAGE_VERSION" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const [settingsPath, packageSpec, packageRoot, packageName, packageVersion] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const packages = Array.isArray(settings.packages) ? settings.packages : [];
assert.ok(
  packages.some((entry) => entry === packageSpec || entry?.source === packageSpec),
  `Missing ${packageSpec} in settings.packages`,
);

const packageJsonPath = path.join(packageRoot, "package.json");
const extensionPath = path.join(packageRoot, "extensions", "context-pack.ts");
assert.ok(fs.existsSync(packageJsonPath), `Installed package.json missing: ${packageJsonPath}`);
assert.ok(fs.existsSync(extensionPath), `Installed extension missing: ${extensionPath}`);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
assert.equal(pkg.name, packageName, "Installed package name mismatch");
assert.equal(pkg.version, packageVersion, "Installed package version mismatch");
assert.ok(
  pkg.pi?.extensions?.includes("./extensions/context-pack.ts"),
  "Installed package missing ./extensions/context-pack.ts in pi.extensions",
);

for (const requiredPath of ["src/context-plan.js", "src/context-pack.js", "src/dogfood-observation.js"]) {
  assert.ok(fs.existsSync(path.join(packageRoot, requiredPath)), `Installed package missing ${requiredPath}`);
}
console.log("installed artifact OK");
NODE

SMOKE_DIR=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" && -n "$SMOKE_DIR" && -d "$SMOKE_DIR" ]]; then
    rm -rf "$SMOKE_DIR"
  fi
}
trap cleanup EXIT

SMOKE_DIR="$(mktemp -d /tmp/pi-context-packer-release-smoke-XXXXXX)"
SMOKE_EXTENSION="$SMOKE_DIR/assert-context-packer-release-smoke.ts"
SMOKE_OUTPUT="$SMOKE_DIR/pi-smoke.out"

cat > "$SMOKE_EXTENSION" <<'EOF'
export default function(pi) {
  pi.registerCommand("assert_context_packer_release_smoke", {
    description: "Assert installed context-packer extension registration",
    handler: async () => {
      const tools = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
      const commands = new Map(pi.getCommands().map((command) => [command.name, command]));
      const expectedTools = [
        "context_plan",
        "context_pack",
        "context_dogfood_evaluate",
        "context_dogfood_summarize",
      ];

      for (const name of expectedTools) {
        const tool = tools.get(name);
        if (!tool) throw new Error(`${name} tool not registered`);
        if (tool.sourceInfo?.source === "builtin" || tool.sourceInfo?.source === "sdk") {
          throw new Error(`${name} registered from unexpected source: ${tool.sourceInfo?.source}`);
        }
        if (!tool.description || !tool.parameters) {
          throw new Error(`${name} missing description or parameters`);
        }
      }

      const command = commands.get("context-pack");
      if (!command) throw new Error("context-pack command not registered");
      if (command.source !== "extension") {
        throw new Error(`context-pack command registered from unexpected source: ${command.source}`);
      }

      console.log("context-packer runtime registration OK");
    },
  });
}
EOF

echo "== context-packer installed runtime registration smoke"
PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" \
  pi --offline --no-session --no-builtin-tools --no-skills --no-prompt-templates --no-context-files --no-themes \
  -e "$INSTALLED_PACKAGE_ROOT" \
  -e "$SMOKE_EXTENSION" \
  -p "/assert_context_packer_release_smoke" >"$SMOKE_OUTPUT" 2>&1
cat "$SMOKE_OUTPUT"

if ! grep -q "context-packer runtime registration OK" "$SMOKE_OUTPUT"; then
  echo "Runtime registration smoke did not report success." >&2
  exit 1
fi

echo "release smoke done: installed $PACKAGE_NAME@$PACKAGE_VERSION from $PACKAGE_SPEC and verified context-packer command/tool registration through Pi runtime."
