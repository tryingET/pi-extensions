#!/bin/sh
set -eu

say() { printf '%s\n' "$*"; }
err() { printf '%s\n' "$*" >&2; }
die() { err "error: $*"; exit 1; }
die_env() { err "error: $*"; exit 2; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die_env "missing dependency: $1"
}

need_cmd git
need_cmd grep
need_cmd sed

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || die_env "not a git repo"
cd "$repo_root"

base_branch="${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:-${CI_DEFAULT_BRANCH:-}}"
if [ -z "$base_branch" ]; then
  base_branch="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
fi
[ -n "$base_branch" ] || base_branch="main"

base_ref=""
if git remote get-url origin >/dev/null 2>&1; then
  git fetch --no-tags origin "$base_branch" >/dev/null 2>&1 || true
  if git show-ref --verify --quiet "refs/remotes/origin/$base_branch"; then
    base_ref="origin/$base_branch"
  fi
fi
if [ -z "$base_ref" ] && git show-ref --verify --quiet "refs/heads/$base_branch"; then
  base_ref="$base_branch"
fi
[ -n "$base_ref" ] || die_env "cannot resolve base ref for branch '$base_branch' (need origin/$base_branch or local $base_branch)"

changed_files="$(git diff --name-only "$base_ref"...HEAD)"
protected_hits="$(printf '%s\n' "$changed_files" | grep -nE '^(docs/_core($|/))' || true)"
if [ -n "$protected_hits" ]; then
  err "error: protected core paths modified:"
  err "$protected_hits"
  exit 1
fi

[ -x "./scripts/ci/full.sh" ] || die_env "missing or non-executable: scripts/ci/full.sh"
if [ -f "./docs/dev/now.md" ]; then
  [ -f "./AGENTS.md" ] || die "docs/dev/now.md exists but AGENTS.md is missing"
  grep -q "docs/dev/now.md" "./AGENTS.md" || die "docs/dev/now.md exists but is not referenced from AGENTS.md"
fi

say "ok: ci smoke"
