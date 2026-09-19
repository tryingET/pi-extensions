#!/usr/bin/env bash
# ---
# summary: "Installs tracked hooks while preserving the recognized UBS chain and refusing unknown hook owners."
# read_when:
#   - "Installing pi-extensions Git hooks or changing root hook wiring."
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
common_dir="$(git -C "$ROOT_DIR" rev-parse --path-format=absolute --git-common-dir)"
chain_dir="$common_dir/ubs-chain-hooks"
configured="$(git -C "$ROOT_DIR" config --get core.hooksPath || true)"
posts=(post-checkout post-merge post-rewrite)
use_chain=false
case "$configured" in
  ''|.githooks|"$ROOT_DIR/.githooks") ;;
  .git/ubs-chain-hooks|"$chain_dir") use_chain=true ;;
  *) echo "error: unknown core.hooksPath '$configured'; coordinate with its owner instead of replacing it" >&2; exit 1 ;;
esac

# Unconfigured Git still has an effective hook owner: the default hooks directory.
# Git's executable *.sample templates are not active hooks; other executables may
# be enforcement installed by an owner and must not be silently bypassed.
if [[ -z "$configured" ]]; then
  for hook in "$common_dir/hooks/"*; do
    [[ "$hook" == *.sample ]] && continue
    if [[ -x "$hook" && ! -d "$hook" ]]; then
      echo "error: active default hook $hook; coordinate with its owner before switching hook directories" >&2
      exit 1
    fi
  done
fi

# Preflight the complete change before installing anything. Existing pre-commit
# and pre-push chain entries are owner-managed and must remain byte-for-byte intact.
if "$use_chain"; then
  [[ -d "$chain_dir" && -x "$chain_dir/pre-commit" && -x "$chain_dir/pre-push" ]] || {
    echo "error: incomplete UBS chain; coordinate with its owner" >&2; exit 1;
  }
  for hook in "${posts[@]}"; do
    target="$chain_dir/$hook"
    if [[ -e "$target" || -L "$target" ]]; then
      if [[ ! -L "$target" ]] || [[ "$(readlink "$target")" != "$ROOT_DIR/.githooks/$hook" ]]; then
        echo "error: existing $target has another owner; refusing to overwrite or bypass it" >&2; exit 1
      fi
    fi
  done
fi
for hook in pre-commit pre-push "${posts[@]}"; do
  [[ -f "$ROOT_DIR/.githooks/$hook" ]] || { echo "error: missing tracked hook $hook" >&2; exit 1; }
done
chmod +x "$ROOT_DIR/scripts/install-hooks.sh"
for hook in pre-commit pre-push "${posts[@]}"; do chmod +x "$ROOT_DIR/.githooks/$hook"; done
if "$use_chain"; then
  for hook in "${posts[@]}"; do
    target="$chain_dir/$hook"
    [[ -L "$target" ]] || ln -s "$ROOT_DIR/.githooks/$hook" "$target"
  done
  # Preserve the owner's path semantics too. Its pre-commit may be bound to
  # the canonical checkout; do not silently enable that chain in other worktrees.
  echo "Preserved UBS chain and core.hooksPath: $configured"
else
  git -C "$ROOT_DIR" config core.hooksPath .githooks
  echo "Configured git hooks path: .githooks"
fi
echo "Hook wiring:"
echo "  pre-commit -> npm run quality:pre-commit -> scripts/ci/smoke.sh --staged-only + scripts/ci/packages.sh pre-commit --staged-only"
echo "  pre-push   -> npm run quality:pre-push -> scripts/quality-gate.sh pre-push"
echo "  post-checkout / post-merge / post-rewrite -> read-only install warnings (never npm ci)"
