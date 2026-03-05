#!/bin/sh
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"

"$script_dir/smoke.sh"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "error: not a git repo" >&2; exit 1; }
cd "$repo_root"

if [ -f "./governance/work-items.json" ] && [ -f "./crates/ak-cli/Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
  cargo run --quiet --bin ak -- work-items check --repo "$repo_root" --path "./governance/work-items.json"
fi

if [ -x "./scripts/rocs.sh" ] && [ -f "./ontology/manifest.yaml" ]; then
  ./scripts/rocs.sh version
  ./scripts/rocs.sh build --repo . --resolve-refs --clean
  ./scripts/rocs.sh validate --repo . --resolve-refs
fi
