#!/usr/bin/env sh
set -eu

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
core_project_default="${ROCS_CORE_PROJECT:-$HOME/ai-society/core/rocs-cli}"

say() {
  printf '%s\n' "$*"
}

err() {
  printf '%s\n' "$*" >&2
}

die() {
  err "error: $*"
  exit 1
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

usage() {
  cat <<'EOF'
usage: scripts/rocs.sh [--doctor|--which|--help] [rocs args...]

Portable ROCS launcher with deterministic resolution order:
  1) ROCS_BIN override
  2) vendored ./tools/rocs-cli
  3) local rocs-cli project (this repo)
  4) workspace core ~/ai-society/core/rocs-cli (or ROCS_CORE_PROJECT)
  5) rocs on PATH

When --resolve-refs is present and --workspace-root is omitted, the launcher
will inject an inferred workspace root from (in order):
  - PI_ONTOLOGY_WORKSPACE_ROOT
  - ROCS_WORKSPACE_ROOT
  - repo ancestry containing core/rocs-cli or core/ontology-kernel
  - the parent workspace of ROCS_CORE_PROJECT

Examples:
  ./scripts/rocs.sh version
  ./scripts/rocs.sh validate --repo .
  ./scripts/rocs.sh --doctor
  ./scripts/rocs.sh --which
EOF
}

is_local_rocs_project() {
  [ -f "$repo_root/pyproject.toml" ] || return 1
  grep -q 'name = "rocs-cli"' "$repo_root/pyproject.toml"
}

select_runner() {
  if [ -n "${ROCS_BIN:-}" ]; then
    printf '%s\n' "rocs-bin"
    return
  fi

  if [ -d "$repo_root/tools/rocs-cli" ]; then
    if has_cmd uvx; then
      printf '%s\n' "vendored-uvx"
      return
    fi
    if has_cmd uv; then
      printf '%s\n' "vendored-uv"
      return
    fi
    printf '%s\n' "vendored-missing-runtime"
    return
  fi

  if is_local_rocs_project; then
    if has_cmd uv; then
      printf '%s\n' "local-project-uv"
      return
    fi
    if has_cmd python; then
      printf '%s\n' "local-project-python"
      return
    fi
  fi

  if [ -d "$core_project_default" ] && [ -f "$core_project_default/pyproject.toml" ] && has_cmd uv; then
    printf '%s\n' "workspace-core-uv"
    return
  fi

  if has_cmd rocs; then
    printf '%s\n' "path-rocs"
    return
  fi

  printf '%s\n' "missing"
}

runner_desc() {
  case "$1" in
    rocs-bin)
      printf 'ROCS_BIN=%s\n' "${ROCS_BIN}"
      ;;
    vendored-uvx)
      printf 'vendored via uvx: %s\n' "$repo_root/tools/rocs-cli"
      ;;
    vendored-uv)
      printf 'vendored via uv tool run: %s\n' "$repo_root/tools/rocs-cli"
      ;;
    vendored-missing-runtime)
      printf 'vendored found but missing uv/uvx: %s\n' "$repo_root/tools/rocs-cli"
      ;;
    local-project-uv)
      printf 'local rocs-cli project via uv --project %s\n' "$repo_root"
      ;;
    local-project-python)
      printf 'local rocs-cli project via python -m rocs_cli (%s)\n' "$repo_root"
      ;;
    workspace-core-uv)
      printf 'workspace core via uv --project %s\n' "$core_project_default"
      ;;
    path-rocs)
      printf 'rocs on PATH (%s)\n' "$(command -v rocs)"
      ;;
    missing)
      printf 'unresolved (no viable rocs runner)\n'
      ;;
    *)
      printf 'unknown runner token: %s\n' "$1"
      ;;
  esac
}

normalize_existing_dir() {
  candidate="${1:-}"
  [ -n "$candidate" ] || return 1
  [ -d "$candidate" ] || return 1
  CDPATH= cd -- "$candidate" && pwd
}

infer_workspace_root_from_repo() {
  current="$repo_root"
  while :; do
    if [ -d "$current/core/rocs-cli" ] || [ -d "$current/core/ontology-kernel" ]; then
      printf '%s\n' "$current"
      return 0
    fi
    parent="$(dirname "$current")"
    [ "$parent" != "$current" ] || return 1
    current="$parent"
  done
}

infer_workspace_root_from_core_project() {
  [ -d "$core_project_default" ] || return 1
  core_dir="$(dirname "$core_project_default")"
  [ "$(basename "$core_dir")" = "core" ] || return 1
  workspace_root="$(dirname "$core_dir")"
  if [ -d "$workspace_root/core/rocs-cli" ] || [ -d "$workspace_root/core/ontology-kernel" ]; then
    printf '%s\n' "$workspace_root"
    return 0
  fi
  return 1
}

resolve_workspace_root() {
  normalize_existing_dir "${PI_ONTOLOGY_WORKSPACE_ROOT:-}" || \
    normalize_existing_dir "${ROCS_WORKSPACE_ROOT:-}" || \
    infer_workspace_root_from_repo || \
    infer_workspace_root_from_core_project
}

has_arg() {
  needle="$1"
  shift
  for arg in "$@"; do
    [ "$arg" = "$needle" ] && return 0
  done
  return 1
}

doctor() {
  runner="$(select_runner)"

  say "rocs launcher doctor"
  say "- repo_root: $repo_root"
  say "- core_project_default: $core_project_default"
  say "- has uv: $(has_cmd uv && printf yes || printf no)"
  say "- has uvx: $(has_cmd uvx && printf yes || printf no)"
  say "- has python: $(has_cmd python && printf yes || printf no)"
  say "- has rocs on PATH: $(has_cmd rocs && printf yes || printf no)"
  say "- has vendored tools/rocs-cli: $([ -d "$repo_root/tools/rocs-cli" ] && printf yes || printf no)"
  say "- local project is rocs-cli: $(is_local_rocs_project && printf yes || printf no)"
  say "- resolved workspace_root: $(resolve_workspace_root 2>/dev/null || printf unavailable)"
  say "- selected runner: $(runner_desc "$runner")"

  if [ "$runner" = "missing" ] || [ "$runner" = "vendored-missing-runtime" ]; then
    return 1
  fi
  return 0
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

if [ "${1:-}" = "--doctor" ]; then
  doctor
  exit $?
fi

runner="$(select_runner)"

if [ "${1:-}" = "--which" ]; then
  runner_desc "$runner"
  if [ "$runner" = "missing" ] || [ "$runner" = "vendored-missing-runtime" ]; then
    exit 1
  fi
  exit 0
fi

if has_arg "--resolve-refs" "$@" && ! has_arg "--workspace-root" "$@"; then
  inferred_workspace_root="$(resolve_workspace_root 2>/dev/null || true)"
  if [ -n "$inferred_workspace_root" ]; then
    set -- "$@" "--workspace-root" "$inferred_workspace_root"
  fi
fi

case "$runner" in
  rocs-bin)
    exec "$ROCS_BIN" "$@"
    ;;
  vendored-uvx)
    exec uvx -n --from "$repo_root/tools/rocs-cli" rocs "$@"
    ;;
  vendored-uv)
    exec uv tool run --from "$repo_root/tools/rocs-cli" rocs "$@"
    ;;
  vendored-missing-runtime)
    die "vendored tools/rocs-cli detected but uv/uvx is missing"
    ;;
  local-project-uv)
    exec uv --project "$repo_root" run rocs "$@"
    ;;
  local-project-python)
    exec python -m rocs_cli "$@"
    ;;
  workspace-core-uv)
    exec uv --project "$core_project_default" run rocs "$@"
    ;;
  path-rocs)
    exec rocs "$@"
    ;;
  *)
    die "unable to locate rocs runner; install uv or set ROCS_BIN"
    ;;
esac
