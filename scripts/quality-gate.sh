#!/usr/bin/env bash
# ---
# summary: "Routes root quality stages to staged smoke, package, or full monorepo validation scripts."
# read_when:
#   - "Running root quality checks or changing pre-commit, pre-push, CI, and package gate routing."
#   - "A push printed 'reusing verification' (pre-push reuses a recorded pass for the same tree, AK6739)."
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "${PI_EXTENSIONS_TMPDIR:-}" ]]; then
  TMP_ROOT="$PI_EXTENSIONS_TMPDIR"
elif [[ -n "${TMPDIR:-}" ]]; then
  TMP_ROOT="$TMPDIR"
elif [[ -n "${HOME:-}" ]]; then
  TMP_ROOT="$HOME/.pi/tmp/pi-extensions"
else
  TMP_ROOT="$ROOT_DIR/.git/tmp"
fi
mkdir -p "$TMP_ROOT"
export TMPDIR="$TMP_ROOT"
export TMP="$TMP_ROOT"
export TEMP="$TMP_ROOT"

usage() {
  echo "Usage: bash ./scripts/quality-gate.sh <pre-commit|pre-push|ci|check|smoke|full|packages>" >&2
}

stage="${1:-}"

case "$stage" in
  pre-commit)
    ./scripts/ci/smoke.sh --staged-only
    exec ./scripts/ci/packages.sh pre-commit --staged-only
    ;;
  smoke)
    exec ./scripts/ci/smoke.sh
    ;;
  pre-push)
    # A recorded pass for the exact same clean tree and gate inputs is reused (AK6739); install
    # admission still runs first. Any miss, or PI_EXT_FULL_PREPUSH=1, runs the full check, and only
    # a passing full check is recorded. See scripts/prepush-verified-tree.mjs.
    . ./scripts/select-gate-node.sh
    if [ "${PI_SKIP_PACKAGES:-0}" = "1" ] || {
      node ./scripts/validate-package-installs.mjs >/dev/null 2>&1 &&
        node ./scripts/validate-local-package-links.mjs >/dev/null 2>&1
    }; then
      if node ./scripts/prepush-verified-tree.mjs check; then
        exit 0
      fi
    else
      echo "prepush verification cache: install admission did not pass; running the full check"
    fi
    ./scripts/ci/full.sh
    node ./scripts/prepush-verified-tree.mjs record || true
    ;;
  ci|check|full)
    exec ./scripts/ci/full.sh
    ;;
  packages)
    exec ./scripts/ci/packages.sh
    ;;
  *)
    usage
    exit 1
    ;;
esac
