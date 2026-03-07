#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE' >&2
Usage: bash ./scripts/package-quality-gate.sh <lint|fix|typecheck|test|pre-commit|pre-push|ci> <target> [--mode <auto|simple-package|package-group>]

Examples:
  bash ./scripts/package-quality-gate.sh ci packages/pi-vault-client
  bash ./scripts/package-quality-gate.sh ci packages/pi-interaction --mode package-group
USAGE
}

stage="${1:-}"
target="${2:-}"
shift $(( $# > 0 ? 1 : 0 )) || true
shift $(( $# > 0 ? 1 : 0 )) || true
mode="auto"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      [[ $# -ge 2 ]] || { usage; exit 1; }
      mode="$2"
      shift 2
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
done

case "$stage" in
  lint|fix|typecheck|test|pre-commit|pre-push|ci) ;;
  *) usage; exit 1 ;;
esac

[[ -n "$target" ]] || { usage; exit 1; }
case "$mode" in
  auto|simple-package|package-group) ;;
  *) echo "error: invalid mode: $mode" >&2; usage; exit 1 ;;
esac

TARGET_ROOT="$(cd "$target" && pwd)"
[[ -f "$TARGET_ROOT/package.json" ]] || {
  echo "error: target is not a package root: $target" >&2
  exit 1
}

relative_target() {
  python3 - "$REPO_ROOT" "$1" <<'PY'
import os, sys
print(os.path.relpath(sys.argv[2], sys.argv[1]))
PY
}

TARGET_LABEL="$(relative_target "$TARGET_ROOT")"

has_biome_config() {
  [[ -f "$1/biome.json" ]] || [[ -f "$1/biome.jsonc" ]]
}

run_biome() {
  local workdir="$1"
  shift
  if [[ -x "$workdir/node_modules/.bin/biome" ]]; then
    (cd "$workdir" && ./node_modules/.bin/biome "$@")
    return 0
  fi

  echo "biome: configuration detected but local biome binary is unavailable in $(relative_target "$workdir")." >&2
  echo "Run 'npm install' (or add @biomejs/biome to devDependencies)." >&2
  exit 1
}

run_lint_target() {
  local workdir="$1"
  if ! has_biome_config "$workdir"; then
    echo "lint: skipped ($(relative_target "$workdir"), no biome config found)"
    return 0
  fi

  run_biome "$workdir" check --no-errors-on-unmatched .
}

run_fix_target() {
  local workdir="$1"
  if ! has_biome_config "$workdir"; then
    echo "fix: skipped ($(relative_target "$workdir"), no biome config found)"
    return 0
  fi

  run_biome "$workdir" check --write --no-errors-on-unmatched .
}

run_typecheck_target() {
  local workdir="$1"
  if [[ ! -f "$workdir/tsconfig.json" ]]; then
    echo "typecheck: skipped ($(relative_target "$workdir"), no tsconfig.json found)"
    return 0
  fi

  if [[ -x "$workdir/node_modules/.bin/tsc" ]]; then
    (cd "$workdir" && ./node_modules/.bin/tsc --noEmit)
    return 0
  fi

  echo "typecheck: tsconfig.json found but local tsc binary is unavailable in $(relative_target "$workdir")." >&2
  echo "Run 'npm install' (or add typescript to devDependencies)." >&2
  exit 1
}

run_tests_target() {
  local workdir="$1"
  if [[ ! -d "$workdir/tests" ]]; then
    echo "tests: skipped ($(relative_target "$workdir"), no tests directory found)"
    return 0
  fi

  local -a test_files=()
  while IFS= read -r test_file; do
    test_files+=("$test_file")
  done < <(
    cd "$workdir"
    find tests -type f \( \
      -name '*.test.js' -o \
      -name '*.test.mjs' -o \
      -name '*.test.cjs' -o \
      -name '*.test.ts' -o \
      -name '*.test.tsx' -o \
      -name '*.test.mts' -o \
      -name '*.test.cts' \
    \) | LC_ALL=C sort
  )

  if [[ "${#test_files[@]}" -eq 0 ]]; then
    echo "tests: skipped ($(relative_target "$workdir"), no test files found)"
    return 0
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "tests: node is required to run tests." >&2
    exit 1
  fi

  local needs_tsx="false"
  local test_file
  for test_file in "${test_files[@]}"; do
    case "$test_file" in
      *.test.ts|*.test.tsx|*.test.mts|*.test.cts)
        needs_tsx="true"
        break
        ;;
    esac
  done

  if [[ "$needs_tsx" == "true" ]]; then
    if [[ ! -x "$workdir/node_modules/.bin/tsx" ]]; then
      echo "tests: TypeScript test files detected in $(relative_target "$workdir") but local tsx binary is unavailable." >&2
      exit 1
    fi
    (cd "$workdir" && node --import tsx --test "${test_files[@]}")
    return 0
  fi

  (cd "$workdir" && node --test "${test_files[@]}")
}

should_run_structure_validation_target() {
  local workdir="$1"

  [[ -f "$workdir/scripts/validate-structure.sh" ]] || return 1
  [[ -f "$workdir/.copier-answers.yml" ]] || return 1
  [[ -f "$workdir/docs/project/foundation.md" ]] || return 1
  [[ -f "$workdir/policy/stack-lane.json" ]] || return 1
}

run_structure_validation_target() {
  local workdir="$1"
  shift || true
  if ! should_run_structure_validation_target "$workdir"; then
    echo "structure: skipped ($(relative_target "$workdir"), no monorepo structure contract detected)"
    return 0
  fi

  (cd "$workdir" && bash ./scripts/validate-structure.sh "$@")
}

run_packaging_target() {
  local workdir="$1"
  (cd "$workdir" && npm pack --dry-run)
}

run_simple_stage() {
  local stage_name="$1"
  local workdir="$2"

  printf '==> package quality gate: %s [%s]\n' "$(relative_target "$workdir")" "$stage_name"

  case "$stage_name" in
    lint)
      run_lint_target "$workdir"
      ;;
    fix)
      run_fix_target "$workdir"
      ;;
    typecheck)
      run_typecheck_target "$workdir"
      ;;
    test)
      run_tests_target "$workdir"
      ;;
    pre-commit)
      run_structure_validation_target "$workdir" --staged-only
      run_lint_target "$workdir"
      ;;
    pre-push)
      run_structure_validation_target "$workdir"
      run_lint_target "$workdir"
      run_typecheck_target "$workdir"
      run_tests_target "$workdir"
      ;;
    ci)
      run_structure_validation_target "$workdir"
      run_lint_target "$workdir"
      run_typecheck_target "$workdir"
      run_tests_target "$workdir"
      run_packaging_target "$workdir"
      ;;
  esac
}

find_child_package_roots() {
  local workdir="$1"
  find "$workdir" -mindepth 1 -maxdepth 1 -type d ! -name node_modules ! -name '.*' | while IFS= read -r child; do
    if [[ -f "$child/package.json" ]]; then
      printf '%s\n' "$child"
    fi
  done | LC_ALL=C sort
}

resolve_mode() {
  local workdir="$1"
  if [[ "$mode" != "auto" ]]; then
    printf '%s\n' "$mode"
    return 0
  fi

  if find_child_package_roots "$workdir" | grep -q .; then
    printf '%s\n' "package-group"
  else
    printf '%s\n' "simple-package"
  fi
}

run_package_group_stage() {
  local stage_name="$1"
  local workdir="$2"

  printf '==> package-group quality gate: %s [%s]\n' "$(relative_target "$workdir")" "$stage_name"

  local child_count="0"
  local child
  while IFS= read -r child; do
    [[ -n "$child" ]] || continue
    child_count="$((child_count + 1))"
    run_simple_stage "$stage_name" "$child"
  done < <(find_child_package_roots "$workdir")

  if [[ "$child_count" -eq 0 ]]; then
    echo "error: package-group has no child package roots: $(relative_target "$workdir")" >&2
    exit 1
  fi
}

resolved_mode="$(resolve_mode "$TARGET_ROOT")"

case "$resolved_mode" in
  simple-package)
    run_simple_stage "$stage" "$TARGET_ROOT"
    ;;
  package-group)
    run_package_group_stage "$stage" "$TARGET_ROOT"
    ;;
esac
