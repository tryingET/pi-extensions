#!/usr/bin/env bash
# summary: Land a ref into the canonical checkout, which live Pi sessions load extensions from: move, install the packages whose manifests changed, link host packages to the Pi on PATH, smoke-test Pi, and move back on any failure.
# read_when:
#   - "You want the canonical pi-extensions checkout at a newer commit (instead of pull, merge or reset by hand)."
#   - "Pi fails with 'Failed to load extension' after the checkout moved."
# Why (2026-09-27, AK6069): `git reset --hard origin/main` here brought a TypeScript 7 import without its
# install, no hook runs on reset, and every Pi start failed for ~25 min. Design: softwareco/infra/workstation
# docs/project/2026-09-27-live-runtime-promotion-design.md.
#
# usage: scripts/land-canonical.sh [--reset] <ref>
#   default   fast-forward only; uncommitted changes of other sessions stay (git refuses an overlap)
#   --reset   reset to <ref> even when it is not a fast-forward; refused while tracked files are modified
# Env: PI_SMOKE_CMD (default `pi --no-session -p ""`: loads every extension like a session, calls no model; `--list-models` tolerates a broken extension), PI_SMOKE_TIMEOUT_S (default 120),
#      LAND_NO_FETCH=1 skips `git fetch`.
set -euo pipefail

mode=ff
if [[ "${1:-}" == "--reset" ]]; then mode=reset; shift; fi
[[ $# -eq 1 ]] || { echo "usage: land-canonical.sh [--reset] <ref>" >&2; exit 2; }
ref="$1"

root="$(git rev-parse --show-toplevel)"
cd "$root"
[[ "$(realpath "$(git rev-parse --git-dir)")" == "$(realpath "$(git rev-parse --git-common-dir)")" ]] ||
  { echo "land-canonical: run this in the canonical checkout, not a linked worktree" >&2; exit 2; }
[[ "${LAND_NO_FETCH:-}" == 1 ]] || git fetch --quiet origin
target="$(git rev-parse --verify "$ref^{commit}")"
previous="$(git rev-parse HEAD)"
if [[ "$target" == "$previous" ]]; then echo '{"outcome":"unchanged","head":"'"$previous"'"}'; exit 0; fi
if [[ "$mode" == ff ]] && ! git merge-base --is-ancestor "$previous" "$target"; then
  echo "land-canonical: $ref is not a fast-forward of HEAD; use --reset (which needs a clean tracked tree)" >&2; exit 2
fi
if [[ "$mode" == reset && -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "land-canonical: tracked files are modified here; --reset would discard another session's work" >&2; exit 2
fi

# packages whose manifest or lock differs between two commits, as directories (the validator's topology)
changed_packages() {
  git diff --name-only "$1" "$2" -- 'package.json' 'package-lock.json' \
    'packages/*/package.json' 'packages/*/package-lock.json' \
    'packages/*/*/package.json' 'packages/*/*/package-lock.json' |
    xargs -r -n1 dirname | sort -u
}

install_packages() {
  local dir
  # shellcheck source=/dev/null
  [[ -f scripts/select-gate-node.sh ]] && source scripts/select-gate-node.sh
  for dir in "$@"; do
    [[ -f "$dir/package-lock.json" ]] || continue
    echo "land-canonical: npm ci --prefix $dir" >&2
    npm ci --prefix "$dir" --no-audit --no-fund >&2 || return 1
  done
}

smoke() {
  local out status=0
  local cmd=(pi --no-session -p "")
  # shellcheck disable=SC2206 # an override is a plain command line
  [[ -n "${PI_SMOKE_CMD:-}" ]] && cmd=($PI_SMOKE_CMD)
  out="$(timeout "${PI_SMOKE_TIMEOUT_S:-120}" "${cmd[@]}" 2>&1 </dev/null)" || status=$?
  if [[ $status -ne 0 ]] || grep -q 'Failed to load extension' <<<"$out"; then
    echo "land-canonical: Pi smoke failed (exit $status): $(grep -m1 -E 'Failed to load extension|Error' <<<"$out" || tail -n1 <<<"$out")" >&2
    return 1
  fi
}

# Host-provided packages (pi-ai, pi-agent-core, pi-coding-agent, pi-tui, typebox) installed here become links
# to the Pi on PATH, so compiled ESM loaded natively from a sibling package shares the host's modules (AK6828).
check() { install_packages "$@" && node scripts/link-host-packages.mjs >&2 && node scripts/package-install-health.mjs >&2 && smoke; }

receipt() {
  printf '{"outcome":"%s","mode":"%s","ref":"%s","previous":"%s","head":"%s","installed":"%s"}\n' \
    "$1" "$mode" "$ref" "$previous" "$(git rev-parse HEAD)" "${packages[*]:-}"
}

mapfile -t packages < <(changed_packages "$previous" "$target")
if [[ "$mode" == ff ]]; then git merge --quiet --ff-only "$target"; else git reset --quiet --hard "$target"; fi

if check "${packages[@]}"; then receipt landed; exit 0; fi

echo "land-canonical: moving back to $previous" >&2
git reset --quiet --keep "$previous"
if check "${packages[@]}"; then receipt rolled_back; else receipt rollback_unhealthy; fi
exit 1
