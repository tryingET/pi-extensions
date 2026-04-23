#!/bin/sh
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

usage() {
  cat <<'USAGE' >&2
Usage: ./scripts/ci/packages.sh [lint|fix|typecheck|test|pre-commit|pre-push|ci] [--staged-only]

Defaults:
  stage=ci

Examples:
  ./scripts/ci/packages.sh
  ./scripts/ci/packages.sh pre-commit --staged-only
  ./scripts/ci/packages.sh ci
USAGE
}

stage="${1:-ci}"
case "$stage" in
  lint|fix|typecheck|test|pre-commit|pre-push|ci)
    if [ $# -gt 0 ]; then
      shift
    fi
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage
    exit 1
    ;;
esac

staged_only=0
while [ $# -gt 0 ]; do
  case "$1" in
    --staged-only)
      staged_only=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

find_all_targets() {
  find packages -mindepth 1 -maxdepth 1 -type d | LC_ALL=C sort
}

find_staged_targets() {
  git diff --cached --name-only --diff-filter=ACMR -- packages | while IFS= read -r path; do
    [ -n "$path" ] || continue
    case "$path" in
      packages/*)
        remainder="${path#packages/}"
        top_level="${remainder%%/*}"
        [ -n "$top_level" ] || continue
        target="packages/$top_level"
        ;;
      *)
        continue
        ;;
    esac
    [ -d "$target" ] || continue
    printf '%s\n' "$target"
  done | LC_ALL=C sort -u
}

run_check() {
  target="$1"
  printf '==> package root check: %s [%s]\n' "$target" "$stage"
  bash "$repo_root/scripts/package-quality-gate.sh" "$stage" "$target"
}

if [ -n "${PI_EXTENSIONS_TMPDIR:-}" ]; then
  tmp_root="$PI_EXTENSIONS_TMPDIR"
elif [ -n "${HOME:-}" ]; then
  tmp_root="$HOME/.pi/tmp/pi-extensions"
else
  tmp_root="$repo_root/.git/tmp"
fi
mkdir -p "$tmp_root"
export TMPDIR="$tmp_root"
export TMP="$tmp_root"
export TEMP="$tmp_root"
tmp_targets="$(mktemp "$tmp_root/pi-packages-targets.XXXXXX")"
trap 'rm -f "$tmp_targets"' EXIT INT TERM

if [ "$staged_only" -eq 1 ]; then
  find_staged_targets > "$tmp_targets"
else
  find_all_targets > "$tmp_targets"
fi

if [ ! -s "$tmp_targets" ]; then
  if [ "$staged_only" -eq 1 ]; then
    echo "info: no staged package roots detected under packages/"
    exit 0
  fi
  echo "error: no package roots found under packages/" >&2
  exit 1
fi

while IFS= read -r target; do
  [ -n "$target" ] || continue
  [ -f "$target/package.json" ] || continue
  run_check "$target"
done < "$tmp_targets"
