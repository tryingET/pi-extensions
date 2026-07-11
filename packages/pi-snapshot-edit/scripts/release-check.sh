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

echo "== deterministic extension build"
npm run build
FIRST_BUNDLE_SHA="$(sha256sum dist/snapshot-edit.js | awk '{print $1}')"
npm run build
SECOND_BUNDLE_SHA="$(sha256sum dist/snapshot-edit.js | awk '{print $1}')"
[[ "$FIRST_BUNDLE_SHA" == "$SECOND_BUNDLE_SHA" ]] || {
  echo "Bundle bytes changed across identical builds." >&2
  exit 1
}
echo "Bundle SHA-256: $FIRST_BUNDLE_SHA"

echo "== npm pack --dry-run --json"
PACK_JSON="$(npm pack --dry-run --json)"
echo "$PACK_JSON"

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

TEST_ROOT=""
TARBALL_PATH=""
cleanup() {
  npm run build >/dev/null 2>&1 || true
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    [[ -z "$TEST_ROOT" || ! -d "$TEST_ROOT" ]] || rm -rf "$TEST_ROOT"
    [[ -z "$TARBALL_PATH" || ! -f "$TARBALL_PATH" ]] || rm -f "$TARBALL_PATH"
  fi
}
trap cleanup EXIT

echo "== npm pack"
TARBALL="$(npm pack --silent | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL"
echo "Tarball: $TARBALL_PATH"

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping pi smoke tests (SKIP_PI_SMOKE=1)."
else
  command -v pi >/dev/null 2>&1 || { echo "pi CLI not found in PATH." >&2; exit 1; }
  umask 077
  TEST_ROOT="$(mktemp -d /tmp/pi-snapshot-edit-release-check-XXXXXX)"
  TEST_AGENT_DIR="$TEST_ROOT/agent"
  TEST_PREFIX="$TEST_ROOT/prefix"
  TEST_HOME="$TEST_ROOT/home"
  mkdir -p "$TEST_AGENT_DIR" "$TEST_PREFIX" "$TEST_HOME"
  chmod 700 "$TEST_ROOT" "$TEST_AGENT_DIR" "$TEST_PREFIX" "$TEST_HOME"
  printf '{"extensions":[]}\n' > "$TEST_AGENT_DIR/settings.json"
  chmod 600 "$TEST_AGENT_DIR/settings.json"

  echo "== pi install exact tarball (isolated agent dir and npm prefix)"
  PACKAGE_SPEC="npm:$TARBALL_PATH"
  HOME="$TEST_HOME" PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" NPM_CONFIG_PREFIX="$TEST_PREFIX" \
    NPM_CONFIG_OFFLINE=true HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 \
    ALL_PROXY=http://127.0.0.1:9 NO_PROXY= pi install "$PACKAGE_SPEC"

  INSTALLED_PACKAGE_DIR="$(find "$TEST_AGENT_DIR" "$TEST_PREFIX" -type f -path '*/@tryinget/pi-snapshot-edit/package.json' -printf '%h\n' | head -n 1)"
  [[ -n "$INSTALLED_PACKAGE_DIR" ]] || {
    echo "Could not locate isolated tarball installation." >&2
    find "$TEST_AGENT_DIR" "$TEST_PREFIX" -maxdepth 5 -type f -print >&2
    exit 1
  }

  echo "== extension-specific offline smoke checks"
  HOME="$TEST_HOME" PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" NPM_CONFIG_PREFIX="$TEST_PREFIX" \
    NPM_CONFIG_OFFLINE=true TARBALL_PATH="$TARBALL_PATH" \
    INSTALLED_PACKAGE_DIR="$INSTALLED_PACKAGE_DIR" PACKAGE_SPEC="$PACKAGE_SPEC" \
    bash ./scripts/release-smoke.sh
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
