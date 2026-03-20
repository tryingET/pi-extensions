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

if [ -f "./scripts/release-components.mjs" ] && [ -f "./.release-please-config.json" ] && [ -f "./.release-please-manifest.json" ]; then
  node ./scripts/release-components.mjs validate
fi

if [ -f "./scripts/release-components.test.mjs" ]; then
  node --test ./scripts/release-components.test.mjs
fi

if [ -f "./scripts/pi-host-compatibility-canary.test.mjs" ]; then
  node --test ./scripts/pi-host-compatibility-canary.test.mjs
fi

if [ -x "./scripts/ci/packages.sh" ]; then
  ./scripts/ci/packages.sh
fi

if [ "${PI_HOST_COMPAT_CANARY:-0}" = "1" ] && [ -f "./scripts/pi-host-compatibility-canary.mjs" ]; then
  node ./scripts/pi-host-compatibility-canary.mjs run --profile "${PI_HOST_COMPAT_PROFILE:-current}"
fi
