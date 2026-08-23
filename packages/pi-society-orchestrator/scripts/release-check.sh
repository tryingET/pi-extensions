#!/usr/bin/env bash
set -euo pipefail

release_temp_dir() {
  local prefix="$1"
  if [[ -z "${TMPDIR:-}" ]]; then
    echo "TMPDIR is required for release validation." >&2
    return 1
  fi
  if [[ ! -d "$TMPDIR" ]]; then
    echo "TMPDIR does not exist: $TMPDIR" >&2
    return 1
  fi
  mktemp -d "${TMPDIR%/}/${prefix}-XXXXXX"
}

write_install_project_manifest() {
  local install_root="$1"
  local canonical_registry="$2"
  local active_before="$3"
  shift 3
  if [[ "$#" -eq 0 ]]; then
    echo "At least one release tarball is required." >&2
    return 1
  fi

  mkdir -p "$install_root"
  RELEASE_NPM_REGISTRY="$canonical_registry" RELEASE_NPM_BEFORE="$active_before" \
    node --input-type=module - "$install_root/package.json" "$install_root/release-tarball-bindings.json" "$@" <<'NODE'
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [outputPath, bindingsPath, ...tarballs] = process.argv.slice(2);
const dependencies = {};
const overrides = {};
const packages = [];
const binOwners = new Map();

function digestFile(filePath) {
  return crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("hex");
}

function packedBins(manifest) {
  if (typeof manifest.bin === "string") {
    const defaultName = String(manifest.name || "").split("/").at(-1);
    return defaultName ? { [defaultName]: manifest.bin } : {};
  }
  if (manifest.bin && typeof manifest.bin === "object" && !Array.isArray(manifest.bin)) {
    return manifest.bin;
  }
  return {};
}

for (const inputPath of tarballs) {
  const tarballPath = path.resolve(inputPath);
  if (!fs.statSync(tarballPath).isFile()) {
    throw new Error(`Release tarball is not a file: ${tarballPath}`);
  }
  const manifest = JSON.parse(
    execFileSync("tar", ["-xOf", tarballPath, "package/package.json"], { encoding: "utf8" }),
  );
  const packageName = String(manifest.name || "").trim();
  const packageVersion = String(manifest.version || "").trim();
  if (!packageName || !packageVersion) {
    throw new Error(`Packed manifest must declare name and version: ${tarballPath}`);
  }
  if (dependencies[packageName]) {
    throw new Error(`Duplicate release tarball package name: ${packageName}`);
  }

  const bins = {};
  for (const [rawName, rawTarget] of Object.entries(packedBins(manifest))) {
    const binName = String(rawName).trim();
    const binTarget = String(rawTarget).replaceAll("\\", "/").replace(/^\.\//, "");
    if (!binName || binName.includes("/") || binName.includes("\\")) {
      throw new Error(`Invalid generated bin name '${rawName}' in ${packageName}`);
    }
    if (!binTarget || path.posix.isAbsolute(binTarget) || binTarget.split("/").includes("..")) {
      throw new Error(`Invalid generated bin target '${rawTarget}' in ${packageName}`);
    }
    if (binOwners.has(binName)) {
      throw new Error(
        `Generated bin collision for '${binName}': ${binOwners.get(binName)} and ${packageName}`,
      );
    }
    binOwners.set(binName, packageName);
    bins[binName] = binTarget;
  }

  dependencies[packageName] = `file:${tarballPath}`;
  // A direct-dependency reference is npm's supported way to make every
  // transitive request for a generated local package use this exact tarball.
  overrides[packageName] = `$${packageName}`;
  packages.push({
    name: packageName,
    version: packageVersion,
    tarballPath,
    sha512: digestFile(tarballPath),
    bins,
  });
}

fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      name: "@tryinget/pi-society-orchestrator-release-check-install",
      version: "0.0.0",
      private: true,
      dependencies,
      overrides,
    },
    null,
    2,
  )}\n`,
);
fs.writeFileSync(
  bindingsPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      registry: process.env.RELEASE_NPM_REGISTRY,
      activePolicy: { before: process.env.RELEASE_NPM_BEFORE || null },
      packages,
    },
    null,
    2,
  )}\n`,
);
NODE
}

configure_install_project() {
  local install_root="$1"
  local canonical_registry="$2"
  local active_before="$3"
  cat > "$install_root/.npmrc" <<EOF
registry=${canonical_registry}
@tryinget:registry=${canonical_registry}
ignore-scripts=true
package-lock=false
workspaces=false
audit=false
fund=false
bin-links=false
install-links=false
install-strategy=hoisted
save=false
EOF
  if [[ -n "$active_before" ]]; then
    printf 'before=%s\n' "$active_before" >> "$install_root/.npmrc"
  fi
  : > "$install_root/empty-global.npmrc"
}

run_isolated_npm_install() {
  local install_root="$1"
  local canonical_registry="$2"
  local active_before="$3"
  node --input-type=module - "$install_root" "$canonical_registry" "$active_before" <<'NODE'
import { spawnSync } from "node:child_process";
import path from "node:path";

const [installRoot, canonicalRegistry, activeBefore] = process.argv.slice(2);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key)),
);
Object.assign(env, {
  NPM_CONFIG_REGISTRY: canonicalRegistry,
  NPM_CONFIG_USERCONFIG: path.join(installRoot, ".npmrc"),
  NPM_CONFIG_GLOBALCONFIG: path.join(installRoot, "empty-global.npmrc"),
  NPM_CONFIG_CACHE: path.join(installRoot, "npm-cache"),
  NPM_CONFIG_IGNORE_SCRIPTS: "true",
  NPM_CONFIG_PACKAGE_LOCK: "false",
  NPM_CONFIG_WORKSPACES: "false",
  NPM_CONFIG_AUDIT: "false",
  NPM_CONFIG_FUND: "false",
  NPM_CONFIG_BIN_LINKS: "false",
  NPM_CONFIG_INSTALL_LINKS: "false",
  NPM_CONFIG_INSTALL_STRATEGY: "hoisted",
  NPM_CONFIG_SAVE: "false",
  NPM_CONFIG_UPDATE_NOTIFIER: "false",
});
if (activeBefore) env.NPM_CONFIG_BEFORE = activeBefore;

const args = [
  "install",
  "--ignore-scripts",
  "--package-lock=false",
  "--workspaces=false",
  `--registry=${canonicalRegistry}`,
  "--audit=false",
  "--fund=false",
  "--bin-links=false",
  "--install-links=false",
  "--install-strategy=hoisted",
  "--save=false",
];
const result = spawnSync("npm", args, { cwd: installRoot, env, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
NODE
}

materialize_generated_bins() {
  local install_root="$1"
  node --input-type=module - "$install_root" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const installRoot = fs.realpathSync(process.argv[2]);
const nodeModulesRoot = fs.realpathSync(path.join(installRoot, "node_modules"));
const bindings = JSON.parse(
  fs.readFileSync(path.join(installRoot, "release-tarball-bindings.json"), "utf8"),
);
const binDir = path.join(nodeModulesRoot, ".bin");
if (fs.existsSync(binDir) && fs.readdirSync(binDir).length > 0) {
  throw new Error("npm created unexpected bin links while bin-links=false");
}
fs.mkdirSync(binDir, { recursive: true });

for (const pkg of bindings.packages) {
  const installedDir = path.join(nodeModulesRoot, ...pkg.name.split("/"));
  for (const [binName, relativeTarget] of Object.entries(pkg.bins)) {
    const target = path.resolve(installedDir, relativeTarget);
    const canonicalTarget = fs.realpathSync(target);
    if (
      !target.startsWith(`${installedDir}${path.sep}`) ||
      !canonicalTarget.startsWith(`${installedDir}${path.sep}`) ||
      !fs.statSync(canonicalTarget).isFile()
    ) {
      throw new Error(`Generated bin target is missing or escapes its package: ${pkg.name}:${binName}`);
    }
    fs.symlinkSync(path.relative(binDir, target), path.join(binDir, binName));
  }
}
NODE
}

verify_install_project() {
  local install_root="$1"
  shift
  node --input-type=module - "$install_root" "$@" <<'NODE'
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [installRootInput, ...tarballs] = process.argv.slice(2);
const installRoot = fs.realpathSync(installRootInput);
const nodeModulesRoot = fs.realpathSync(path.join(installRoot, "node_modules"));
const manifest = JSON.parse(fs.readFileSync(path.join(installRoot, "package.json"), "utf8"));
const bindings = JSON.parse(
  fs.readFileSync(path.join(installRoot, "release-tarball-bindings.json"), "utf8"),
);
const expected = [];
const expectedBins = new Map();

function digestFile(filePath) {
  return crypto.createHash("sha512").update(fs.readFileSync(filePath)).digest("hex");
}

function listContent(root) {
  const content = new Map();
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      const relativePath = path.relative(root, entryPath).split(path.sep).join("/");
      const stat = fs.lstatSync(entryPath);
      if (stat.isDirectory()) {
        queue.push(entryPath);
      } else if (stat.isSymbolicLink()) {
        content.set(relativePath, { type: "symlink", target: fs.readlinkSync(entryPath) });
      } else if (stat.isFile()) {
        content.set(relativePath, { type: "file", sha512: digestFile(entryPath) });
      } else {
        throw new Error(`Unsupported installed package entry type: ${entryPath}`);
      }
    }
  }
  return content;
}

function verifyPackedContent(tarballPath, installedDir, packageName) {
  const extractionRoot = fs.mkdtempSync(path.join(installRoot, ".release-content-"));
  try {
    execFileSync("tar", ["-xzf", tarballPath, "-C", extractionRoot]);
    const packed = listContent(path.join(extractionRoot, "package"));
    const installed = listContent(installedDir);
    for (const [relativePath, expectedEntry] of packed) {
      const actualEntry = installed.get(relativePath);
      if (!actualEntry || JSON.stringify(actualEntry) !== JSON.stringify(expectedEntry)) {
        throw new Error(`Packed content mismatch for ${packageName}:${relativePath}`);
      }
    }
    const extras = [...installed.keys()].filter(
      (relativePath) => !packed.has(relativePath) && !relativePath.startsWith("node_modules/"),
    );
    if (extras.length > 0) {
      throw new Error(`Installed package has content absent from tarball ${packageName}: ${extras.join(", ")}`);
    }
  } finally {
    fs.rmSync(extractionRoot, { recursive: true, force: true });
  }
}

if (!Array.isArray(bindings.packages) || bindings.packages.length !== tarballs.length) {
  throw new Error("Tarball binding count does not match generated tarball set");
}

for (const inputPath of tarballs) {
  const tarballPath = path.resolve(inputPath);
  const binding = bindings.packages.find((entry) => entry.tarballPath === tarballPath);
  if (!binding) throw new Error(`Tarball path is not bound: ${tarballPath}`);
  if (digestFile(tarballPath) !== binding.sha512) {
    throw new Error(`Tarball digest mismatch for ${binding.name}`);
  }
  const packedManifest = JSON.parse(
    execFileSync("tar", ["-xOf", tarballPath, "package/package.json"], { encoding: "utf8" }),
  );
  const packageName = String(packedManifest.name || "").trim();
  const packageVersion = String(packedManifest.version || "").trim();
  if (binding.name !== packageName || binding.version !== packageVersion) {
    throw new Error(`Tarball binding mismatch for ${packageName}@${packageVersion}`);
  }

  const installedDir = path.join(nodeModulesRoot, ...packageName.split("/"));
  const stat = fs.lstatSync(installedDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Generated package must be a real installed directory: ${installedDir}`);
  }
  const installedManifest = JSON.parse(
    fs.readFileSync(path.join(installedDir, "package.json"), "utf8"),
  );
  if (installedManifest.name !== packageName || installedManifest.version !== packageVersion) {
    throw new Error(
      `Installed package ownership mismatch for ${packageName}: expected ${packageVersion}, got ${installedManifest.name}@${installedManifest.version}`,
    );
  }
  if (manifest.dependencies?.[packageName] !== `file:${tarballPath}`) {
    throw new Error(`Install manifest does not own exact tarball for ${packageName}`);
  }
  if (manifest.overrides?.[packageName] !== `$${packageName}`) {
    throw new Error(`Install manifest does not override transitive ${packageName} requests`);
  }
  verifyPackedContent(tarballPath, installedDir, packageName);
  for (const [binName, relativeTarget] of Object.entries(binding.bins)) {
    if (expectedBins.has(binName)) throw new Error(`Generated bin collision for '${binName}'`);
    expectedBins.set(binName, path.resolve(installedDir, relativeTarget));
  }
  expected.push(`${packageName}@${packageVersion}#sha512:${binding.sha512}`);
}

let symlinkCount = 0;
const queue = [nodeModulesRoot];
while (queue.length > 0) {
  const current = queue.shift();
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const entryPath = path.join(current, entry.name);
    const stat = fs.lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      symlinkCount += 1;
      const resolved = fs.realpathSync(entryPath);
      if (resolved !== nodeModulesRoot && !resolved.startsWith(`${nodeModulesRoot}${path.sep}`)) {
        throw new Error(`Ambient install link escapes isolated node_modules: ${entryPath} -> ${resolved}`);
      }
      continue;
    }
    if (stat.isDirectory()) queue.push(entryPath);
  }
}

const binDir = path.join(nodeModulesRoot, ".bin");
const actualBinNames = fs.existsSync(binDir) ? fs.readdirSync(binDir).sort() : [];
const expectedBinNames = [...expectedBins.keys()].sort();
if (JSON.stringify(actualBinNames) !== JSON.stringify(expectedBinNames)) {
  throw new Error(
    `Generated bin set mismatch: expected [${expectedBinNames}], got [${actualBinNames}]`,
  );
}
for (const [binName, expectedTarget] of expectedBins) {
  const binPath = path.join(binDir, binName);
  const stat = fs.lstatSync(binPath);
  if (!stat.isSymbolicLink()) throw new Error(`Generated bin is not a symlink: ${binPath}`);
  if (fs.realpathSync(binPath) !== fs.realpathSync(expectedTarget)) {
    throw new Error(`Generated bin target mismatch for '${binName}'`);
  }
}

if (fs.existsSync(path.join(installRoot, "package-lock.json"))) {
  throw new Error("Isolated release install unexpectedly wrote package-lock.json");
}

console.log(`Exact tarball digest/content ownership: ${expected.join(", ")}`);
console.log(`No ambient workspace links: ${symlinkCount} symlink(s) stay inside ${nodeModulesRoot}`);
console.log(`Exact generated bin ownership: ${expectedBinNames.length} bin link(s)`);
console.log(`Canonical npm registry: ${bindings.registry}`);
NODE
}

install_tarball_set() {
  local install_root="$1"
  shift
  local canonical_registry="https://registry.npmjs.org/"
  local active_before
  active_before="$(npm config get before 2>/dev/null || true)"
  if [[ "$active_before" == "null" || "$active_before" == "undefined" ]]; then
    active_before=""
  fi
  write_install_project_manifest "$install_root" "$canonical_registry" "$active_before" "$@"
  configure_install_project "$install_root" "$canonical_registry" "$active_before"
  run_isolated_npm_install "$install_root" "$canonical_registry" "$active_before"
  materialize_generated_bins "$install_root"
  verify_install_project "$install_root" "$@"
}

cleanup_release_artifacts() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    if [[ -n "${TEST_AGENT_DIR:-}" && -d "$TEST_AGENT_DIR" ]]; then
      rm -rf "$TEST_AGENT_DIR"
    fi
    if [[ -n "${LOCAL_DEP_PACK_DIR:-}" && -d "$LOCAL_DEP_PACK_DIR" ]]; then
      rm -rf "$LOCAL_DEP_PACK_DIR"
    fi
    if [[ -n "${TARBALL_PATH:-}" && -f "$TARBALL_PATH" ]]; then
      rm -f "$TARBALL_PATH"
    fi
  fi
}

main() {
  # Prove TMPDIR is present and usable before release commands create artifacts.
  local tmp_probe
  tmp_probe="$(release_temp_dir "pi-orch-release-preflight")"
  rmdir "$tmp_probe"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
REPOSITORY_URL="$(node -p "(() => { const pkg = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')); const repo = pkg.repository; if (typeof repo === 'string') return repo.trim(); if (repo && typeof repo === 'object' && typeof repo.url === 'string') return repo.url.trim(); return ''; })()")"

echo "== release-check: ${NAME}@${VERSION}"

if [[ -z "$REPOSITORY_URL" ]]; then
  echo "package.json repository.url is required for provenance release publishing." >&2
  exit 1
fi

if [[ "$NAME" != "${NAME,,}" ]]; then
  echo "Invalid npm package name: must be lowercase: $NAME" >&2
  exit 1
fi

echo "== ASC bridge lifecycle"
node ./scripts/validate-asc-bridge-lifecycle.mjs

echo "== npm pack --dry-run --json"
PACK_JSON="$(npm pack --dry-run --json)"
echo "$PACK_JSON"
PACK_JSON="$(printf '%s' "$PACK_JSON" | node "$REPO_ROOT/scripts/npm-pack-json.mjs")"

PACK_JSON="$PACK_JSON" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const normalize = (value) => value.replace(/^\.\//, "").replace(/\\/g, "/");

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const filesEntries = Array.isArray(pkg.files)
  ? pkg.files.map((entry) => normalize(String(entry).trim())).filter(Boolean)
  : [];
const bundledPrefixes = [
  ...((Array.isArray(pkg.bundleDependencies) ? pkg.bundleDependencies : []).map(String)),
  ...((Array.isArray(pkg.bundledDependencies) ? pkg.bundledDependencies : []).map(String)),
]
  .map((entry) => normalize(`node_modules/${entry}/`))
  .filter(Boolean);

if (filesEntries.length === 0) {
  fail("package.json must define a non-empty files array for deterministic publish artifacts.");
}

const expectedExact = new Set(["package.json"]);
const expectedDirPrefixes = [];
const expectedPatternPrefixes = [];

for (const entry of filesEntries) {
  if (/[*?\[]/.test(entry)) {
    const prefix = normalize(entry.split(/[*?\[]/, 1)[0]);
    if (!prefix) {
      fail(`Unsupported files[] wildcard entry without prefix: ${entry}`);
    }
    expectedPatternPrefixes.push(prefix);
    continue;
  }

  const fullPath = path.resolve(entry);
  if (!fs.existsSync(fullPath)) {
    fail(`files[] entry does not exist: ${entry}`);
  }

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    const prefix = entry.endsWith("/") ? entry : `${entry}/`;
    expectedDirPrefixes.push(prefix);
  } else {
    expectedExact.add(entry);
  }
}

const pack = JSON.parse(process.env.PACK_JSON || "[]");
if (!Array.isArray(pack) || !pack[0] || !Array.isArray(pack[0].files)) {
  fail("Could not parse npm pack --dry-run --json output.");
}

const actual = pack[0].files.map((f) => normalize(String(f.path || ""))).filter(Boolean).sort();
const actualSet = new Set(actual);

const allowByAlwaysIncluded = (filePath) => {
  return (
    /^README(?:\.[^/]+)?$/i.test(filePath) ||
    /^LICENSE(?:\.[^/]+)?$/i.test(filePath) ||
    /^NOTICE(?:\.[^/]+)?$/i.test(filePath)
  );
};

const missing = [];
for (const filePath of expectedExact) {
  if (!actualSet.has(filePath)) {
    missing.push(filePath);
  }
}
for (const prefix of expectedDirPrefixes) {
  if (!actual.some((filePath) => filePath.startsWith(prefix))) {
    missing.push(`${prefix}*`);
  }
}
for (const prefix of expectedPatternPrefixes) {
  if (!actual.some((filePath) => filePath.startsWith(prefix))) {
    missing.push(`${prefix}*`);
  }
}
for (const prefix of bundledPrefixes) {
  if (!actual.some((filePath) => filePath.startsWith(prefix))) {
    missing.push(`${prefix}*`);
  }
}

const extra = actual.filter((filePath) => {
  if (expectedExact.has(filePath)) return false;
  if (expectedDirPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
  if (expectedPatternPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
  if (bundledPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
  if (allowByAlwaysIncluded(filePath)) return false;
  return true;
});

if (missing.length || extra.length) {
  console.error("Publish file whitelist mismatch.");
  if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
  if (extra.length) console.error(`Extra: ${extra.join(", ")}`);
  process.exit(1);
}

console.log(`File whitelist OK (${actual.length} files).`);
NODE

echo "== npm publish --dry-run"
set +e
PUBLISH_DRY_RUN_OUTPUT="$(npm publish --dry-run 2>&1)"
PUBLISH_DRY_RUN_EXIT=$?
set -e
echo "$PUBLISH_DRY_RUN_OUTPUT"
if [[ "$PUBLISH_DRY_RUN_EXIT" -ne 0 ]]; then
  if grep -qiE "You cannot publish over the previously published versions|previously published version .* is higher than the new version" <<<"$PUBLISH_DRY_RUN_OUTPUT"; then
    echo "npm publish --dry-run hit registry version guard (${VERSION}); continuing."
  else
    echo "npm publish --dry-run failed." >&2
    exit "$PUBLISH_DRY_RUN_EXIT"
  fi
fi

TEST_AGENT_DIR=""
LOCAL_DEP_PACK_DIR=""
TARBALL_PATH=""
PACKAGE_SPEC=""
INSTALL_PROJECT_DIR=""
trap cleanup_release_artifacts EXIT

echo "== npm pack"
TARBALL="$(npm pack --silent | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL"
PACKAGE_SPEC="npm:$TARBALL_PATH"
echo "Tarball: $TARBALL_PATH"

LOCAL_DEP_PACK_DIR="$(release_temp_dir "pi-orch-local-deps")"
LOCAL_DEP_TARBALL_OUTPUT="$(node ./scripts/release-local-dependencies.mjs --pack-dir "$LOCAL_DEP_PACK_DIR" --output tarballs)"
mapfile -t LOCAL_DEP_TARBALLS <<<"$LOCAL_DEP_TARBALL_OUTPUT"
INSTALL_TARBALLS=("${LOCAL_DEP_TARBALLS[@]}" "$TARBALL_PATH")

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping installed-package smoke (SKIP_PI_SMOKE=1)."
else
  TEST_AGENT_DIR="$(release_temp_dir "pi-extension-release-check")"
  INSTALL_PROJECT_DIR="$TEST_AGENT_DIR/npm-project"

  # Keep a minimal deterministic settings shape for isolated tarball install.
  # Provider/model values are not exercised by the headless installed-package smoke.
  PI_TEST_DEFAULT_PROVIDER="${PI_TEST_DEFAULT_PROVIDER:-openai}"
  PI_TEST_DEFAULT_MODEL="${PI_TEST_DEFAULT_MODEL:-gpt-4o}"
  PI_TEST_ENABLED_MODELS="${PI_TEST_ENABLED_MODELS:-[\"openai/gpt-4*\"]}"

  cat > "$TEST_AGENT_DIR/settings.json" <<JSON
{
  "defaultProvider": "${PI_TEST_DEFAULT_PROVIDER}",
  "defaultModel": "${PI_TEST_DEFAULT_MODEL}",
  "enabledModels": ${PI_TEST_ENABLED_MODELS},
  "extensions": [],
  "packages": [
    {
      "source": "${PACKAGE_SPEC}"
    }
  ]
}
JSON

  echo "== isolated installed-package exact-tarball-set install"
  install_tarball_set "$INSTALL_PROJECT_DIR" "${INSTALL_TARBALLS[@]}"

  echo "== verify tarball package recorded in settings"
  TEST_AGENT_DIR="$TEST_AGENT_DIR" PACKAGE_SPEC="$PACKAGE_SPEC" node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";
import { settingsPackagesContainSpec } from "./scripts/release-smoke-helpers.mjs";

const settingsPath = path.join(process.env.TEST_AGENT_DIR, "settings.json");
const packageSpec = process.env.PACKAGE_SPEC;
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

if (!settingsPackagesContainSpec(settings, packageSpec)) {
  console.error(`Could not find ${packageSpec} in settings.packages`);
  process.exit(1);
}

console.log("Tarball package entry present in settings.packages.");
NODE

  if [[ -x "./scripts/release-smoke.sh" ]]; then
    echo "== extension-specific smoke checks (scripts/release-smoke.sh)"
    PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" PACKAGE_SPEC="$PACKAGE_SPEC" PI_RELEASE_INSTALL_ROOT="$INSTALL_PROJECT_DIR" bash ./scripts/release-smoke.sh
  fi
fi

echo "== npm view ${NAME} version (pre-publish may be 404)"
set +e
npm view "$NAME" version --json --registry https://registry.npmjs.org/
VIEW_EXIT=$?
set -e
echo "npm view exit: $VIEW_EXIT"
if [[ "$VIEW_EXIT" -ne 0 ]]; then
  echo "Package likely not published yet (expected for first release)."
fi

echo "release-check done"

}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
