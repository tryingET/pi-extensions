#!/usr/bin/env bash
# summary: Delegates package quality modes to the monorepo simple-package gate.
# read_when:
#   - Running or changing pi-interaction lint, typecheck, or CI checks.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../../.." && pwd)"

exec bash "$MONOREPO_ROOT/scripts/package-quality-gate.sh" "${1:-}" "$ROOT_DIR" --mode simple-package
