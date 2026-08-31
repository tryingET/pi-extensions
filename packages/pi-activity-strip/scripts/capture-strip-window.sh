#!/usr/bin/env bash
# summary: "Captures the compact native layer-shell Activity Strip band."
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_path="${1:-$(mktemp "${TMPDIR:-$HOME/.cache}/pi-activity-strip-layer-XXXXXX.png")}"
exec bash "$ROOT_DIR/scripts/capture-top-band.sh" 84 "$output_path"
