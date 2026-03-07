#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"

cleanup_runtime_artifacts() {
  rm -rf "$ROOT_DIR/.tmp-self-tests" "$ROOT_DIR/.tmp-autonomy-control-tests"
}

cleanup_runtime_artifacts
trap cleanup_runtime_artifacts EXIT

exec bash "$MONOREPO_ROOT/scripts/package-quality-gate.sh" "${1:-}" "$ROOT_DIR"
