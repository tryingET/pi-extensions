#!/usr/bin/env bash
set -euo pipefail

if ! command -v niri >/dev/null 2>&1; then
  echo "error: niri is not available in PATH" >&2
  exit 1
fi
if ! command -v grim >/dev/null 2>&1; then
  echo "error: grim is not available in PATH" >&2
  exit 1
fi

band_height="${1:-180}"
output_path="${2:-$(mktemp /tmp/pi-top-band-XXXXXX.png)}"

case "$band_height" in
  ''|*[!0-9]*)
    echo "error: band height must be a positive integer" >&2
    exit 1
    ;;
esac
if [[ "$band_height" -le 0 ]]; then
  echo "error: band height must be > 0" >&2
  exit 1
fi

case "$output_path" in
  /*) ;;
  *)
    echo "error: output path must be absolute: $output_path" >&2
    exit 1
    ;;
esac

read -r x y width height <<EOF
$(niri msg -j focused-output | jq -r '.logical | "\(.x) \(.y) \(.width) \(.height)"')
EOF

if [[ -z "${width:-}" || -z "${height:-}" ]]; then
  echo "error: could not resolve focused output geometry from niri" >&2
  exit 1
fi

capture_height="$band_height"
if [[ "$capture_height" -gt "$height" ]]; then
  capture_height="$height"
fi

geometry="${x},${y} ${width}x${capture_height}"
grim -g "$geometry" "$output_path"
printf '%s\n' "$output_path"
