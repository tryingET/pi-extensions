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
SMOKE_FLEET_ROOT="$SMOKE_DIR/fleet"
SMOKE_AGENT_ROOT="$SMOKE_FLEET_ROOT/agent-release-smoke"
SMOKE_EC_ROOT="$SMOKE_DIR/engineering-core"
SMOKE_PROFILES="$SMOKE_EC_ROOT/skills/profiles.json"
rm -rf "$SMOKE_DIR"
mkdir -p "$SMOKE_AGENT_ROOT/docs/person" "$SMOKE_AGENT_ROOT/diary" "$SMOKE_EC_ROOT/skills"
cat > "$SMOKE_AGENT_ROOT/docs/person/system-prompt.md" <<'MARKDOWN'
# Release Smoke Agent

Read-only packed artifact verification persona.
MARKDOWN
for persona in README.md identity.md reason.md main_task.md dream_goal.md behavior_rules.md; do
  printf '# %s\n\nrelease smoke persona\n' "$persona" > "$SMOKE_AGENT_ROOT/docs/person/$persona"
done
printf '# recent activity\n' > "$SMOKE_AGENT_ROOT/diary/release-smoke.md"
cat > "$SMOKE_AGENT_ROOT/agent.json" <<'JSON'
{
  "schema": "ai-society.agent/1",
  "name": "agent-release-smoke",
  "version": "1.0.0",
  "role": "Release Smoke Reviewer",
  "creation_task": "AK-5131",
  "system_prompt_file": "docs/person/system-prompt.md",
  "skills": { "profile": null, "extra": [] },
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
cat > "$SMOKE_PROFILES" <<'JSON'
{
  "schema": "engineering-core.skill-profiles/1",
  "generated": true,
  "profiles": {},
  "deprecated_aliases": {}
}
JSON
for repo in "$SMOKE_AGENT_ROOT" "$SMOKE_EC_ROOT"; do
  git -C "$repo" init --quiet --initial-branch main
  git -C "$repo" config user.name "Agent Registry Release Smoke"
  git -C "$repo" config user.email "agent-registry-release-smoke@example.invalid"
  git -C "$repo" add -A
  git -C "$repo" commit --quiet -m "release smoke fixture"
done

echo "Installed artifact root: $INSTALLED_PACKAGE_ROOT"
PACKAGE_NAME="$PACKAGE_NAME" \
PACKAGE_VERSION="$PACKAGE_VERSION" \
PACKAGE_SPEC="$PACKAGE_SPEC" \
INSTALLED_PACKAGE_ROOT="$INSTALLED_PACKAGE_ROOT" \
SMOKE_DIR="$SMOKE_DIR" \
PI_AGENT_REGISTRY_ROOTS="$SMOKE_FLEET_ROOT/agent-*" \
PI_AGENT_REGISTRY_EC_PROFILES="$SMOKE_PROFILES" \
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
    "src/fleet-lint.ts",
    "src/fleet-git-snapshot.ts",
    "scripts/fleet-lint.mjs",
    "src/dispatch.ts",
  ]) {
    assert.ok(fs.existsSync(path.join(packageRoot, requiredPath)), `packed artifact missing ${requiredPath}`);
  }

  const extensionPath = path.join(packageRoot, "extensions/pi-agent-registry.ts");
  const extensionModule = await import(`${pathToFileURL(extensionPath).href}?release-smoke=${Date.now()}`);
  assert.equal(typeof extensionModule.default, "function", "packed extension has no default export");

  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  extensionModule.default({
    on(event, handler) { handlers.set(event, [...(handlers.get(event) ?? []), handler]); },
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

  const linted = await registryTool.execute(
    "release-lint",
    { action: "lint" },
    undefined,
    undefined,
    context,
  );
  assert.equal(linted.details.schema, "ai-society.agent-fleet-lint/1");
  assert.equal(linted.details.authorityEffect, "none");
  assert.equal(linted.details.summary.candidateRepositories, 1);
  assert.equal(linted.details.summary.manifests, 1);
  assert.equal(linted.details.summary.errors, 2);
  assert.match(linted.content[0].text, /fleet lint unhealthy/);
  assert.match(linted.content[0].text, /Observation only/);

  const dispatchSchema = tools.get("dispatch_agent").parameters;
  assert.deepEqual(Object.keys(dispatchSchema.properties), ["agent", "task", "objective"],
    "packed dispatch_agent must expose the exact Phase-2 request shape");

  const gated = await tools.get("dispatch_agent").execute(
    "release-dispatch-gate",
    { agent: "agent-release-smoke", task: 5132, objective: "packed read-only observation" },
    undefined,
    undefined,
    context,
  );
  assert.equal(gated.isError, true, "packed Phase-2 dispatch must fail closed before any effect");
  assert.equal(gated.details.ok, false);
  assert.equal(gated.details.phase, "fleet_phase_2");
  // Against the currently published ASC (pre execution-exports) the surface is
  // unavailable; once ASC >= 0.5.3 ships the same call reaches the dispatch-origin
  // gate instead. Both are documented pre-spawn fail-closed gates.
  assert.ok(
    gated.details.reason === "asc_execution_unavailable" ||
      gated.details.reason === "parent_repo_unobservable",
    `unexpected packed dispatch reason: ${gated.details.reason}`,
  );
  assert.equal(gated.details.effectDisposition, "confirmed_no_effects");
  assert.equal(gated.details.spawnAttempted, false);
  assert.equal(handlers.has("tool_result"), false, "Phase-2 tool owns its result projection");
  console.log("packed agent-registry read-only inspection and Phase-2 fail-closed dispatch execution OK");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
'

echo "== packed fleet lint CLI"
PI_AGENT_REGISTRY_ROOTS="$SMOKE_FLEET_ROOT/agent-*" \
PI_AGENT_REGISTRY_EC_PROFILES="$SMOKE_PROFILES" \
"$TSX_BIN" "$INSTALLED_PACKAGE_ROOT/scripts/fleet-lint.mjs" \
  --allow-unhealthy \
  --root "$SMOKE_FLEET_ROOT/agent-*" \
  --ec-profiles "$SMOKE_PROFILES" \
  > "$SMOKE_DIR/fleet-lint.json"
node --input-type=module - "$SMOKE_DIR/fleet-lint.json" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
assert.equal(report.schema, "ai-society.agent-fleet-lint/1");
assert.equal(report.authorityEffect, "none");
assert.equal(report.summary.candidateRepositories, 1);
assert.equal(report.summary.errors, 2);
assert.equal(report.policy.dispatchPosture, "fleet_phase_0_disabled");
NODE

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
  PI_AGENT_REGISTRY_ROOTS="$SMOKE_FLEET_ROOT/agent-*" \
    PI_AGENT_REGISTRY_EC_PROFILES="$SMOKE_PROFILES" \
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

echo "release smoke done: installed $PACKAGE_NAME@$PACKAGE_VERSION from $PACKAGE_SPEC; proved packed list/show/lint, shipped fleet-lint CLI, real Pi package discovery, and the Phase-2 fail-closed dispatch contract without inherited credentials."
