#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "${PACKAGE_SPEC:-}" ]]; then
  echo "PACKAGE_SPEC is required; release-check.sh sets it to the packed tarball spec." >&2
  exit 1
fi

if [[ -z "${PI_CODING_AGENT_DIR:-}" ]]; then
  echo "PI_CODING_AGENT_DIR is required so release smoke cannot touch operator pi settings." >&2
  exit 1
fi

if ! command -v pi >/dev/null 2>&1; then
  echo "pi CLI not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$PI_CODING_AGENT_DIR/settings.json" ]]; then
  echo "Isolated pi settings missing: $PI_CODING_AGENT_DIR/settings.json" >&2
  exit 1
fi

SMOKE_DIR=""
cleanup() {
  if [[ "${KEEP_RELEASE_ARTIFACTS:-0}" != "1" && -n "$SMOKE_DIR" && -d "$SMOKE_DIR" ]]; then
    rm -rf "$SMOKE_DIR"
  fi
}
trap cleanup EXIT

SMOKE_DIR="$(mktemp -d /tmp/pi-agent-vent-release-smoke-XXXXXX)"
SMOKE_LOCAL_PATH_VENT_DIR="$SMOKE_DIR/agent-vent-local-path-store"
SMOKE_TOOL_VENT_DIR="$SMOKE_DIR/agent-vent-tool-store"
SMOKE_LOCAL_PATH_OUTPUT="$SMOKE_DIR/agent-vent-local-path.out"
PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
if [[ -n "${NPM_CONFIG_PREFIX:-}" ]]; then
  GLOBAL_NODE_MODULES="$(npm --prefix "$NPM_CONFIG_PREFIX" root -g)"
else
  GLOBAL_NODE_MODULES="$(npm root -g)"
fi
INSTALLED_PACKAGE_ROOT="$GLOBAL_NODE_MODULES/$PACKAGE_NAME"
INSTALLED_EXTENSION_PATH="$INSTALLED_PACKAGE_ROOT/extensions/agent-vent.ts"

if [[ -n "${NPM_CONFIG_PREFIX:-}" ]]; then
  case "$INSTALLED_PACKAGE_ROOT" in
    "$NPM_CONFIG_PREFIX"/*) ;;
    *)
      echo "Installed package root escaped isolated npm prefix: $INSTALLED_PACKAGE_ROOT" >&2
      exit 1
      ;;
  esac
fi

node ./scripts/release-smoke-check.mjs assert-settings \
  --settings "$PI_CODING_AGENT_DIR/settings.json" \
  --package-spec "$PACKAGE_SPEC"

node ./scripts/release-smoke-check.mjs assert-installed-artifact \
  --package-root "$INSTALLED_PACKAGE_ROOT" \
  --package-name "$PACKAGE_NAME" \
  --package-version "$PACKAGE_VERSION"

node ./scripts/release-smoke-check.mjs assert-local-tarball-install-source \
  --package-spec "$PACKAGE_SPEC"

node ./scripts/release-smoke-check.mjs prepare-local-path-artifact-settings \
  --settings "$PI_CODING_AGENT_DIR/settings.json" \
  --package-root "$INSTALLED_PACKAGE_ROOT"

echo "== installed local-path package-discovery /agent_vent command smoke"
PI_AGENT_VENT_DIR="$SMOKE_LOCAL_PATH_VENT_DIR" \
  pi --offline --no-session --no-builtin-tools --no-skills --no-prompt-templates --no-context-files --no-themes \
  -p "/agent_vent path" >"$SMOKE_LOCAL_PATH_OUTPUT" 2>&1
cat "$SMOKE_LOCAL_PATH_OUTPUT"

node ./scripts/release-smoke-check.mjs assert-command-output \
  --output "$SMOKE_LOCAL_PATH_OUTPUT" \
  --vent-dir "$SMOKE_LOCAL_PATH_VENT_DIR"

echo "== installed artifact shadow agent_vent registered-tool path smoke"
node ./scripts/release-smoke-check.mjs assert-installed-tool-path \
  --package-root "$INSTALLED_PACKAGE_ROOT" \
  --vent-dir "$SMOKE_TOOL_VENT_DIR"

echo "release smoke done: local npm:<tarball> install source was validated; installed artifact /agent_vent path command loads through local-path package discovery and agent_vent shadow tool path executes from $INSTALLED_PACKAGE_ROOT."
