#!/bin/sh
# summary: Explicitly derive gate-required build outputs; never install dependencies or run prepack manifest rewrites.
# Run only in an isolated checkout or after coordinating with live readers of dist/.
set -eu
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
node ./scripts/check-gate-toolchain.mjs
node ./scripts/validate-package-installs.mjs
node ./scripts/validate-local-package-links.mjs
npm --prefix packages/pi-autonomous-session-control run build:runtime
npm --prefix packages/pi-society-orchestrator run task-session:build
npm --prefix packages/pi-little-helpers run task-session:build
npm --prefix packages/pi-telemetry run build:review-runtime
