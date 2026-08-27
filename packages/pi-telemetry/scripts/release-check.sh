#!/usr/bin/env bash
# ---
# summary: verifies the pi-telemetry publish artifact, public review-snapshot export, and isolated pi installation flow
# read_when:
#   - preparing a pi-telemetry release or diagnosing tarball and installed-export smoke failures
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
cd "$ROOT_DIR"
RELEASE_SANDBOX_ROOT="$(git -C "$ROOT_DIR" rev-parse --show-toplevel)"
source "$RELEASE_SANDBOX_ROOT/scripts/release-sandbox.sh"

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
PACK_JSON="$(release_sandbox_npm pack --dry-run --json)"
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
set +e
PUBLISH_DRY_RUN_OUTPUT="$(release_sandbox_npm publish --dry-run 2>&1)"
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
PACKAGE_CONTRACT_DIR=""
TARBALL_PATH=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    if [[ -n "$TEST_AGENT_DIR" && -d "$TEST_AGENT_DIR" ]]; then
      rm -rf "$TEST_AGENT_DIR"
    fi
    if [[ -n "$TEST_NPM_PREFIX" && -d "$TEST_NPM_PREFIX" ]]; then
      rm -rf "$TEST_NPM_PREFIX"
    fi
    if [[ -n "$PACKAGE_CONTRACT_DIR" && -d "$PACKAGE_CONTRACT_DIR" ]]; then
      rm -rf "$PACKAGE_CONTRACT_DIR"
    fi
    if [[ -n "$TARBALL_PATH" && -f "$TARBALL_PATH" ]]; then
      rm -f "$TARBALL_PATH"
    fi
  fi
}
trap cleanup EXIT

echo "== npm pack"
TARBALL="$(release_sandbox_npm pack --silent | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL"
echo "Tarball: $TARBALL_PATH"

echo "== isolated public review-snapshot export smoke"
PACKAGE_CONTRACT_DIR="$(mktemp -d "$TMPDIR/pi-telemetry-package-contract.XXXXXX")"
cat > "$PACKAGE_CONTRACT_DIR/package.json" <<'JSON'
{
  "private": true,
  "type": "module"
}
JSON
(
  cd "$PACKAGE_CONTRACT_DIR"
  release_sandbox_npm install --ignore-scripts --legacy-peer-deps --no-audit --no-fund "$TARBALL_PATH"
  node --experimental-strip-types --input-type=module <<'NODE'
const review = await import("@tryinget/pi-telemetry/review-snapshot");
const requiredFunctions = [
  "buildTelemetryReviewSnapshot",
  "loadTelemetryReviewSnapshot",
  "parseTelemetryReviewSnapshotJson",
  "validateTelemetryReviewSnapshot",
  "writeTelemetryReviewSnapshot",
];
for (const name of requiredFunctions) {
  if (typeof review[name] !== "function") {
    throw new Error(`Missing public review-snapshot function: ${name}`);
  }
}
if (review.TELEMETRY_REVIEW_SNAPSHOT_SCHEMA !== "pi.telemetry-review-snapshot.v1") {
  throw new Error(
    `Unexpected telemetry review schema: ${String(review.TELEMETRY_REVIEW_SNAPSHOT_SCHEMA)}`,
  );
}
if (!Array.isArray(review.TELEMETRY_REVIEW_METRIC_KEYS)) {
  throw new Error("TELEMETRY_REVIEW_METRIC_KEYS must be an exported array.");
}
console.log("Installed review-snapshot export OK.");
NODE
)

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping pi smoke tests (SKIP_PI_SMOKE=1)."
else
  if ! command -v pi >/dev/null 2>&1; then
    echo "pi CLI not found in PATH." >&2
    exit 1
  fi

  TEST_AGENT_DIR="$(mktemp -d "$TMPDIR/pi-extension-release-agent.XXXXXX")"
  TEST_NPM_PREFIX="$TEST_AGENT_DIR/npm-prefix"
  TEST_NPM_CACHE="$TEST_AGENT_DIR/npm-cache"
  release_sandbox_prepare_runtime "$TEST_AGENT_DIR" "$TEST_NPM_PREFIX" "$TEST_NPM_CACHE"

  echo "== pi install tarball (credential-isolated Pi and npm roots)"
  PACKAGE_SPEC="npm:$TARBALL_PATH"
  release_sandbox_exec "$TEST_AGENT_DIR" "$TEST_NPM_PREFIX" "$TEST_NPM_CACHE" \
    pi install "$PACKAGE_SPEC"
  release_sandbox_link_available_peers "$TEST_AGENT_DIR" "$ROOT_DIR"

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
    release_sandbox_exec "$TEST_AGENT_DIR" "$TEST_NPM_PREFIX" "$TEST_NPM_CACHE" \
      env PACKAGE_SPEC="$PACKAGE_SPEC" bash ./scripts/release-smoke.sh
  fi
fi

echo "== npm view ${NAME} version (pre-publish may be 404)"
set +e
release_sandbox_npm view "$NAME" version --json --registry https://registry.npmjs.org/
VIEW_EXIT=$?
set -e
echo "npm view exit: $VIEW_EXIT"
if [[ "$VIEW_EXIT" -ne 0 ]]; then
  echo "Package likely not published yet (expected for first release)."
fi

echo "release-check done"
