#!/usr/bin/env bash
# summary: "delegates pi-interaction package-group quality modes to the monorepo quality-gate runner."
# read_when:
#   - "running or diagnosing lint, typecheck, pre-commit, pre-push, or ci quality modes."
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"

exec bash "$MONOREPO_ROOT/scripts/package-quality-gate.sh" "${1:-}" "$ROOT_DIR" --mode package-group
