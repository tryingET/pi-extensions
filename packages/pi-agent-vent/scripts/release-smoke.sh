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
SMOKE_VENT_DIR="$SMOKE_DIR/agent-vent-store"
SMOKE_OUTPUT="$SMOKE_DIR/agent-vent-path.out"
PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
GLOBAL_NODE_MODULES="$(npm root -g)"
INSTALLED_PACKAGE_ROOT="$GLOBAL_NODE_MODULES/$PACKAGE_NAME"
INSTALLED_EXTENSION_PATH="$INSTALLED_PACKAGE_ROOT/extensions/agent-vent.ts"

node ./scripts/release-smoke-check.mjs assert-settings \
  --settings "$PI_CODING_AGENT_DIR/settings.json" \
  --package-spec "$PACKAGE_SPEC"

node ./scripts/release-smoke-check.mjs assert-installed-artifact \
  --package-root "$INSTALLED_PACKAGE_ROOT" \
  --package-name "$PACKAGE_NAME" \
  --package-version "$PACKAGE_VERSION"

node ./scripts/release-smoke-check.mjs prepare-installed-artifact-settings \
  --settings "$PI_CODING_AGENT_DIR/settings.json" \
  --package-root "$INSTALLED_PACKAGE_ROOT"

echo "== installed package-discovery /agent_vent command smoke"
PI_AGENT_VENT_DIR="$SMOKE_VENT_DIR" \
  pi --offline --no-session --no-builtin-tools --no-skills --no-prompt-templates --no-context-files --no-themes \
  -p "/agent_vent path" >"$SMOKE_OUTPUT" 2>&1
cat "$SMOKE_OUTPUT"

node ./scripts/release-smoke-check.mjs assert-command-output \
  --output "$SMOKE_OUTPUT" \
  --vent-dir "$SMOKE_VENT_DIR"

echo "release smoke done: installed artifact /agent_vent path command loads through package discovery from $INSTALLED_PACKAGE_ROOT."
