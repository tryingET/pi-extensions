#!/usr/bin/env bash
set -euo pipefail

: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${NPM_CONFIG_PREFIX:?NPM_CONFIG_PREFIX is required}"
: "${PACKAGE_SPEC:?PACKAGE_SPEC is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PI_BIN="$(command -v pi)"
[[ -x "$PI_BIN" ]] || { echo "pi CLI is not executable: ${PI_BIN:-<not found>}" >&2; exit 1; }
NODE_BIN="$(command -v node)"
[[ -x "$NODE_BIN" ]] || { echo "node is not executable: ${NODE_BIN:-<not found>}" >&2; exit 1; }
SMOKE_PATH="$(dirname "$NODE_BIN"):/usr/bin:/bin"
SMOKE_HOME="$PI_CODING_AGENT_DIR/release-smoke-home"
SMOKE_TMPDIR="$PI_CODING_AGENT_DIR/release-smoke-tmp"
SMOKE_CACHE_HOME="$SMOKE_HOME/.cache"
mkdir -p -m 700 "$SMOKE_HOME" "$SMOKE_TMPDIR" "$SMOKE_CACHE_HOME"
chmod 700 "$SMOKE_HOME" "$SMOKE_TMPDIR" "$SMOKE_CACHE_HOME"

PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
LEGACY_NODE_MODULES="$(npm root -g)"
MANAGED_NODE_MODULES="$PI_CODING_AGENT_DIR/npm/node_modules"
INSTALLED_PACKAGE_ROOT="$(node --input-type=module - "$PACKAGE_NAME" "$PACKAGE_VERSION" "$LEGACY_NODE_MODULES" "$MANAGED_NODE_MODULES" "$NPM_CONFIG_PREFIX" "$PI_CODING_AGENT_DIR" <<'NODE'
import fs from "node:fs";
import path from "node:path";
const [name, version, ...values] = process.argv.slice(2);
const [legacyRoot, managedRoot, npmPrefix, agentDir] = values;
const allowed = [npmPrefix, agentDir].map((value) => path.resolve(value));
for (const root of [managedRoot, legacyRoot]) {
  const candidate = path.join(root, name);
  const relativeAllowed = allowed.some((base) => {
    const relative = path.relative(base, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
  const manifest = path.join(candidate, "package.json");
  if (!relativeAllowed || !fs.existsSync(manifest)) continue;
  const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
  if (pkg.name === name && pkg.version === version) {
    console.log(path.resolve(candidate));
    process.exit(0);
  }
}
console.error(`Isolated installed artifact not found for ${name}@${version}`);
process.exit(1);
NODE
)"

echo "Installed artifact root: $INSTALLED_PACKAGE_ROOT"
node --input-type=module - "$PI_CODING_AGENT_DIR/settings.json" "$PACKAGE_SPEC" "$INSTALLED_PACKAGE_ROOT" "$PACKAGE_NAME" "$PACKAGE_VERSION" <<'NODE'
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const [settingsPath, spec, root, name, version] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
assert.ok(settings.packages?.some((entry) => entry === spec || entry?.source === spec));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
assert.equal(pkg.name, name);
assert.equal(pkg.version, version);
assert.ok(pkg.pi?.extensions?.includes("./extensions/snapshot-edit.ts"));
for (const file of ["extensions/snapshot-edit.ts", "src/snapshot-service.js", "src/release-smoke.js"]) {
  assert.ok(fs.existsSync(path.join(root, file)), `packed artifact missing ${file}`);
}
settings.packages = [root];
settings.extensions = [];
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
NODE

run_phase() {
  local phase="$1"
  local output
  local rc
  if output="$(
    env -i \
      PATH="$SMOKE_PATH" \
      HOME="$SMOKE_HOME" \
      TMPDIR="$SMOKE_TMPDIR" \
      TMP="$SMOKE_TMPDIR" \
      TEMP="$SMOKE_TMPDIR" \
      XDG_CACHE_HOME="$SMOKE_CACHE_HOME" \
      PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" \
      NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" \
      npm_config_prefix="$NPM_CONFIG_PREFIX" \
      PI_OFFLINE=1 \
      PI_SNAPSHOT_EDIT_RELEASE_SMOKE=1 \
      PI_SNAPSHOT_EDIT_RELEASE_SMOKE_PHASE="$phase" \
      "$PI_BIN" --offline --no-session --no-builtin-tools --no-skills --no-prompt-templates \
        --no-context-files --no-themes --no-extensions \
        --extension "$INSTALLED_PACKAGE_ROOT/extensions/snapshot-edit.ts" \
        -p "/snapshot-edit-release-smoke" </dev/null 2>&1
  )"; then
    rc=0
  else
    rc=$?
  fi
  printf '%s\n' "$output"
  if [[ "$rc" -ne 0 ]]; then
    echo "snapshot-edit packed release smoke ${phase} failed with exit $rc" >&2
    return "$rc"
  fi
  grep -q "snapshot-edit packed release smoke ${phase} OK" <<<"$output"
}

run_phase fresh
run_phase restart

echo "release smoke done: exact isolated tarball artifact loaded and executed in two provider-free Pi processes."
