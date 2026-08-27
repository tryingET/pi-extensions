#!/usr/bin/env bash
# summary: "prove the packed agent-registry artifact registers and executes its read-only registry tool"
# read_when:
#   - "changing packed artifact installation, extension registration, or agent_registry runtime behavior"
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${NPM_CONFIG_PREFIX:?NPM_CONFIG_PREFIX is required}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required}"
: "${TMPDIR:?TMPDIR is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(git -C "$ROOT_DIR" rev-parse --show-toplevel)"
cd "$ROOT_DIR"

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
LEGACY_NODE_MODULES="$(NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" npm_config_prefix="$NPM_CONFIG_PREFIX" npm root -g)"
MANAGED_NODE_MODULES="$PI_CODING_AGENT_DIR/npm/node_modules"

# The tarball correctly declares Pi host libraries as peers. Supply the smoke
# with this package's pinned development peers without mutating operator-global npm state.
HOST_PEER_ROOT="$ROOT_DIR/node_modules/@earendil-works"
ISOLATED_PEER_ROOT="$MANAGED_NODE_MODULES/@earendil-works"
mkdir -p "$ISOLATED_PEER_ROOT"
for peer in pi-ai pi-coding-agent; do
  if [[ ! -d "$HOST_PEER_ROOT/$peer" ]]; then
    echo "release smoke host peer missing: $HOST_PEER_ROOT/$peer" >&2
    exit 1
  fi
  ln -sfn "$HOST_PEER_ROOT/$peer" "$ISOLATED_PEER_ROOT/$peer"
done

TSX_BIN=""
for candidate in \
  "$ROOT_DIR/node_modules/.bin/tsx" \
  "$MONOREPO_ROOT/node_modules/.bin/tsx" \
  "$MONOREPO_ROOT"/packages/*/node_modules/.bin/tsx \
  "$MONOREPO_ROOT"/packages/*/*/node_modules/.bin/tsx; do
  if [[ -x "$candidate" ]]; then
    TSX_BIN="$candidate"
    break
  fi
done
if [[ -z "$TSX_BIN" ]]; then
  echo "release smoke requires a repo-local tsx binary" >&2
  exit 1
fi

INSTALLED_PACKAGE_ROOT="$(node --input-type=module - \
  "$PACKAGE_NAME" "$PACKAGE_VERSION" "$LEGACY_NODE_MODULES" "$MANAGED_NODE_MODULES" \
  "$NPM_CONFIG_PREFIX" "$PI_CODING_AGENT_DIR" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [name, version, legacyRoot, managedRoot, npmPrefix, agentDir] = process.argv.slice(2);
const allowedRoots = [npmPrefix, agentDir].map((value) => path.resolve(value));
for (const nodeModulesRoot of [managedRoot, legacyRoot]) {
  const candidate = path.join(nodeModulesRoot, name);
  const allowed = allowedRoots.some((root) => {
    const relative = path.relative(root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  const manifestPath = path.join(candidate, "package.json");
  if (!allowed || !fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.name === name && manifest.version === version) {
    console.log(path.resolve(candidate));
    process.exit(0);
  }
}
console.error(`isolated installed artifact not found for ${name}@${version}`);
process.exit(1);
NODE
)"

SMOKE_DIR="$PI_CODING_AGENT_DIR/agent-registry-release-smoke"
rm -rf "$SMOKE_DIR"
mkdir -p "$SMOKE_DIR/agent-release-smoke/docs/person"
cat > "$SMOKE_DIR/agent-release-smoke/docs/person/system-prompt.md" <<'MARKDOWN'
# Release Smoke Agent

Read-only packed artifact verification persona.
MARKDOWN
cat > "$SMOKE_DIR/agent-release-smoke/agent.json" <<'JSON'
{
  "schema": "ai-society.agent/1",
  "name": "agent-release-smoke",
  "version": "1.0.0",
  "system_prompt_file": "docs/person/system-prompt.md",
  "tools": ["read"],
  "extensions": [],
  "defaults": {
    "model": null,
    "thinking": "medium"
  },
  "scope": {
    "repos": ["/release-smoke/*"],
    "forbidden": [".git"]
  },
  "activities": []
}
JSON
cat > "$SMOKE_DIR/profiles.json" <<'JSON'
{
  "schema": "engineering-core.skill-profiles/1",
  "generated": true,
  "profiles": {},
  "deprecated_aliases": {}
}
JSON

echo "Installed artifact root: $INSTALLED_PACKAGE_ROOT"
PACKAGE_NAME="$PACKAGE_NAME" \
PACKAGE_VERSION="$PACKAGE_VERSION" \
PACKAGE_SPEC="$PACKAGE_SPEC" \
INSTALLED_PACKAGE_ROOT="$INSTALLED_PACKAGE_ROOT" \
SMOKE_DIR="$SMOKE_DIR" \
PI_AGENT_REGISTRY_ROOTS="$SMOKE_DIR/agent-*" \
PI_AGENT_REGISTRY_EC_PROFILES="$SMOKE_DIR/profiles.json" \
PI_AGENT_REGISTRY_USER_SKILLS="$SMOKE_DIR/user-skills" \
"$TSX_BIN" --eval '
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const packageRoot = process.env.INSTALLED_PACKAGE_ROOT;
  const packageName = process.env.PACKAGE_NAME;
  const packageVersion = process.env.PACKAGE_VERSION;
  const packageSpec = process.env.PACKAGE_SPEC;

  const settings = JSON.parse(
    fs.readFileSync(path.join(process.env.PI_CODING_AGENT_DIR, "settings.json"), "utf8"),
  );
  assert.ok(
    settings.packages?.some((entry) => entry === packageSpec || entry?.source === packageSpec),
    `isolated Pi settings do not record ${packageSpec}`,
  );

  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.name, packageName);
  assert.equal(manifest.version, packageVersion);
  assert.ok(manifest.pi?.extensions?.includes("./extensions/pi-agent-registry.ts"));
  for (const requiredPath of [
    "extensions/pi-agent-registry.ts",
    "src/registry.ts",
    "src/manifest.ts",
    "src/ec-profiles.ts",
    "src/dispatch.ts",
  ]) {
    assert.ok(fs.existsSync(path.join(packageRoot, requiredPath)), `packed artifact missing ${requiredPath}`);
  }

  const extensionPath = path.join(packageRoot, "extensions/pi-agent-registry.ts");
  const extensionModule = await import(`${pathToFileURL(extensionPath).href}?release-smoke=${Date.now()}`);
  assert.equal(typeof extensionModule.default, "function", "packed extension has no default export");

  const tools = new Map();
  const commands = new Map();
  extensionModule.default({
    registerTool(tool) { tools.set(tool.name, tool); },
    registerCommand(name, command) { commands.set(name, command); },
  });
  assert.ok(commands.has("agents"), "packed extension did not register /agents");
  assert.ok(tools.has("agent_registry"), "packed extension did not register agent_registry");
  assert.ok(tools.has("dispatch_agent"), "packed extension did not register dispatch_agent");

  const registryTool = tools.get("agent_registry");
  const context = { cwd: process.env.SMOKE_DIR };
  const listed = await registryTool.execute("release-list", { action: "list" }, undefined, undefined, context);
  assert.deepEqual(listed.details.agents, ["agent-release-smoke"]);
  assert.match(listed.content[0].text, /agent-release-smoke/);

  const shown = await registryTool.execute(
    "release-show",
    { action: "show", agent: "agent-release-smoke" },
    undefined,
    undefined,
    context,
  );
  assert.equal(shown.details.agent, "agent-release-smoke");
  assert.equal(shown.details.tools, "read");
  assert.deepEqual(shown.details.scopeRepos, ["/release-smoke/*"]);
  assert.match(shown.content[0].text, /system_prompt_file:/);
  console.log("packed agent-registry registration and read-only tool execution OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'

PI_LOADER_OUTPUT="$SMOKE_DIR/pi-loader.out"

node --input-type=module - "$PI_CODING_AGENT_DIR/settings.json" "$INSTALLED_PACKAGE_ROOT" <<'NODE'
import fs from "node:fs";

const [settingsPath, installedPackageRoot] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
settings.packages = [installedPackageRoot];
settings.extensions = [];
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
NODE

PI_LOADER_OUTPUT="$SMOKE_DIR/pi-loader.out"
echo "== packed extension discovery through the real Pi package loader"
set +e
(
  cd "$SMOKE_DIR"
  PI_AGENT_REGISTRY_ROOTS="$SMOKE_DIR/agent-*" \
    PI_AGENT_REGISTRY_EC_PROFILES="$SMOKE_DIR/profiles.json" \
    PI_AGENT_REGISTRY_USER_SKILLS="$SMOKE_DIR/user-skills" \
    pi --offline --no-session --no-builtin-tools --no-skills --no-prompt-templates \
      --no-context-files --no-themes -p "/agents"
) >"$PI_LOADER_OUTPUT" 2>&1
PI_LOADER_EXIT=$?
set -e
cat "$PI_LOADER_OUTPUT"
if [[ "$PI_LOADER_EXIT" -ne 0 ]] ||
  ! grep -q "Registered agents (1):" "$PI_LOADER_OUTPUT" ||
  ! grep -q "agent-release-smoke" "$PI_LOADER_OUTPUT"; then
  echo "real Pi package loader did not execute the packed /agents command" >&2
  exit 1
fi

echo "release smoke done: installed $PACKAGE_NAME@$PACKAGE_VERSION from $PACKAGE_SPEC, loaded it through real Pi package discovery, and executed packed agent_registry list/show paths without inherited credentials."
