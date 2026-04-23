#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -n "${PI_EXTENSIONS_TMPDIR:-}" ]]; then
  TMP_ROOT="$PI_EXTENSIONS_TMPDIR"
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
  pre-push|ci|check|full)
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
