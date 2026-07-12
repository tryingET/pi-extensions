#!/usr/bin/env bash
# ---
# summary: exercises pi-agent-vent packaging, isolated installation, and release smoke gates
# read_when:
#   - preparing a release or investigating tarball and pi installation failures
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
REPOSITORY_URL="$(node -p "(() => { const pkg = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')); const repo = pkg.repository; if (typeof repo === 'string') return repo.trim(); if (repo && typeof repo === 'object' && typeof repo.url === 'string') return repo.url.trim(); return ''; })()")"

HOST_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).devDependencies['@earendil-works/pi-coding-agent'] || ''")"

# One release-only policy membrane. Every dependency-resolving command, including
# Pi's nested npm invocation, must enter through here with disposable cache/prefix.
RELEASE_MIN_AGE=0
with_release_npm_policy() {
  local cache="$1"
  local prefix="$2"
  shift 2
  case "$cache" in
    /tmp/pi-agent-vent-*-npm-cache-*) ;;
    *)
      echo "Release command refused non-isolated npm cache: $cache" >&2
      return 1
      ;;
  esac
  if [[ "$prefix" != "-" ]]; then
    case "$prefix" in
      /tmp/pi-agent-vent-*-npm-prefix-*) ;;
      *)
        echo "Release command refused non-isolated npm prefix: $prefix" >&2
        return 1
        ;;
    esac
    (
      export NPM_CONFIG_PREFIX="$prefix" NPM_CONFIG_CACHE="$cache"
      export NPM_CONFIG_MIN_RELEASE_AGE="$RELEASE_MIN_AGE"
      "$@"
    )
  else
    (
      export NPM_CONFIG_CACHE="$cache" NPM_CONFIG_MIN_RELEASE_AGE="$RELEASE_MIN_AGE"
      "$@"
    )
  fi
}

release_npm_install() {
  local cache="$1"
  local prefix="$2"
  shift 2
  with_release_npm_policy "$cache" "$prefix" npm install \
    --ignore-scripts --no-audit --fund=false "$@"
}

CONTROL_NPM_CACHE="$(mktemp -d /tmp/pi-agent-vent-control-npm-cache-XXXXXX)"
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
PACK_JSON="$(npm --cache "$CONTROL_NPM_CACHE" pack --dry-run --json)"
echo "$PACK_JSON"

PACK_JSON="$PACK_JSON" node ./scripts/release-artifact-check.mjs

echo "== npm publish --dry-run"
set +e
PUBLISH_DRY_RUN_OUTPUT="$(npm --cache "$CONTROL_NPM_CACHE" publish --dry-run 2>&1)"
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
TARBALL="$(npm --cache "$CONTROL_NPM_CACHE" pack --silent | tail -n 1)"
TARBALL_PATH="$ROOT_DIR/$TARBALL"
echo "Tarball: $TARBALL_PATH"

TARBALL_CHECK_DIR="$(mktemp -d /tmp/pi-agent-vent-tarball-check-XXXXXX)"
TARBALL_NPM_CACHE="$(mktemp -d /tmp/pi-agent-vent-tarball-npm-cache-XXXXXX)"
echo "== unpacked tarball package contract"
tar -xzf "$TARBALL_PATH" -C "$TARBALL_CHECK_DIR"
(
  cd "$TARBALL_CHECK_DIR/package"
  # This isolated artifact probe intentionally selects the exact host contract above.
  # Ordinary installs retain the workstation's npm release-age policy.
  release_npm_install "$TARBALL_NPM_CACHE" -
  npm run check
)

ARTIFACT_NPM_PREFIX="$(mktemp -d /tmp/pi-agent-vent-artifact-npm-prefix-XXXXXX)"
ARTIFACT_NPM_CACHE="$(mktemp -d /tmp/pi-agent-vent-artifact-npm-cache-XXXXXX)"
ARTIFACT_TOOL_VENT_DIR="$(mktemp -d /tmp/pi-agent-vent-artifact-tool-store-XXXXXX)"
ARTIFACT_PACKAGE_ROOT="$(npm --prefix "$ARTIFACT_NPM_PREFIX" root -g)/$NAME"

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
  INSTALLED_PI_VERSION="$(pi --version)"
  node ./scripts/release-smoke-check.mjs assert-exact-host-contract \
    --package-json package.json \
    --host-version "$INSTALLED_PI_VERSION"
  if [[ ! -f "$HOME/.pi/agent/auth.json" ]]; then
    echo "Missing $HOME/.pi/agent/auth.json (needed for isolated pi smoke tests)." >&2
    echo "Tip: set SKIP_PI_SMOKE=1 for artifact-only checks." >&2
    exit 1
  fi

  TEST_AGENT_DIR="$(mktemp -d /tmp/pi-agent-vent-pi-agent-dir-XXXXXX)"
  TEST_NPM_PREFIX="$(mktemp -d /tmp/pi-agent-vent-pi-npm-prefix-XXXXXX)"
  TEST_NPM_CACHE="$(mktemp -d /tmp/pi-agent-vent-pi-npm-cache-XXXXXX)"

  cp "$HOME/.pi/agent/auth.json" "$TEST_AGENT_DIR/auth.json"

  # Allow override via environment variables for different provider configurations
  PI_TEST_DEFAULT_PROVIDER="${PI_TEST_DEFAULT_PROVIDER:-openai}"
  PI_TEST_DEFAULT_MODEL="${PI_TEST_DEFAULT_MODEL:-gpt-4o}"
  PI_TEST_ENABLED_MODELS="${PI_TEST_ENABLED_MODELS:-[\"openai/gpt-4*\"]}"

  cat > "$TEST_AGENT_DIR/settings.json" <<JSON
{
  "defaultProvider": "${PI_TEST_DEFAULT_PROVIDER}",
  "defaultModel": "${PI_TEST_DEFAULT_MODEL}",
  "enabledModels": ${PI_TEST_ENABLED_MODELS},
  "npmCommand": ["npm", "--prefix", "${TEST_NPM_PREFIX}", "--cache", "${TEST_NPM_CACHE}"],
  "extensions": []
}
JSON

  echo "== pi install tarball (isolated PI_CODING_AGENT_DIR and npm prefix)"
  PACKAGE_SPEC="npm:$TARBALL_PATH"
  PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" \
    with_release_npm_policy "$TEST_NPM_CACHE" "$TEST_NPM_PREFIX" pi install "$PACKAGE_SPEC"

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
    NPM_CONFIG_PREFIX="$TEST_NPM_PREFIX" NPM_CONFIG_CACHE="$TEST_NPM_CACHE" \
      PI_CODING_AGENT_DIR="$TEST_AGENT_DIR" PACKAGE_SPEC="$PACKAGE_SPEC" \
      INSTALLED_PACKAGE_ROOT="$PI_INSTALLED_PACKAGE_ROOT" bash ./scripts/release-smoke.sh
  fi
fi

echo "== npm view ${NAME} version (pre-publish may be 404)"
set +e
npm --cache "$CONTROL_NPM_CACHE" view "$NAME" version --json --registry https://registry.npmjs.org/
VIEW_EXIT=$?
set -e
echo "npm view exit: $VIEW_EXIT"
if [[ "$VIEW_EXIT" -ne 0 ]]; then
  echo "Package likely not published yet (expected for first release)."
fi

echo "release-check done"
