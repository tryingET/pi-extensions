#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_SCRIPT="$HOME/ai-society/core/agent-scripts/scripts/docs-list.mjs"
LOCAL_FALLBACK_SCRIPT="$ROOT_DIR/scripts/docs-list.mjs"

usage() {
  cat <<'USAGE'
Usage: ./scripts/docs-list.sh [docs-list args]

Resolves docs-list script in this order:
1) DOCS_LIST_SCRIPT env var (absolute/relative path)
2) Local fallback: ./scripts/docs-list.mjs
3) Default global path: ~/ai-society/core/agent-scripts/scripts/docs-list.mjs

Examples:
  ./scripts/docs-list.sh
  ./scripts/docs-list.sh --workspace --discover
  ./scripts/docs-list.sh --json
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to run docs-list." >&2
  exit 1
fi

SCRIPT_PATH=""

if [[ -n "${DOCS_LIST_SCRIPT:-}" ]]; then
  SCRIPT_PATH="${DOCS_LIST_SCRIPT}"
elif [[ -f "$LOCAL_FALLBACK_SCRIPT" ]]; then
  SCRIPT_PATH="$LOCAL_FALLBACK_SCRIPT"
else
  SCRIPT_PATH="$DEFAULT_SCRIPT"
fi

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "Error: docs-list script not found: $SCRIPT_PATH" >&2
  echo "Set DOCS_LIST_SCRIPT to your docs-list.mjs path, or place docs-list script at: $DEFAULT_SCRIPT" >&2
  exit 1
fi

node "$SCRIPT_PATH" "$@"
