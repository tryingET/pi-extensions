#!/bin/sh
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

find_targets() {
  find packages -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort
}

run_check() {
  target="$1"
  printf '==> package root check: %s\n' "$target"
  bash "$repo_root/scripts/package-quality-gate.sh" ci "$target"
}

tmp_targets="$(mktemp)"
trap 'rm -f "$tmp_targets"' EXIT INT TERM
find_targets > "$tmp_targets"

if [ ! -s "$tmp_targets" ]; then
  echo "error: no package roots found under packages/" >&2
  exit 1
fi

while IFS= read -r target; do
  [ -n "$target" ] || continue
  [ -f "$target/package.json" ] || continue
  run_check "$target"
done < "$tmp_targets"
