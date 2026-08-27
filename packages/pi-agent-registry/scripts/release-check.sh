#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(git -C "$ROOT_DIR" rev-parse --show-toplevel)"
cd "$ROOT_DIR"

if [[ -z "${TMPDIR:-}" ]]; then
  if [[ "${GITHUB_ACTIONS:-}" == "true" && -n "${RUNNER_TEMP:-}" && -d "${RUNNER_TEMP:-}" ]]; then
    TMPDIR="$RUNNER_TEMP"
  else
    echo "TMPDIR must point to managed disk-backed scratch storage." >&2
    exit 1
  fi
fi
if [[ ! -d "$TMPDIR" ]]; then
  echo "TMPDIR does not exist: $TMPDIR" >&2
  exit 1
fi
TMPDIR_RESOLVED="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$TMPDIR")"
if [[ "$TMPDIR_RESOLVED" == "/tmp" || "$TMPDIR_RESOLVED" == /tmp/* ]]; then
  echo "TMPDIR must not use /tmp: $TMPDIR" >&2
  exit 1
fi
export TMPDIR
export TMP="$TMPDIR"
export TEMP="$TMPDIR"

RELEASE_HOME="$(mktemp -d "$TMPDIR/pi-agent-registry-release-home.XXXXXX")"
RELEASE_NPM_CACHE="$(mktemp -d "$TMPDIR/pi-agent-registry-release-npm-cache.XXXXXX")"
TEST_AGENT_DIR=""
TEST_NPM_PREFIX=""
TEST_NPM_CACHE=""
TARBALL_PATH=""
mkdir -p "$RELEASE_HOME/.config" "$RELEASE_HOME/.cache"
: > "$RELEASE_HOME/.npmrc"
: > "$RELEASE_HOME/global.npmrc"

cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    for path_to_remove in \
      "$RELEASE_HOME" \
      "$RELEASE_NPM_CACHE" \
      "$TEST_AGENT_DIR" \
      "$TEST_NPM_PREFIX" \
      "$TEST_NPM_CACHE"; do
      if [[ -n "$path_to_remove" && -d "$path_to_remove" ]]; then
        rm -rf "$path_to_remove"
      fi
    done
    if [[ -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]]; then
      rm -f "$TARBALL_PATH"
    fi
  fi
}
trap cleanup EXIT

isolated_npm() {
  env -i \
    PATH="$PATH" \
    HOME="$RELEASE_HOME" \
    TMPDIR="$TMPDIR" \
    TMP="$TMPDIR" \
    TEMP="$TMPDIR" \
    XDG_CONFIG_HOME="$RELEASE_HOME/.config" \
    XDG_CACHE_HOME="$RELEASE_HOME/.cache" \
    NPM_CONFIG_USERCONFIG="$RELEASE_HOME/.npmrc" \
    npm_config_userconfig="$RELEASE_HOME/.npmrc" \
    NPM_CONFIG_GLOBALCONFIG="$RELEASE_HOME/global.npmrc" \
    npm_config_globalconfig="$RELEASE_HOME/global.npmrc" \
    NPM_CONFIG_CACHE="$RELEASE_NPM_CACHE" \
    npm_config_cache="$RELEASE_NPM_CACHE" \
    npm "$@"
}

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

echo "== npm pack --dry-run --json"
PACK_JSON="$(isolated_npm pack --dry-run --json)"
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
if (!Array.isArray(pack) || pack.length !== 1 || !pack[0] || !Array.isArray(pack[0].files)) {
  fail("Could not parse normalized npm pack --dry-run --json output.");
}
if (pack[0].name !== pkg.name || pack[0].version !== pkg.version) {
  fail(
    `Packed identity mismatch: expected ${pkg.name}@${pkg.version}, got ${pack[0].name}@${pack[0].version}`,
  );
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
PUBLISH_DRY_RUN_OUTPUT="$(isolated_npm publish --dry-run 2>&1)"
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

echo "== npm pack"
TARBALL="$(isolated_npm pack --silent | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL"
echo "Tarball: $TARBALL_PATH"

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping pi smoke tests (SKIP_PI_SMOKE=1)."
else
  if ! command -v pi >/dev/null 2>&1; then
    echo "pi CLI not found in PATH." >&2
    exit 1
  fi

  TEST_AGENT_DIR="$(mktemp -d "$TMPDIR/pi-agent-registry-release-agent.XXXXXX")"
  TEST_NPM_PREFIX="$(mktemp -d "$TMPDIR/pi-agent-registry-release-npm-prefix.XXXXXX")"
  TEST_NPM_CACHE="$(mktemp -d "$TMPDIR/pi-agent-registry-release-npm-cache.XXXXXX")"
  cat > "$TEST_AGENT_DIR/settings.json" <<'JSON'
{
  "extensions": [],
  "packages": []
}
JSON

  echo "== pi install tarball (isolated Pi and npm roots)"
  PACKAGE_SPEC="npm:$TARBALL_PATH"
  env -i \
    PATH="$PATH" \
    HOME="$RELEASE_HOME" \
    TMPDIR="$TMPDIR" \
    TMP="$TMPDIR" \
    TEMP="$TMPDIR" \
    XDG_CONFIG_HOME="$RELEASE_HOME/.config" \
    XDG_CACHE_HOME="$RELEASE_HOME/.cache" \
    PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
    NPM_CONFIG_USERCONFIG="$RELEASE_HOME/.npmrc" \
    npm_config_userconfig="$RELEASE_HOME/.npmrc" \
    NPM_CONFIG_GLOBALCONFIG="$RELEASE_HOME/global.npmrc" \
    npm_config_globalconfig="$RELEASE_HOME/global.npmrc" \
    NPM_CONFIG_PREFIX="$TEST_NPM_PREFIX" \
    npm_config_prefix="$TEST_NPM_PREFIX" \
    NPM_CONFIG_CACHE="$TEST_NPM_CACHE" \
    npm_config_cache="$TEST_NPM_CACHE" \
    pi install "$PACKAGE_SPEC"

  echo "== extension-specific packed-runtime smoke"
  env -i \
    PATH="$PATH" \
    HOME="$RELEASE_HOME" \
    TMPDIR="$TMPDIR" \
    TMP="$TMPDIR" \
    TEMP="$TMPDIR" \
    XDG_CONFIG_HOME="$RELEASE_HOME/.config" \
    XDG_CACHE_HOME="$RELEASE_HOME/.cache" \
    PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
    NPM_CONFIG_USERCONFIG="$RELEASE_HOME/.npmrc" \
    npm_config_userconfig="$RELEASE_HOME/.npmrc" \
    NPM_CONFIG_GLOBALCONFIG="$RELEASE_HOME/global.npmrc" \
    npm_config_globalconfig="$RELEASE_HOME/global.npmrc" \
    NPM_CONFIG_PREFIX="$TEST_NPM_PREFIX" \
    npm_config_prefix="$TEST_NPM_PREFIX" \
    NPM_CONFIG_CACHE="$TEST_NPM_CACHE" \
    npm_config_cache="$TEST_NPM_CACHE" \
    PACKAGE_SPEC="$PACKAGE_SPEC" \
    bash ./scripts/release-smoke.sh
fi

echo "== npm view ${NAME} version (pre-publish may be 404)"
set +e
VIEW_OUTPUT="$(isolated_npm view "$NAME" version --json --registry https://registry.npmjs.org/ 2>&1)"
VIEW_EXIT=$?
set -e
echo "$VIEW_OUTPUT"
echo "npm view exit: $VIEW_EXIT"
if [[ "$VIEW_EXIT" -ne 0 ]]; then
  echo "Package likely not published yet (expected for first release)."
fi

echo "release-check done"
