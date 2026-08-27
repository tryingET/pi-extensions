#!/usr/bin/env bash
# ---
# summary: exercises pi-agent-vent packaging, isolated installation, and release smoke gates
# read_when:
#   - preparing a release or investigating tarball and pi installation failures
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
cd "$ROOT_DIR"
RELEASE_SANDBOX_ROOT="$(git -C "$ROOT_DIR" rev-parse --show-toplevel)"
source "$RELEASE_SANDBOX_ROOT/scripts/release-sandbox.sh"

# Scratch-root resolution, from first principles:
# the invariant is "release-check scratch lands on a managed, disposable root",
# NOT "the TMPDIR variable happens to be exported". A GitHub-hosted runner is
# single-tenant and ephemeral; its RUNNER_TEMP is exactly a managed scratch
# root for that job, so CI satisfies the invariant even though runners never
# export TMPDIR. Locally the strict rule is unchanged: no TMPDIR, no run.
if [[ -n "${TMPDIR:-}" ]]; then
  TMP_ROOT="$TMPDIR"
elif [[ "${GITHUB_ACTIONS:-}" == "true" && -n "${RUNNER_TEMP:-}" && -d "${RUNNER_TEMP:-}" ]]; then
  TMP_ROOT="$RUNNER_TEMP"
else
  echo "TMPDIR must name the managed scratch root for release checks" >&2
  exit 1
fi
mkdir -p "$TMP_ROOT"
TMP_ROOT="$(cd "$TMP_ROOT" && pwd -P)"
case "$TMP_ROOT" in
  /|"$ROOT_DIR"|"$ROOT_DIR"/*)
    echo "Release check refused unsafe TMPDIR: $TMP_ROOT" >&2
    exit 1
    ;;
esac
release_tmp_dir() {
  local label="$1"
  mktemp -d "$TMP_ROOT/pi-agent-vent-${label}-XXXXXX"
}

NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
REPOSITORY_URL="$(node -p "(() => { const pkg = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')); const repo = pkg.repository; if (typeof repo === 'string') return repo.trim(); if (repo && typeof repo === 'object' && typeof repo.url === 'string') return repo.url.trim(); return ''; })()")"

HOST_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).devDependencies['@earendil-works/pi-coding-agent'] || ''")"

release_npm_install() {
  local _cache="$1"
  local _prefix="$2"
  shift 2
  release_sandbox_npm install \
    --include=optional --ignore-scripts --no-audit --fund=false "$@"
}

CONTROL_NPM_CACHE="$(release_tmp_dir control-npm-cache)"
TEST_AGENT_DIR=""
TEST_NPM_PREFIX=""
TEST_NPM_CACHE=""
ARTIFACT_NPM_PREFIX=""
ARTIFACT_NPM_CACHE=""
ARTIFACT_TOOL_VENT_DIR=""
TARBALL_CHECK_DIR=""
TARBALL_NPM_CACHE=""
TARBALL_PATH=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" ]]; then
    for path_to_remove in "$CONTROL_NPM_CACHE" "$TEST_AGENT_DIR" "$TEST_NPM_PREFIX" \
      "$TEST_NPM_CACHE" "$ARTIFACT_NPM_PREFIX" "$ARTIFACT_NPM_CACHE" \
      "$ARTIFACT_TOOL_VENT_DIR" "$TARBALL_CHECK_DIR" "$TARBALL_NPM_CACHE"; do
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

echo "== release-check: ${NAME}@${VERSION}"
node ./scripts/release-smoke-check.mjs assert-exact-host-contract \
  --package-json package.json \
  --host-version "$HOST_VERSION"

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
if [[ -f "$REPO_ROOT/scripts/npm-pack-json.mjs" ]]; then
  PACK_JSON="$(printf '%s' "$PACK_JSON" | node "$REPO_ROOT/scripts/npm-pack-json.mjs")"
fi

PACK_JSON="$PACK_JSON" node ./scripts/release-artifact-check.mjs

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

echo "== npm pack"
TARBALL="$(release_sandbox_npm pack --silent | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL"
echo "Tarball: $TARBALL_PATH"

TARBALL_CHECK_DIR="$(release_tmp_dir tarball-check)"
TARBALL_NPM_CACHE="$(release_tmp_dir tarball-npm-cache)"
echo "== unpacked tarball package contract"
tar -xzf "$TARBALL_PATH" -C "$TARBALL_CHECK_DIR"
(
  cd "$TARBALL_CHECK_DIR/package"
  # This isolated artifact probe intentionally selects the exact host contract above.
  # Ordinary installs retain the workstation's npm release-age policy.
  release_npm_install "$TARBALL_NPM_CACHE" -
  release_sandbox_npm run check
)

ARTIFACT_NPM_PREFIX="$(release_tmp_dir artifact-npm-prefix)"
ARTIFACT_NPM_CACHE="$(release_tmp_dir artifact-npm-cache)"
ARTIFACT_TOOL_VENT_DIR="$(release_tmp_dir artifact-tool-store)"
ARTIFACT_PACKAGE_ROOT="$(release_sandbox_npm --prefix "$ARTIFACT_NPM_PREFIX" root -g)/$NAME"

case "$ARTIFACT_PACKAGE_ROOT" in
  "$ARTIFACT_NPM_PREFIX"/*) ;;
  *)
    echo "Artifact package root escaped isolated npm prefix: $ARTIFACT_PACKAGE_ROOT" >&2
    exit 1
    ;;
esac

echo "== npm installed artifact shadow registered-tool smoke (no Pi auth)"
release_npm_install "$ARTIFACT_NPM_CACHE" "$ARTIFACT_NPM_PREFIX" \
  --prefix "$ARTIFACT_NPM_PREFIX" --global "$TARBALL_PATH"
node ./scripts/release-smoke-check.mjs assert-installed-artifact \
  --package-root "$ARTIFACT_PACKAGE_ROOT" \
  --package-name "$NAME" \
  --package-version "$VERSION"
node ./scripts/release-smoke-check.mjs assert-installed-tool-path \
  --package-root "$ARTIFACT_PACKAGE_ROOT" \
  --vent-dir "$ARTIFACT_TOOL_VENT_DIR"

if [[ "${SKIP_PI_SMOKE:-0}" == "1" ]]; then
  echo "Skipping pi smoke tests (SKIP_PI_SMOKE=1)."
else
  if ! command -v pi >/dev/null 2>&1; then
    echo "pi CLI not found in PATH." >&2
    exit 1
  fi
  TEST_AGENT_DIR="$(release_tmp_dir pi-agent-dir)"
  TEST_NPM_PREFIX="$(release_tmp_dir pi-npm-prefix)"
  TEST_NPM_CACHE="$(release_tmp_dir pi-npm-cache)"
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
    PI_INSTALLED_PACKAGE_ROOT="$TEST_AGENT_DIR/npm/node_modules/$NAME"
    release_sandbox_exec "$TEST_AGENT_DIR" "$TEST_NPM_PREFIX" "$TEST_NPM_CACHE" \
      env PACKAGE_SPEC="$PACKAGE_SPEC" INSTALLED_PACKAGE_ROOT="$PI_INSTALLED_PACKAGE_ROOT" \
      bash ./scripts/release-smoke.sh
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
