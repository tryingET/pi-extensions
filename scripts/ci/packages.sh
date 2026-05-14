#!/bin/sh
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

usage() {
  cat <<'USAGE' >&2
Usage: ./scripts/ci/packages.sh [lint|fix|typecheck|test|pre-commit|pre-push|ci] [--staged-only] [--package <name|path>]...

Defaults:
  stage=ci
  targets=all top-level package roots under packages/

Targeting:
  --package <name|path>, --target <name|path>
      Validate only the named package roots. Bare names resolve under packages/.
      Explicit paths must stay under packages/ and contain package.json.

Examples:
  ./scripts/ci/packages.sh
  ./scripts/ci/packages.sh pre-commit --staged-only
  ./scripts/ci/packages.sh ci
  ./scripts/ci/packages.sh ci --package pi-autoresearch --package pi-society-orchestrator
  ./scripts/ci/packages.sh test --target packages/pi-autoresearch
USAGE
}

stage="ci"
if [ $# -gt 0 ]; then
  case "$1" in
    lint|fix|typecheck|test|pre-commit|pre-push|ci)
      stage="$1"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      ;;
    *)
      usage
      exit 1
      ;;
  esac
fi

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
tmp_explicit_targets="$(mktemp "$tmp_root/pi-packages-explicit-targets.XXXXXX")"
trap 'rm -f "$tmp_targets" "$tmp_explicit_targets"' EXIT INT TERM

staged_only=0
explicit_targets=0
append_explicit_target() {
  raw_target="${1%/}"
  case "$raw_target" in
    "")
      echo "error: empty package target" >&2
      usage
      exit 1
      ;;
    packages/*)
      target="${raw_target%/}"
      ;;
    ./packages/*)
      target="${raw_target#./}"
      ;;
    */*)
      target="${raw_target%/}"
      ;;
    *)
      target="packages/${raw_target%/}"
      ;;
  esac

  case "$target" in
    */../*|../*|*/..)
      echo "error: package target must not contain '..': $raw_target" >&2
      usage
      exit 1
      ;;
  esac
  case "$target" in
    packages/*) ;;
    *)
      echo "error: package target must be under packages/: $raw_target" >&2
      usage
      exit 1
      ;;
  esac
  if [ ! -d "$target" ]; then
    echo "error: package target directory not found: $target" >&2
    exit 1
  fi
  if [ ! -f "$target/package.json" ]; then
    echo "error: package target is not a package root: $target" >&2
    exit 1
  fi

  printf '%s\n' "$target" >> "$tmp_explicit_targets"
  explicit_targets=1
}

while [ $# -gt 0 ]; do
  case "$1" in
    --staged-only)
      staged_only=1
      ;;
    --package|--target)
      if [ $# -lt 2 ]; then
        echo "error: $1 requires a package target" >&2
        usage
        exit 1
      fi
      append_explicit_target "$2"
      shift
      ;;
    --package=*|--target=*)
      append_explicit_target "${1#*=}"
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

if [ "$staged_only" -eq 1 ] && [ "$explicit_targets" -eq 1 ]; then
  echo "error: --staged-only cannot be combined with explicit package targets" >&2
  usage
  exit 1
fi

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

if [ "$explicit_targets" -eq 1 ]; then
  LC_ALL=C sort -u "$tmp_explicit_targets" > "$tmp_targets"
elif [ "$staged_only" -eq 1 ]; then
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
