#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
REPOSITORY_URL="$(node -p "(() => { const pkg = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')); const repo = pkg.repository; if (typeof repo === 'string') return repo.trim(); if (repo && typeof repo === 'object' && typeof repo.url === 'string') return repo.url.trim(); return ''; })()")"
SUPPLIED_TARBALL="${1:-${RELEASE_TARBALL_PATH:-}}"
EXPECTED_TARBALL_SHA256="${RELEASE_TARBALL_SHA256:-}"
TARBALL_PATH=""
OWNS_TARBALL=0
TEST_AGENT_DIR=""
TEST_NPM_PREFIX=""

cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    [[ -z "$TEST_AGENT_DIR" || ! -d "$TEST_AGENT_DIR" ]] || rm -rf "$TEST_AGENT_DIR"
    [[ -z "$TEST_NPM_PREFIX" || ! -d "$TEST_NPM_PREFIX" ]] || rm -rf "$TEST_NPM_PREFIX"
    if [[ "$OWNS_TARBALL" == "1" && -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]]; then rm -f "$TARBALL_PATH"; fi
  fi
}
trap cleanup EXIT

fail() {
  echo "$*" >&2
  exit 1
}

sha256() {
  sha256sum "$1" | awk '{print $1}'
}

verify_tarball_unchanged() {
  [[ -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]] || fail "Release tarball is missing: ${TARBALL_PATH:-<unset>}"
  local actual
  actual="$(sha256 "$TARBALL_PATH")"
  [[ "$actual" == "$EXPECTED_TARBALL_SHA256" ]] || fail "Release tarball SHA-256 changed: expected $EXPECTED_TARBALL_SHA256, got $actual"
}

echo "== release-check: ${NAME}@${VERSION}"

[[ -n "$REPOSITORY_URL" ]] || fail "package.json repository.url is required for provenance release publishing."
[[ "$NAME" == "${NAME,,}" ]] || fail "Invalid npm package name: must be lowercase: $NAME"

if [[ -n "$SUPPLIED_TARBALL" ]]; then
  [[ "$SUPPLIED_TARBALL" = /* ]] || fail "Supplied release tarball path must be absolute: $SUPPLIED_TARBALL"
  [[ -n "$EXPECTED_TARBALL_SHA256" ]] || fail "RELEASE_TARBALL_SHA256 is required with a supplied release tarball."
  TARBALL_PATH="$SUPPLIED_TARBALL"
  verify_tarball_unchanged
  echo "== retained release tarball"
  echo "Tarball: $TARBALL_PATH"
  echo "SHA-256: $EXPECTED_TARBALL_SHA256"
else
  echo "== npm pack --dry-run --json"
  npm pack --dry-run --json
  echo "== npm pack"
  TARBALL="$(npm pack --silent | tail -n 1)"
  TARBALL_PATH="$ROOT_DIR/$TARBALL"
  EXPECTED_TARBALL_SHA256="$(sha256 "$TARBALL_PATH")"
  OWNS_TARBALL=1
  echo "Tarball: $TARBALL_PATH"
  echo "SHA-256: $EXPECTED_TARBALL_SHA256"
fi

echo "== inspect exact tarball contents and identity"
verify_tarball_unchanged
TARBALL_PATH="$TARBALL_PATH" EXPECTED_NAME="$NAME" EXPECTED_VERSION="$VERSION" node <<'NODE'
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const fail = (message) => { console.error(message); process.exit(1); };
const normalize = (value) => value.replace(/^package\//, "").replace(/^\.\//, "").replace(/\\/g, "/");
const tarball = process.env.TARBALL_PATH;
let entries;
let packedManifest;
try {
  entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
    .split(/\r?\n/).filter(Boolean);
  packedManifest = JSON.parse(execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }));
} catch (error) {
  fail(`Could not inspect retained tarball: ${error.message}`);
}
if (packedManifest.name !== process.env.EXPECTED_NAME || packedManifest.version !== process.env.EXPECTED_VERSION) {
  fail(`Tarball identity mismatch: expected ${process.env.EXPECTED_NAME}@${process.env.EXPECTED_VERSION}, got ${packedManifest.name}@${packedManifest.version}`);
}
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const filesEntries = Array.isArray(pkg.files)
  ? pkg.files.map((entry) => normalize(String(entry).trim())).filter(Boolean)
  : [];
if (filesEntries.length === 0) fail("package.json must define a non-empty files array for deterministic publish artifacts.");
const expectedExact = new Set(["package.json"]);
const expectedDirPrefixes = [];
const expectedPatternPrefixes = [];
for (const entry of filesEntries) {
  if (/[*?\[]/.test(entry)) {
    const prefix = normalize(entry.split(/[*?\[]/, 1)[0]);
    if (!prefix) fail(`Unsupported files[] wildcard entry without prefix: ${entry}`);
    expectedPatternPrefixes.push(prefix);
    continue;
  }
  const fullPath = path.resolve(entry);
  if (!fs.existsSync(fullPath)) fail(`files[] entry does not exist: ${entry}`);
  if (fs.statSync(fullPath).isDirectory()) expectedDirPrefixes.push(entry.endsWith("/") ? entry : `${entry}/`);
  else expectedExact.add(entry);
}
const actual = entries
  .filter((entry) => !entry.endsWith("/"))
  .map(normalize).filter(Boolean).sort();
const actualSet = new Set(actual);
const alwaysIncluded = (file) => /^(README|LICENSE|NOTICE)(?:\.[^/]+)?$/i.test(file);
const missing = [...expectedExact].filter((file) => !actualSet.has(file));
for (const prefix of [...expectedDirPrefixes, ...expectedPatternPrefixes]) {
  if (!actual.some((file) => file.startsWith(prefix))) missing.push(`${prefix}*`);
}
const extra = actual.filter((file) =>
  !expectedExact.has(file) &&
  !expectedDirPrefixes.some((prefix) => file.startsWith(prefix)) &&
  !expectedPatternPrefixes.some((prefix) => file.startsWith(prefix)) &&
  !alwaysIncluded(file));
if (missing.length || extra.length) {
  console.error("Publish file whitelist mismatch.");
  if (missing.length) console.error(`Missing: ${missing.join(", ")}`);
  if (extra.length) console.error(`Extra: ${extra.join(", ")}`);
  process.exit(1);
}
console.log(`Tarball identity and file whitelist OK (${actual.length} files).`);
NODE
verify_tarball_unchanged

echo "== npm publish exact tarball --dry-run"
set +e
PUBLISH_DRY_RUN_OUTPUT="$(npm publish "$TARBALL_PATH" --dry-run 2>&1)"
PUBLISH_DRY_RUN_EXIT=$?
set -e
echo "$PUBLISH_DRY_RUN_OUTPUT"
if [[ "$PUBLISH_DRY_RUN_EXIT" -ne 0 ]]; then
  if grep -qiE "You cannot publish over the previously published versions|previously published version .* is higher than the new version" <<<"$PUBLISH_DRY_RUN_OUTPUT"; then
    echo "npm publish --dry-run hit registry version guard (${VERSION}); continuing."
  else
    fail "npm publish --dry-run failed."
  fi
fi
verify_tarball_unchanged

echo "== npm audit --omit=dev"
npm audit --omit=dev
verify_tarball_unchanged

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping pi smoke tests (SKIP_PI_SMOKE=1)."
else
  command -v pi >/dev/null 2>&1 || fail "pi CLI not found in PATH."
  TEST_AGENT_DIR="$(mktemp -d /tmp/pi-extension-release-check-agent-XXXXXX)"
  TEST_NPM_PREFIX="$(mktemp -d /tmp/pi-extension-release-check-npm-XXXXXX)"
  cat > "$TEST_AGENT_DIR/settings.json" <<'JSON'
{
  "extensions": [],
  "packages": []
}
JSON
  echo "== pi install exact tarball (isolated PI_CODING_AGENT_DIR and NPM_CONFIG_PREFIX)"
  PACKAGE_SPEC="npm:$TARBALL_PATH"
  RELEASE_NPM_USERCONFIG="$TEST_AGENT_DIR/release-smoke.npmrc"
  : > "$RELEASE_NPM_USERCONFIG"
  verify_tarball_unchanged
  PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" NPM_CONFIG_PREFIX="$TEST_NPM_PREFIX" npm_config_prefix="$TEST_NPM_PREFIX" NPM_CONFIG_USERCONFIG="$RELEASE_NPM_USERCONFIG" npm_config_userconfig="$RELEASE_NPM_USERCONFIG" pi install "$PACKAGE_SPEC"
  verify_tarball_unchanged

  echo "== verify tarball package recorded in settings"
  TEST_AGENT_DIR="$TEST_AGENT_DIR" PACKAGE_SPEC="$PACKAGE_SPEC" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const settings = JSON.parse(fs.readFileSync(path.join(process.env.TEST_AGENT_DIR, "settings.json"), "utf8"));
const packages = Array.isArray(settings.packages) ? settings.packages : [];
const found = packages.some((entry) => typeof entry === "string" ? entry === process.env.PACKAGE_SPEC : entry?.source === process.env.PACKAGE_SPEC);
if (!found) { console.error(`Could not find ${process.env.PACKAGE_SPEC} in settings.packages`); process.exit(1); }
console.log("Tarball package entry present in settings.packages.");
NODE

  if [[ -x "./scripts/release-smoke.sh" ]]; then
    echo "== extension-specific smoke checks (scripts/release-smoke.sh)"
    PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" NPM_CONFIG_PREFIX="$TEST_NPM_PREFIX" npm_config_prefix="$TEST_NPM_PREFIX" NPM_CONFIG_USERCONFIG="$RELEASE_NPM_USERCONFIG" npm_config_userconfig="$RELEASE_NPM_USERCONFIG" PACKAGE_SPEC="$PACKAGE_SPEC" bash ./scripts/release-smoke.sh
  fi
fi
verify_tarball_unchanged

echo "== npm view ${NAME} version (pre-publish may be 404)"
set +e
npm view "$NAME" version --json --registry https://registry.npmjs.org/
VIEW_EXIT=$?
set -e
echo "npm view exit: $VIEW_EXIT"
[[ "$VIEW_EXIT" -eq 0 ]] || echo "Package likely not published yet (expected for first release)."
verify_tarball_unchanged
echo "release-check done"
