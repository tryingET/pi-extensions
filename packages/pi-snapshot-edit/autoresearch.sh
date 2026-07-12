#!/usr/bin/env bash
# ---
# summary: "launches the snapshot protocol autoresearch benchmark from the package root"
# read_when:
#   - "running or tracing the package autoresearch entrypoint"
# ---
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$ROOT_DIR/scripts/run-autoresearch.mjs"
