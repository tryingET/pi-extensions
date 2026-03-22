#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
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

PACK_JSON_FILE="$(mktemp /tmp/pi-vault-pack-json-XXXXXX.json)"

echo "== npm pack --dry-run --json"
npm pack --dry-run --json > "$PACK_JSON_FILE"
cat "$PACK_JSON_FILE"

PACK_JSON_FILE="$PACK_JSON_FILE" node <<'NODE'
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
    expectedDirPrefixes.push(entry.endsWith("/") ? entry : `${entry}/`);
  } else {
    expectedExact.add(entry);
  }
}

const pack = JSON.parse(fs.readFileSync(process.env.PACK_JSON_FILE, "utf8"));
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

const extra = actual.filter((filePath) => {
  if (expectedExact.has(filePath)) return false;
  if (expectedDirPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
  if (expectedPatternPrefixes.some((prefix) => filePath.startsWith(prefix))) return false;
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

echo "== portable doc surface validation"
node ./scripts/validate-portable-doc-surface.mjs --pack-json "$PACK_JSON_FILE"

echo "== static runtime dependency audit"
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const declaredRuntimeDeps = {
  ...(pkg.dependencies || {}),
  ...(pkg.optionalDependencies || {}),
};
const declaredRuntimePeerDeps = {
  ...(pkg.peerDependencies || {}),
};
const declaredRoots = new Set([
  ...Object.keys(declaredRuntimeDeps),
  ...Object.keys(declaredRuntimePeerDeps),
]);

const localFileBackedDeps = Object.entries(declaredRuntimeDeps)
  .filter(([, version]) => String(version || "").startsWith("file:"))
  .map(([name, version]) => `${name}=${String(version)}`);
if (localFileBackedDeps.length > 0) {
  console.log(
    `Working manifest uses local file-backed runtime deps; packed-manifest audit must prove publish-safe rewrite: ${localFileBackedDeps.join(", ")}`,
  );
}

const bundledEntries = [
  ...((Array.isArray(pkg.bundleDependencies) ? pkg.bundleDependencies : []).map(String)),
  ...((Array.isArray(pkg.bundledDependencies) ? pkg.bundledDependencies : []).map(String)),
].filter(Boolean);
if (bundledEntries.length > 0) {
  fail(`Temporary bundleDependencies bridge should be retired: ${bundledEntries.join(", ")}`);
}

const runtimeRoots = ["extensions", "src"];
const sourceFiles = [];
for (const root of runtimeRoots) {
  const fullRoot = path.resolve(root);
  if (!fs.existsSync(fullRoot)) continue;
  const stack = [fullRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (/\.(?:[cm]?js|ts|mts|cts)$/.test(entry.name)) sourceFiles.push(fullPath);
    }
  }
}

const importSpecifiers = new Set();
const patterns = [
  /(?:import|export)\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']/g,
  /import\(\s*["']([^"']+)["']\s*\)/g,
];
const toPackageRoot = (specifier) => {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("node:")) {
    return null;
  }
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/", 1)[0];
};

for (const filePath of sourceFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      const root = toPackageRoot(specifier);
      if (root) importSpecifiers.add(root);
    }
  }
}

const missingDeclarations = [...importSpecifiers].filter((root) => !declaredRoots.has(root)).sort();
if (missingDeclarations.length > 0) {
  fail(`Missing runtime dependency declarations for bare imports: ${missingDeclarations.join(", ")}`);
}

console.log(`Runtime dependency audit OK (${importSpecifiers.size} bare import root(s)).`);
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
CLEANROOM_DIR=""
TARBALL_PATH=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    if [[ -n "$TEST_AGENT_DIR" && -d "$TEST_AGENT_DIR" ]]; then
      rm -rf "$TEST_AGENT_DIR"
    fi
    if [[ -n "$CLEANROOM_DIR" && -d "$CLEANROOM_DIR" ]]; then
      rm -rf "$CLEANROOM_DIR"
    fi
    if [[ -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]]; then
      rm -f "$TARBALL_PATH"
    fi
    if [[ -n "$PACK_JSON_FILE" && -f "$PACK_JSON_FILE" ]]; then
      rm -f "$PACK_JSON_FILE"
    fi
  fi
}
trap cleanup EXIT

echo "== npm pack"
TARBALL="$(npm pack --silent | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL"
echo "Tarball: $TARBALL_PATH"

echo "== packed manifest dependency audit"
TARBALL_PATH="$TARBALL_PATH" node <<'NODE'
const { execFileSync } = require("node:child_process");

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const packedManifest = JSON.parse(
  execFileSync("tar", ["-xOf", process.env.TARBALL_PATH, "package/package.json"], {
    encoding: "utf8",
  }),
);
const dependencyFields = ["dependencies", "optionalDependencies", "peerDependencies"];
for (const field of dependencyFields) {
  const deps = packedManifest[field];
  if (!deps || typeof deps !== "object" || Array.isArray(deps)) continue;
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec === "string" && spec.startsWith("file:")) {
      fail(`Packed manifest still contains file dependency ${field}.${name}=${spec}`);
    }
  }
}

const bundledEntries = [
  ...((Array.isArray(packedManifest.bundleDependencies) ? packedManifest.bundleDependencies : []).map(String)),
  ...((Array.isArray(packedManifest.bundledDependencies) ? packedManifest.bundledDependencies : []).map(String)),
].filter(Boolean);
if (bundledEntries.length > 0) {
  fail(`Packed manifest still contains bundleDependencies: ${bundledEntries.join(", ")}`);
}

console.log("Packed manifest dependency audit OK.");
NODE

echo "== clean-room tarball install"
CLEANROOM_DIR="$(mktemp -d /tmp/pi-extension-release-install-XXXXXX)"
pushd "$CLEANROOM_DIR" >/dev/null
npm init -y >/dev/null 2>&1
npm install "$TARBALL_PATH" --ignore-scripts >/dev/null
PACKAGE_NAME="$NAME" CLEANROOM_DIR="$CLEANROOM_DIR" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const projectDir = process.env.CLEANROOM_DIR;
const packageName = process.env.PACKAGE_NAME;
const packageDir = path.join(projectDir, "node_modules", ...packageName.split("/"));
const packageJsonPath = path.join(packageDir, "package.json");
if (!fs.existsSync(packageJsonPath)) {
  fail(`Installed package missing package.json: ${packageDir}`);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const requireFromPackage = createRequire(packageJsonPath);
const runtimeDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.optionalDependencies || {}),
];
for (const dep of runtimeDeps) {
  try {
    try {
      requireFromPackage.resolve(dep);
    } catch {
      requireFromPackage.resolve(`${dep}/package.json`);
    }
  } catch (error) {
    fail(
      `Installed runtime dependency could not be resolved from clean-room install: ${dep} (${error instanceof Error ? error.message : String(error)})`,
    );
  }
}

console.log(`Clean-room install OK (${runtimeDeps.length} runtime dependency/ies).`);
NODE
popd >/dev/null

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping pi smoke tests (SKIP_PI_SMOKE=1)."
else
  if ! command -v pi >/dev/null 2>&1; then
    echo "pi CLI not found in PATH." >&2
    exit 1
  fi
  if [[ ! -f "$HOME/.pi/agent/auth.json" ]]; then
    echo "Missing $HOME/.pi/agent/auth.json (needed for isolated pi smoke tests)." >&2
    echo "Tip: set SKIP_PI_SMOKE=1 for artifact-only checks." >&2
    exit 1
  fi

  TEST_AGENT_DIR="$(mktemp -d /tmp/pi-extension-release-check-XXXXXX)"

  cp "$HOME/.pi/agent/auth.json" "$TEST_AGENT_DIR/auth.json"

  PI_TEST_DEFAULT_PROVIDER="${PI_TEST_DEFAULT_PROVIDER:-openai}"
  PI_TEST_DEFAULT_MODEL="${PI_TEST_DEFAULT_MODEL:-gpt-4o}"
  PI_TEST_ENABLED_MODELS="${PI_TEST_ENABLED_MODELS:-[\"openai/gpt-4*\"]}"

  cat > "$TEST_AGENT_DIR/settings.json" <<JSON
{
  "defaultProvider": "${PI_TEST_DEFAULT_PROVIDER}",
  "defaultModel": "${PI_TEST_DEFAULT_MODEL}",
  "enabledModels": ${PI_TEST_ENABLED_MODELS},
  "extensions": []
}
JSON

  echo "== pi install tarball (isolated PI_CODING_AGENT_DIR)"
  PACKAGE_SPEC="npm:$TARBALL_PATH"
  PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" pi install "$PACKAGE_SPEC"

  echo "== verify tarball package recorded in settings"
  TEST_AGENT_DIR="$TEST_AGENT_DIR" PACKAGE_SPEC="$PACKAGE_SPEC" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const settingsPath = path.join(process.env.TEST_AGENT_DIR, "settings.json");
const packageSpec = process.env.PACKAGE_SPEC;
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
const packages = Array.isArray(settings.packages) ? settings.packages : [];
const found = packages.some((entry) => {
  if (typeof entry === "string") return entry === packageSpec;
  if (entry && typeof entry === "object") return entry.source === packageSpec;
  return false;
});
if (!found) {
  console.error(`Could not find ${packageSpec} in settings.packages`);
  process.exit(1);
}
console.log("Tarball package entry present in settings.packages.");
NODE

  if [[ -x "./scripts/release-smoke.sh" ]]; then
    echo "== extension-specific smoke checks (scripts/release-smoke.sh)"
    PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" PACKAGE_SPEC="$PACKAGE_SPEC" bash ./scripts/release-smoke.sh
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
