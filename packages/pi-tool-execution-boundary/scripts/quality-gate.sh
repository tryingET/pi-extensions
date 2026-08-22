#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEARCH_DIR="$ROOT_DIR"
while [[ "$SEARCH_DIR" != "/" ]]; do
  if [[ -x "$SEARCH_DIR/scripts/package-quality-gate.sh" ]]; then exec bash "$SEARCH_DIR/scripts/package-quality-gate.sh" "${1:-}" "$ROOT_DIR"; fi
  SEARCH_DIR="$(dirname "$SEARCH_DIR")"
done
echo "error: could not locate monorepo root scripts/package-quality-gate.sh above $ROOT_DIR" >&2
exit 1
