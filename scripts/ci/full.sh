#!/bin/sh
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "error: not a git repo" >&2; exit 1; }
cd "$repo_root"

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

"$script_dir/smoke.sh"

if [ -f "./governance/work-items.json" ] && [ -f "./crates/ak-cli/Cargo.toml" ] && command -v cargo >/dev/null 2>&1; then
  cargo run --quiet --bin ak -- work-items check --repo "$repo_root" --path "./governance/work-items.json"
fi

if [ -x "./scripts/rocs.sh" ] && [ -f "./ontology/manifest.yaml" ]; then
  if [ "${PI_SKIP_ROCS:-0}" = "1" ]; then
    echo "skipping ROCS validation: PI_SKIP_ROCS=1 (workspace-owned runner unavailable)"
  else
    ./scripts/rocs.sh version
    ./scripts/rocs.sh build --repo . --resolve-refs --clean
    ./scripts/rocs.sh validate --repo . --resolve-refs
  fi
fi

if [ -f "./scripts/release-components.mjs" ] && [ -f "./.release-please-config.json" ] && [ -f "./.release-please-manifest.json" ]; then
  node ./scripts/release-components.mjs validate
fi

if [ -f "./scripts/validate-package-release-contracts.mjs" ]; then
  if [ "${PI_SKIP_PACKAGE_RELEASE_CONTRACTS:-0}" = "1" ]; then
    echo "skipping aggregate package release contracts: dedicated release-check matrix owns CI coverage"
  else
    node ./scripts/validate-package-release-contracts.mjs
  fi
fi

if [ -f "./scripts/pi-host-compatibility-canary.mjs" ] && [ -f "./policy/pi-host-compatibility-canary.json" ]; then
  node ./scripts/pi-host-compatibility-canary.mjs validate
fi

if [ -f "./scripts/release-components.test.mjs" ]; then
  node --test ./scripts/release-components.test.mjs
fi

if [ -f "./scripts/pi-host-compatibility-canary.test.mjs" ]; then
  node --test ./scripts/pi-host-compatibility-canary.test.mjs
fi

if [ -f "./scripts/package-quality-gate.test.mjs" ]; then
  node --test ./scripts/package-quality-gate.test.mjs
fi

if [ -f "./scripts/root-doc-alignment.test.mjs" ]; then
  node --test ./scripts/root-doc-alignment.test.mjs
fi

if [ -x "./scripts/ci/packages.sh" ]; then
  if [ "${PI_SKIP_PACKAGES:-0}" = "1" ]; then
    echo "skipping aggregate package quality gates: dedicated release-check matrix owns CI coverage"
  else
    ./scripts/ci/packages.sh
  fi
fi

if [ "${PI_HOST_COMPAT_CANARY:-0}" = "1" ] && [ -f "./scripts/pi-host-compatibility-canary.mjs" ]; then
  node ./scripts/pi-host-compatibility-canary.mjs run --profile "${PI_HOST_COMPAT_PROFILE:-current}"
fi
