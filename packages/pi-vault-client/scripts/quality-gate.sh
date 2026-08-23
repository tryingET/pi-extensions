#!/usr/bin/env bash
# summary: build runtime artifacts when required and delegate package quality stages to the monorepo gate.
# read_when:
#   - running or diagnosing pi-vault-client lint, typecheck, test, or CI checks.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
STAGE="${1:-}"

if [[ "$STAGE" != "fix" ]]; then
  node "$ROOT_DIR/scripts/sync-prompt-vault-contract.mjs" --check
fi

if [[ "$STAGE" == "ci" || "$STAGE" == "pre-push" || "$STAGE" == "test" || "$STAGE" == "typecheck" ]]; then
  node "$ROOT_DIR/scripts/build-runtime.mjs"
fi

exec bash "$MONOREPO_ROOT/scripts/package-quality-gate.sh" "$STAGE" "$ROOT_DIR"
