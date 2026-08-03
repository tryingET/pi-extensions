#!/usr/bin/env bash
# summary: "Runs the package-owned private, skill-only structure contract."
# read_when:
#   - "Validating pi-session-insights after changing package resources or release posture."
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required for pi-session-insights structure validation" >&2
  exit 1
fi

cd "$ROOT_DIR"
exec node "$ROOT_DIR/scripts/validate-structure.mjs" "$@"
