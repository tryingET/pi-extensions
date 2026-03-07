#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  echo "Usage: bash ./scripts/quality-gate.sh <pre-commit|pre-push|ci|check|smoke|full|packages>" >&2
}

stage="${1:-}"

case "$stage" in
  pre-commit|smoke)
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
