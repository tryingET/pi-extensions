#!/usr/bin/env bash
set -euo pipefail

if ! command -v niri >/dev/null 2>&1; then
  echo "error: niri is not available in PATH" >&2
  exit 1
fi

window_id="$(niri msg -j windows | jq -r '.[] | select(.title == "Pi Activity Strip") | .id' | head -n1)"
if [[ -z "$window_id" ]]; then
  echo "error: could not find a Niri window titled 'Pi Activity Strip'" >&2
  exit 1
fi

output_path="${1:-$(mktemp /tmp/pi-activity-strip-window-XXXXXX.png)}"
case "$output_path" in
  /*) ;;
  *)
    echo "error: output path must be absolute: $output_path" >&2
    exit 1
    ;;
esac

niri msg action screenshot-window --id "$window_id" --path "$output_path" --write-to-disk true >/dev/null
printf '%s\n' "$output_path"
