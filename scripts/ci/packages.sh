#!/bin/sh
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

find_targets() {
  find packages -path '*/node_modules' -prune -o -name package.json -print | LC_ALL=C sort
}

run_check() {
  manifest="$1"
  target="$(dirname "$manifest")"
  printf '==> package check: %s\n' "$target"
  (cd "$target" && npm run check)
}

tmp_targets="$(mktemp)"
trap 'rm -f "$tmp_targets"' EXIT INT TERM
find_targets > "$tmp_targets"

if [ ! -s "$tmp_targets" ]; then
  echo "error: no package manifests found under packages/" >&2
  exit 1
fi

while IFS= read -r manifest; do
  [ -n "$manifest" ] || continue
  run_check "$manifest"
done < "$tmp_targets"
