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
LEGACY_NODE_MODULES="$(NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" npm_config_prefix="$NPM_CONFIG_PREFIX" npm root -g)"
MANAGED_NODE_MODULES="$PI_CODING_AGENT_DIR/npm/node_modules"
INSTALLED_PACKAGE_ROOT="$(node --input-type=module - "$PACKAGE_NAME" "$PACKAGE_VERSION" "$LEGACY_NODE_MODULES" "$MANAGED_NODE_MODULES" "$NPM_CONFIG_PREFIX" "$PI_CODING_AGENT_DIR" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [packageName, packageVersion, legacyNodeModules, managedNodeModules, npmPrefix, agentDir] =
  process.argv.slice(2);
const allowedRoots = [npmPrefix, agentDir].map((root) => path.resolve(root));
const candidates = [managedNodeModules, legacyNodeModules]
  .filter(Boolean)
  .map((nodeModulesRoot) => path.join(nodeModulesRoot, packageName));

const isInsideAllowedRoot = (candidate) => {
  const resolved = path.resolve(candidate);
  return allowedRoots.some((root) => {
    const relativePath = path.relative(root, resolved);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
  });
};

for (const candidate of candidates) {
  if (!isInsideAllowedRoot(candidate)) continue;
  const packageJsonPath = path.join(candidate, "package.json");
  if (!fs.existsSync(packageJsonPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  if (pkg.name === packageName && pkg.version === packageVersion) {
    console.log(path.resolve(candidate));
    process.exit(0);
  }
}

console.error(
  `Installed package root not found for ${packageName}@${packageVersion}. Checked: ${candidates.join(", ")}`,
);
process.exit(1);
NODE
)"

# Current Pi installs user npm packages under npm's global root; newer Pi installs under
# $PI_CODING_AGENT_DIR/npm. Accept both so this smoke remains valid across the runtime
# package-manager migration while still failing closed outside isolated roots.
echo "Installed artifact root: $INSTALLED_PACKAGE_ROOT"

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

echo "== activate installed artifact path through isolated pi settings"
node --input-type=module - "$PI_CODING_AGENT_DIR/settings.json" "$INSTALLED_PACKAGE_ROOT" <<'NODE'
import fs from "node:fs";

const [settingsPath, installedPackageRoot] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const packages = Array.isArray(settings.packages) ? settings.packages : [];
settings.packages = [
  installedPackageRoot,
  ...packages.filter((entry) => entry !== installedPackageRoot && entry?.source !== installedPackageRoot),
];
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
console.log("installed artifact package path activated in isolated settings");
NODE

SMOKE_DIR=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" && -n "$SMOKE_DIR" && -d "$SMOKE_DIR" ]]; then
    rm -rf "$SMOKE_DIR"
  fi
}
trap cleanup EXIT

SMOKE_DIR="$(mktemp -d /tmp/pi-context-packer-release-smoke-XXXXXX)"
SMOKE_OUTPUT="$SMOKE_DIR/pi-smoke.out"

echo "== context-packer installed Pi runtime package-discovery registration and tool-closure smoke"
(
  cd "$SMOKE_DIR"
  PI_CODING_AGENT_DIR="$PI_CODING_AGENT_DIR" INSTALLED_PACKAGE_ROOT="$INSTALLED_PACKAGE_ROOT" \
    NPM_CONFIG_PREFIX="$NPM_CONFIG_PREFIX" npm_config_prefix="$NPM_CONFIG_PREFIX" \
    pi --offline --no-session --no-builtin-tools --no-skills --no-prompt-templates --no-context-files --no-themes \
    -p "/context-packer-release-smoke"
) >"$SMOKE_OUTPUT" 2>&1
cat "$SMOKE_OUTPUT"

if ! grep -q "context-packer runtime registration and registered tool closure execution OK" "$SMOKE_OUTPUT"; then
  echo "Runtime registration/registered tool closure smoke did not report success." >&2
  exit 1
fi

echo "release smoke done: installed $PACKAGE_NAME@$PACKAGE_VERSION from $PACKAGE_SPEC and verified context-packer package discovery, command/tool registration, and registered tool closure execution through Pi runtime."
