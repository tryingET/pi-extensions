#!/usr/bin/env bash
# summary: "Delegates PTX quality modes to the monorepo package quality-gate runner."
# read_when:
#   - "Changing PTX quality-gate routing or its package-root arguments."
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"

exec bash "$MONOREPO_ROOT/scripts/package-quality-gate.sh" "${1:-}" "$ROOT_DIR"
