#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
required=(.copier-answers.yml AGENTS.md CHANGELOG.md LICENSE README.md biome.jsonc package.json docs/project/implementation-entry-plan.md policy/engineering-lane.json policy/security-policy.json scripts/quality-gate.sh scripts/release-check.sh scripts/validate-artifacts.mjs scripts/validate-structure.sh tsconfig.json)
for p in "${required[@]}"; do [[ -e "$p" ]] || { echo "missing required path: $p" >&2; exit 1; }; done
node -e 'const p=require("./package.json");if(p["x-pi-template"]?.workspacePath!=="packages/pi-tool-execution-boundary")process.exit(1)'
echo "Structure validation passed."
