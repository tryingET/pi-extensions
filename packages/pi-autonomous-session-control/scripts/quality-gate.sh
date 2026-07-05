#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONOREPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"

cleanup_runtime_artifacts() {
  local paths=("$ROOT_DIR/.tmp-self-tests" "$ROOT_DIR/.tmp-autonomy-control-tests")

  for attempt in 1 2 3; do
    rm -rf "${paths[@]}" || true

    local remaining=()
    for path in "${paths[@]}"; do
      if [[ -e "$path" ]]; then
        remaining+=("$path")
      fi
    done

    if [[ ${#remaining[@]} -eq 0 ]]; then
      return 0
    fi

    if [[ "$attempt" -lt 3 ]]; then
      sleep 0.1
    else
      printf 'failed to clean runtime artifacts after retries: %s\n' "${remaining[*]}" >&2
      return 1
    fi
  done
}

cleanup_runtime_artifacts
trap cleanup_runtime_artifacts EXIT

exec bash "$MONOREPO_ROOT/scripts/package-quality-gate.sh" "${1:-}" "$ROOT_DIR"
