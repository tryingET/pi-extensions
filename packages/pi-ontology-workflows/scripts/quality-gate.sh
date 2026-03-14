#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEARCH_DIR="$ROOT_DIR"
OVERRIDE_GATE="${PACKAGE_QUALITY_GATE_SCRIPT:-}"
DEFAULT_GATE="$HOME/ai-society/softwareco/owned/pi-extensions/scripts/package-quality-gate.sh"

if [[ -n "$OVERRIDE_GATE" ]]; then
  if [[ -f "$OVERRIDE_GATE" ]]; then
    exec bash "$OVERRIDE_GATE" "${1:-}" "$ROOT_DIR"
  fi
  echo "error: PACKAGE_QUALITY_GATE_SCRIPT does not exist: $OVERRIDE_GATE" >&2
  exit 1
fi

while [[ "$SEARCH_DIR" != "/" ]]; do
  if [[ -x "$SEARCH_DIR/scripts/package-quality-gate.sh" ]]; then
    exec bash "$SEARCH_DIR/scripts/package-quality-gate.sh" "${1:-}" "$ROOT_DIR"
  fi
  SEARCH_DIR="$(dirname "$SEARCH_DIR")"
done

if [[ -x "$DEFAULT_GATE" ]]; then
  exec bash "$DEFAULT_GATE" "${1:-}" "$ROOT_DIR"
fi

echo "error: could not locate monorepo root scripts/package-quality-gate.sh above $ROOT_DIR" >&2
echo "hint: set PACKAGE_QUALITY_GATE_SCRIPT to a canonical pi-extensions root gate path when validating outside the monorepo tree" >&2
exit 1
