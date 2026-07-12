#!/usr/bin/env bash
# summary: "Configures the package checkout to use its tracked Git hooks and reports the available hook runner."
# read_when:
#   - "Installing or troubleshooting package-local Git hook execution."
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

git -C "$ROOT_DIR" config core.hooksPath .githooks
echo "Configured git hooks path: .githooks"

if command -v prek >/dev/null 2>&1; then
  echo "prek detected: pre-commit hook will run prek.toml"
else
  echo "prek not found: pre-commit hook will fallback to scripts/validate-structure.sh"
fi
