#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

if [[ "$#" -gt 1 ]]; then
  echo "Usage: $0 [retained-release-tarball]" >&2
  exit 2
fi
PROVIDED_TARBALL_PATH=""
if [[ -n "${1:-}" ]]; then
  if [[ ! -f "$1" ]]; then
    echo "Retained release tarball does not exist: $1" >&2
    exit 1
  fi
  PROVIDED_TARBALL_PATH="$(realpath "$1")"
fi

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

REGISTRY_VERSION=""
echo "== npm registry version guard"
set +e
REGISTRY_VIEW_OUTPUT="$(npm view "$NAME" version --json --registry https://registry.npmjs.org/ 2>&1)"
REGISTRY_VIEW_EXIT=$?
set -e
if [[ "$REGISTRY_VIEW_EXIT" -eq 0 ]]; then
  REGISTRY_VERSION="$(REGISTRY_VIEW_OUTPUT="$REGISTRY_VIEW_OUTPUT" node -e 'const raw = JSON.parse(process.env.REGISTRY_VIEW_OUTPUT || "null"); const value = Array.isArray(raw) ? raw.at(-1) : raw; if (typeof value === "string") process.stdout.write(value);')"
  echo "registry: ${REGISTRY_VERSION:-unknown}"
  LOCAL_VERSION="$VERSION" REGISTRY_VERSION="$REGISTRY_VERSION" node <<'NODE'
const local = process.env.LOCAL_VERSION;
const registry = process.env.REGISTRY_VERSION;

function parse(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version ?? "");
  if (!match) throw new Error(`release-check requires valid SemVer; received ${JSON.stringify(version)}`);
  return { core: match.slice(1, 4).map(Number), prerelease: match[4]?.split(".") ?? [] };
}

function compare(leftVersion, rightVersion) {
  const left = parse(leftVersion);
  const right = parse(rightVersion);
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) return left.core[index] - right.core[index];
  }
  if (left.prerelease.length === 0 || right.prerelease.length === 0) {
    return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    if (left.prerelease[index] === undefined) return -1;
    if (right.prerelease[index] === undefined) return 1;
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart.localeCompare(rightPart);
  }
  return 0;
}

if (registry && compare(local, registry) < 0) {
  console.error(`Local package version ${local} is behind registry version ${registry}. Reconcile release history before continuing.`);
  process.exit(1);
}
NODE
else
  if [[ "${RELEASE_CHECK_REQUIRE_REGISTRY:-0}" == "1" ]]; then
    echo "npm registry version unavailable (exit ${REGISTRY_VIEW_EXIT}) in strict release mode." >&2
    printf '%s\n' "$REGISTRY_VIEW_OUTPUT" >&2
    exit "$REGISTRY_VIEW_EXIT"
  fi
  echo "npm registry version unavailable (exit ${REGISTRY_VIEW_EXIT}); continuing only because strict registry verification is disabled."
  printf '%s\n' "$REGISTRY_VIEW_OUTPUT"
fi

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

echo "== npm publish --dry-run"
PUBLISH_TARGET=()
if [[ -n "$PROVIDED_TARBALL_PATH" ]]; then
  PUBLISH_TARGET=("$PROVIDED_TARBALL_PATH")
fi
set +e
PUBLISH_DRY_RUN_OUTPUT="$(npm publish "${PUBLISH_TARGET[@]}" --dry-run 2>&1)"
PUBLISH_DRY_RUN_EXIT=$?
set -e
echo "$PUBLISH_DRY_RUN_OUTPUT"
if [[ "$PUBLISH_DRY_RUN_EXIT" -ne 0 ]]; then
  if [[ -n "$REGISTRY_VERSION" && "$REGISTRY_VERSION" == "$VERSION" ]] &&
    grep -qiE "You cannot publish over the previously published versions|previously published version .* is higher than the new version" <<<"$PUBLISH_DRY_RUN_OUTPUT"; then
    echo "npm publish --dry-run hit the already-published same-version guard (${VERSION}); continuing artifact validation."
  else
    echo "npm publish --dry-run failed; registry version is ${REGISTRY_VERSION:-unknown}, local version is ${VERSION}." >&2
    exit "$PUBLISH_DRY_RUN_EXIT"
  fi
fi

TEST_AGENT_DIR=""
TARBALL_PATH=""
TARBALL_OWNED=0
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    if [[ -n "$TEST_AGENT_DIR" && -d "$TEST_AGENT_DIR" ]]; then
      rm -rf "$TEST_AGENT_DIR"
    fi
    if [[ "$TARBALL_OWNED" == "1" && -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]]; then
      rm -f "$TARBALL_PATH"
    fi
  fi
}
trap cleanup EXIT

if [[ -n "$PROVIDED_TARBALL_PATH" ]]; then
  TARBALL_PATH="$PROVIDED_TARBALL_PATH"
  echo "== retained npm pack"
else
  echo "== npm pack"
  TARBALL="$(npm pack --silent | tail -n 1)"
  TARBALL_PATH="$ROOT_DIR/$TARBALL"
  TARBALL_OWNED=1
fi
echo "Tarball: $TARBALL_PATH"

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping pi smoke tests (SKIP_PI_SMOKE=1)."
else
  if ! command -v pi >/dev/null 2>&1; then
    echo "pi CLI not found in PATH." >&2
    exit 1
  fi
  RELEASE_TMP_ROOT="${TMPDIR:-/tmp}"
  mkdir -p "$RELEASE_TMP_ROOT"
  TEST_AGENT_DIR="$(mktemp -d "${RELEASE_TMP_ROOT%/}/pi-extension-release-check-XXXXXX")"

  # The package smoke imports the installed extension through the pinned local host
  # packages and performs no provider or model call. Keep publication checks
  # credential-free so CI never copies operator authentication material.
  cat > "$TEST_AGENT_DIR/settings.json" <<'JSON'
{
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

echo "== npm view ${NAME} version"
printf '%s\n' "${REGISTRY_VERSION:-unavailable}"

echo "release-check done"
