#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
STAGE="${1:-}"

if [[ "$STAGE" == "ci" || "$STAGE" == "pre-push" || "$STAGE" == "test" || "$STAGE" == "typecheck" ]]; then
  node "$ROOT_DIR/scripts/build-runtime.mjs"
fi

exec bash "$MONOREPO_ROOT/scripts/package-quality-gate.sh" "$STAGE" "$ROOT_DIR"
