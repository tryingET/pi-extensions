#!/bin/sh
# summary: "Runs local-link preflight, repository smoke, and optional governance, release, canary, and package checks."
# read_when:
#   - "Changing full CI sequencing, local dependency preflight, optional validation gates, or aggregate package execution."
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

if [ "${PI_SKIP_PACKAGES:-0}" = "1" ]; then
  echo "skipping local package link validation: PI_SKIP_PACKAGES=1"
else
  node ./scripts/validate-local-package-links.mjs
fi

"$script_dir/smoke.sh"

# Repo-wide readability-budget ratchet: every over-budget file must be split or
# carry a validated owner-scoped exception (policy/file-budget-exceptions.json).
if [ -f "./scripts/file-budget-audit.mjs" ]; then
  node ./scripts/file-budget-audit.mjs --fail --max-warnings "${PI_FILE_BUDGET_MAX_WARNINGS:-12}"
fi

node --test "$script_dir/rocs-validation.test.mjs"

if [ -x "./scripts/rocs.sh" ] && [ -f "./ontology/manifest.yaml" ]; then
  if [ "${PI_SKIP_ROCS:-0}" = "1" ]; then
    echo "skipping ROCS validation: PI_SKIP_ROCS=1 (workspace-owned runner unavailable)"
  else
    "$script_dir/rocs-validation.sh"
  fi
fi

if [ -f "./scripts/release-components.mjs" ] && [ -f "./.release-please-config.json" ] && [ -f "./.release-please-manifest.json" ]; then
  node ./scripts/release-components.mjs validate
fi

node --test ./scripts/root-package-install-contract.test.mjs

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

node --test ./scripts/release-artifact.test.mjs
node --test ./scripts/release-artifact-workflow.test.mjs
node --test ./scripts/release-sbom.test.mjs
node --test ./scripts/release-evidence-workflow.test.mjs
node --test ./scripts/release-evidence-archive.test.mjs
node --test ./scripts/release-state.test.mjs
node --test ./scripts/release-recovery-workflow.test.mjs
node --test ./scripts/release-npm-state.test.mjs
node --test ./scripts/release-npm-workflow.test.mjs
node --test ./scripts/npm-pack-json.test.mjs
node --test ./scripts/pi-extension-generations.test.mjs
if [ -n "${PI_GENERATION_TEST_PI:-}" ]; then
  node -e 'const fs=require("node:fs"),path=require("node:path"); const p=process.env.PI_GENERATION_TEST_PI; if(!path.isAbsolute(p)||path.resolve(p)!==p||fs.realpathSync(p)!==p) throw new Error("PI_GENERATION_TEST_PI must be canonical and absolute"); fs.accessSync(p,fs.constants.X_OK);'
  node --test ./scripts/pi-extension-generations.concurrency.test.mjs
else
  echo "skipping real-Pi immutable-generation concurrency: PI_GENERATION_TEST_PI is not set"
fi

# Keep these suites sequential: both intentionally exercise the canonical-checkout lock.
# Governed CI runs them before runtime materialization publishes package node_modules symlinks.
if [ "${PI_SKIP_HOST_COMPAT_MUTATION_TESTS:-0}" = "1" ]; then
  echo "skipping host compatibility mutation tests: already proven before governed materialization"
else
  node --test ./scripts/pi-host-compatibility-canary.test.mjs
  node --test ./scripts/pi-host-compatibility-canary.recovery.test.mjs
fi

if [ -f "./scripts/package-quality-gate.test.mjs" ]; then
  node --test ./scripts/package-quality-gate.test.mjs
fi

if [ -f "./scripts/validate-local-package-links.test.mjs" ]; then
  (unset PI_SKIP_PACKAGES; node --test ./scripts/validate-local-package-links.test.mjs)
fi

if [ -f "./scripts/root-doc-alignment.test.mjs" ]; then
  node --test ./scripts/root-doc-alignment.test.mjs
fi

if [ -f "./scripts/governed-deep-review-canary.mjs" ]; then
  if [ "${PI_SKIP_GOVERNED_DEEP_REVIEW:-0}" = "1" ]; then
    echo "skipping governed deep-review canary: PI_SKIP_GOVERNED_DEEP_REVIEW=1"
  else
    node ./scripts/governed-deep-review-canary.mjs test --source-root "$repo_root"
  fi
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
