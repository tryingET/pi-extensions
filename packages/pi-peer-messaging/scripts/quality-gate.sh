#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAGE="${1:-}"
shift $(( $# > 0 ? 1 : 0 )) || true

exec bash ../../scripts/package-quality-gate.sh "$STAGE" . --mode simple-package "$@"
