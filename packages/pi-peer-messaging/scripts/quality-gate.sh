#!/usr/bin/env bash
# ---
# summary: delegates package validation stages to the monorepo simple-package quality gate
# read_when:
#   - running or changing peer-messaging quality-gate stages
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STAGE="${1:-}"
shift $(( $# > 0 ? 1 : 0 )) || true

exec bash ../../scripts/package-quality-gate.sh "$STAGE" . --mode simple-package "$@"
