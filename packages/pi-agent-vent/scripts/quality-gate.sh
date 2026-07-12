#!/usr/bin/env bash
# ---
# summary: runs pi-agent-vent quality stages through the root gate or package fallback
# read_when:
#   - checking lint, types, tests, or scaffold structure in varied checkout layouts
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEARCH_DIR="$ROOT_DIR"
OVERRIDE_GATE="${PACKAGE_QUALITY_GATE_SCRIPT:-}"

if [[ -n "$OVERRIDE_GATE" ]]; then
  if [[ -f "$OVERRIDE_GATE" ]]; then
    exec bash "$OVERRIDE_GATE" "${1:-}" "$ROOT_DIR"
  fi
  echo "error: PACKAGE_QUALITY_GATE_SCRIPT does not exist: $OVERRIDE_GATE" >&2
  exit 1
fi

while [[ "$SEARCH_DIR" != "/" ]]; do
  if [[ -x "$SEARCH_DIR/scripts/package-quality-gate.sh" ]]; then
    exec bash "$SEARCH_DIR/scripts/package-quality-gate.sh" "${1:-}" "$ROOT_DIR"
  fi
  SEARCH_DIR="$(dirname "$SEARCH_DIR")"
done

stage="${1:-}"
case "$stage" in
  lint|fix|typecheck|test|pre-commit|pre-push|ci) ;;
  *)
    echo "Usage: bash ./scripts/quality-gate.sh <lint|fix|typecheck|test|pre-commit|pre-push|ci>" >&2
    exit 1
    ;;
esac

relative_root() {
  basename "$ROOT_DIR"
}

has_biome_config() {
  [[ -f "$ROOT_DIR/biome.json" ]] || [[ -f "$ROOT_DIR/biome.jsonc" ]]
}

run_biome() {
  if ! has_biome_config; then
    echo "lint: skipped ($(relative_root), no biome config found)"
    return 0
  fi
  if [[ ! -x "$ROOT_DIR/node_modules/.bin/biome" ]]; then
    echo "biome: skipped ($(relative_root), local biome binary unavailable; run npm install to enable lint)."
    return 0
  fi

  # Runtime tarballs do not necessarily include a VCS ignore file. The package biome config
  # already excludes node_modules/dist/coverage, so disable VCS-ignore-file loading there.
  local -a vcs_args=()
  if [[ ! -f "$ROOT_DIR/.gitignore" ]]; then
    vcs_args+=(--vcs-use-ignore-file=false)
  fi

  (cd "$ROOT_DIR" && ./node_modules/.bin/biome "$@" "${vcs_args[@]}")
}

run_lint() {
  run_biome check --no-errors-on-unmatched .
}

run_fix() {
  run_biome check --write --no-errors-on-unmatched .
}

run_typecheck() {
  if [[ ! -f "$ROOT_DIR/tsconfig.json" ]]; then
    echo "typecheck: skipped ($(relative_root), no tsconfig.json found)"
    return 0
  fi
  if [[ -x "$ROOT_DIR/node_modules/.bin/tsgo" ]]; then
    (cd "$ROOT_DIR" && ./node_modules/.bin/tsgo --noEmit)
    return 0
  fi
  if [[ -x "$ROOT_DIR/node_modules/.bin/tsc" ]]; then
    (cd "$ROOT_DIR" && ./node_modules/.bin/tsc --noEmit)
    return 0
  fi
  echo "typecheck: skipped ($(relative_root), tsconfig found but no local tsgo/tsc binary)."
}

run_tests() {
  if [[ ! -d "$ROOT_DIR/tests" ]]; then
    echo "tests: skipped ($(relative_root), no tests directory found)"
    return 0
  fi
  mapfile -t test_files < <(
    cd "$ROOT_DIR"
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
    echo "tests: skipped ($(relative_root), no test files found)"
    return 0
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
    if [[ ! -x "$ROOT_DIR/node_modules/.bin/tsx" ]]; then
      echo "tests: TypeScript test files detected but local tsx binary is unavailable." >&2
      exit 1
    fi
    (cd "$ROOT_DIR" && node --import tsx --test "${test_files[@]}")
    return 0
  fi

  (cd "$ROOT_DIR" && node --test "${test_files[@]}")
}

run_structure_if_source_checkout() {
  if [[ -f "$ROOT_DIR/.copier-answers.yml" && -f "$ROOT_DIR/scripts/validate-structure.sh" ]]; then
    (cd "$ROOT_DIR" && bash ./scripts/validate-structure.sh)
  else
    echo "structure: skipped ($(relative_root), source-checkout structure contract not present)"
  fi
}

echo "==> package local quality gate: $(relative_root) [$stage]"
echo "note: monorepo root gate not found; running self-contained package fallback."

case "$stage" in
  lint)
    run_lint
    ;;
  fix)
    run_fix
    ;;
  typecheck)
    run_typecheck
    ;;
  test)
    run_tests
    ;;
  pre-commit)
    run_structure_if_source_checkout
    run_lint
    ;;
  pre-push)
    run_structure_if_source_checkout
    run_lint
    run_typecheck
    run_tests
    ;;
  ci)
    run_structure_if_source_checkout
    run_lint
    run_typecheck
    run_tests
    ;;
esac
