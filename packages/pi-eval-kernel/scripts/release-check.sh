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
PACK_JSON_RAW="$(npm pack --dry-run --json)"
echo "$PACK_JSON_RAW"
PACK_JSON="$(printf '%s' "$PACK_JSON_RAW" | node "$ROOT_DIR/scripts/npm-pack-json.mjs")"

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

TEST_AGENT_DIR=""
TEST_NPM_PREFIX=""
TEST_NPM_CACHE=""
TARBALL_PATH=""
cleanup() {
  if [[ -n "$TEST_AGENT_DIR" && -f "$TEST_AGENT_DIR/auth.json" ]]; then
    rm -f "$TEST_AGENT_DIR/auth.json"
  fi
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    if [[ -n "$TEST_AGENT_DIR" && -d "$TEST_AGENT_DIR" ]]; then
      rm -rf "$TEST_AGENT_DIR"
    fi
    if [[ -n "$TEST_NPM_PREFIX" && -d "$TEST_NPM_PREFIX" ]]; then
      rm -rf "$TEST_NPM_PREFIX"
    fi
    if [[ -n "$TEST_NPM_CACHE" && -d "$TEST_NPM_CACHE" ]]; then
      rm -rf "$TEST_NPM_CACHE"
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
echo "Tarball: $TARBALL_PATH"

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

  : "${TMPDIR:?TMPDIR must point to managed disk-backed scratch storage}"
  TEST_AGENT_DIR="$(mktemp -d "$TMPDIR/pi-eval-kernel-release-agent.XXXXXX")"
  TEST_NPM_PREFIX="$(mktemp -d "$TMPDIR/pi-eval-kernel-release-npm-prefix.XXXXXX")"
  TEST_NPM_CACHE="$(mktemp -d "$TMPDIR/pi-eval-kernel-release-npm-cache.XXXXXX")"

  cp "$HOME/.pi/agent/auth.json" "$TEST_AGENT_DIR/auth.json"

  # Reuse the operator's complete authenticated default provider/model pair unless
  # the release invocation explicitly selects another complete pair. Hard-coded or
  # partially combined catalog defaults can resolve through the wrong provider.
  mapfile -t GLOBAL_PI_DEFAULTS < <(
    node - "$HOME/.pi/agent/settings.json" <<'NODE'
const fs = require("node:fs");
const settingsPath = process.argv[2];
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
} catch {
  // Explicit environment overrides remain available when global settings are absent.
}
console.log(
  typeof settings.defaultProvider === "string" ? settings.defaultProvider.trim() : "",
);
console.log(typeof settings.defaultModel === "string" ? settings.defaultModel.trim() : "");
NODE
  )
  if [[ -v PI_TEST_DEFAULT_PROVIDER || -v PI_TEST_DEFAULT_MODEL ]]; then
    if [[ -z "${PI_TEST_DEFAULT_PROVIDER:-}" || -z "${PI_TEST_DEFAULT_MODEL:-}" ]]; then
      echo "PI_TEST_DEFAULT_PROVIDER and PI_TEST_DEFAULT_MODEL must be set together." >&2
      exit 1
    fi
  else
    PI_TEST_DEFAULT_PROVIDER="${GLOBAL_PI_DEFAULTS[0]:-}"
    PI_TEST_DEFAULT_MODEL="${GLOBAL_PI_DEFAULTS[1]:-}"
    if [[ -z "$PI_TEST_DEFAULT_PROVIDER" || -z "$PI_TEST_DEFAULT_MODEL" ]]; then
      echo "Global Pi settings must define both defaultProvider and defaultModel, or set both PI_TEST_DEFAULT_PROVIDER and PI_TEST_DEFAULT_MODEL." >&2
      exit 1
    fi
  fi
  if [[ -z "${PI_TEST_ENABLED_MODELS:-}" ]]; then
    case "$PI_TEST_DEFAULT_MODEL" in
      "$PI_TEST_DEFAULT_PROVIDER"/*) PI_TEST_MODEL_PATTERN="$PI_TEST_DEFAULT_MODEL" ;;
      *) PI_TEST_MODEL_PATTERN="$PI_TEST_DEFAULT_PROVIDER/$PI_TEST_DEFAULT_MODEL" ;;
    esac
    PI_TEST_ENABLED_MODELS="$(node -p 'JSON.stringify([process.argv[1]])' "$PI_TEST_MODEL_PATTERN")"
  fi

  TEST_AGENT_DIR="$TEST_AGENT_DIR" \
    TEST_NPM_PREFIX="$TEST_NPM_PREFIX" \
    TEST_NPM_CACHE="$TEST_NPM_CACHE" \
    PI_TEST_DEFAULT_PROVIDER="$PI_TEST_DEFAULT_PROVIDER" \
    PI_TEST_DEFAULT_MODEL="$PI_TEST_DEFAULT_MODEL" \
    PI_TEST_ENABLED_MODELS="$PI_TEST_ENABLED_MODELS" \
    node <<'NODE'
const fs = require("node:fs");
let enabledModels;
try {
  enabledModels = JSON.parse(process.env.PI_TEST_ENABLED_MODELS);
} catch (error) {
  console.error(`PI_TEST_ENABLED_MODELS must be valid JSON: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(enabledModels) || enabledModels.some((entry) => typeof entry !== "string")) {
  console.error("PI_TEST_ENABLED_MODELS must be a JSON array of strings");
  process.exit(1);
}
const settings = {
  defaultProvider: process.env.PI_TEST_DEFAULT_PROVIDER,
  defaultModel: process.env.PI_TEST_DEFAULT_MODEL,
  enabledModels,
  npmCommand: [
    "npm",
    "--prefix",
    process.env.TEST_NPM_PREFIX,
    "--cache",
    process.env.TEST_NPM_CACHE,
  ],
  extensions: [],
};
fs.writeFileSync(
  `${process.env.TEST_AGENT_DIR}/settings.json`,
  `${JSON.stringify(settings, null, 2)}\n`,
  "utf8",
);
NODE

  echo "== pi install tarball (isolated PI_CODING_AGENT_DIR and npm state)"
  PACKAGE_SPEC="npm:$TARBALL_PATH"
  PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
    NPM_CONFIG_PREFIX="$TEST_NPM_PREFIX" NPM_CONFIG_CACHE="$TEST_NPM_CACHE" \
    npm_config_prefix="$TEST_NPM_PREFIX" npm_config_cache="$TEST_NPM_CACHE" \
    pi install "$PACKAGE_SPEC"

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

  if [[ ! -x "./scripts/release-smoke.sh" ]]; then
    echo "Required executable missing: scripts/release-smoke.sh" >&2
    exit 1
  fi

  echo "== extension-specific smoke checks (scripts/release-smoke.sh)"
  INSTALLED_PACKAGE_ROOT="$TEST_AGENT_DIR/npm/node_modules/$NAME"
  if [[ ! -f "$INSTALLED_PACKAGE_ROOT/package.json" ]]; then
    echo "Installed tarball package missing: $INSTALLED_PACKAGE_ROOT" >&2
    exit 1
  fi
  PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
    NPM_CONFIG_PREFIX="$TEST_NPM_PREFIX" NPM_CONFIG_CACHE="$TEST_NPM_CACHE" \
    npm_config_prefix="$TEST_NPM_PREFIX" npm_config_cache="$TEST_NPM_CACHE" \
    PACKAGE_SPEC="$PACKAGE_SPEC" INSTALLED_PACKAGE_ROOT="$INSTALLED_PACKAGE_ROOT" \
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
