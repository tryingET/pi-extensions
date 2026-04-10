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
NPM_GLOBAL_PREFIX=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    if [[ -n "$TEST_AGENT_DIR" && -d "$TEST_AGENT_DIR" ]]; then
      rm -rf "$TEST_AGENT_DIR"
    fi
    if [[ -n "$LOCAL_DEP_PACK_DIR" && -d "$LOCAL_DEP_PACK_DIR" ]]; then
      rm -rf "$LOCAL_DEP_PACK_DIR"
    fi
    if [[ -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]]; then
      rm -f "$TARBALL_PATH"
    fi
  fi
}
trap cleanup EXIT

echo "== npm pack"
TARBALL="$(npm pack --silent | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL"
PACKAGE_SPEC="npm:$TARBALL_PATH"
echo "Tarball: $TARBALL_PATH"

LOCAL_DEP_PACK_DIR="$(mktemp -d /tmp/pi-orch-local-deps-XXXXXX)"
mapfile -t LOCAL_DEP_TARBALLS < <(node ./scripts/release-local-dependencies.mjs --pack-dir "$LOCAL_DEP_PACK_DIR" --output tarballs)
INSTALL_TARBALLS=("${LOCAL_DEP_TARBALLS[@]}" "$TARBALL_PATH")

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping installed-package smoke (SKIP_PI_SMOKE=1)."
else
  TEST_AGENT_DIR="$(mktemp -d /tmp/pi-extension-release-check-XXXXXX)"
  NPM_GLOBAL_PREFIX="$TEST_AGENT_DIR/npm-global"
  mkdir -p "$NPM_GLOBAL_PREFIX"

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

  echo "== isolated installed-package dependency-set install"
  NPM_CONFIG_PREFIX="$NPM_GLOBAL_PREFIX" npm install -g "${INSTALL_TARBALLS[@]}" >/dev/null

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
    PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" PACKAGE_SPEC="$PACKAGE_SPEC" NPM_CONFIG_PREFIX="$NPM_GLOBAL_PREFIX" bash ./scripts/release-smoke.sh
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
