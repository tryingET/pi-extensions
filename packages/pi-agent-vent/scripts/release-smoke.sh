#!/usr/bin/env bash
# ---
# summary: smoke-tests the installed agent_vent package through isolated pi discovery
# read_when:
#   - verifying tarball installation, command output, or registered-tool execution
# ---
set -euo pipefail

: "${TMPDIR:?TMPDIR is required for managed release-smoke scratch}"

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

if [[ -z "${INSTALLED_PACKAGE_ROOT:-}" ]]; then
  echo "INSTALLED_PACKAGE_ROOT is required; the caller must provide Pi's isolated installed-artifact path." >&2
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

SMOKE_DIR="$(mktemp -d "$TMPDIR/pi-agent-vent-release-smoke.XXXXXX")"
SMOKE_LOCAL_PATH_VENT_DIR="$SMOKE_DIR/agent-vent-local-path-store"
SMOKE_TOOL_VENT_DIR="$SMOKE_DIR/agent-vent-tool-store"
SMOKE_LOCAL_PATH_OUTPUT="$SMOKE_DIR/agent-vent-local-path.out"
PACKAGE_NAME="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).name")"
PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
INSTALLED_EXTENSION_PATH="$INSTALLED_PACKAGE_ROOT/extensions/agent-vent.ts"

INSTALLED_PACKAGE_ROOT="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$INSTALLED_PACKAGE_ROOT")"
PI_CODING_AGENT_DIR_REAL="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$PI_CODING_AGENT_DIR")"
case "$INSTALLED_PACKAGE_ROOT" in
  "$PI_CODING_AGENT_DIR_REAL"/*) ;;
  *)
    echo "Installed package root escaped isolated Pi agent directory: $INSTALLED_PACKAGE_ROOT" >&2
    exit 1
    ;;
esac

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
