#!/usr/bin/env bash
# ---
# summary: "Makes repository hook entrypoints executable and configures Git to use the tracked hooks directory."
# read_when:
#   - "Installing pi-extensions Git hooks or changing root hook wiring."
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

chmod +x \
  "$ROOT_DIR/.githooks/pre-commit" \
  "$ROOT_DIR/.githooks/pre-push" \
  "$ROOT_DIR/scripts/install-hooks.sh"

git -C "$ROOT_DIR" config core.hooksPath .githooks
echo "Configured git hooks path: .githooks"
echo "Hook wiring:"
echo "  pre-commit -> npm run quality:pre-commit -> scripts/ci/smoke.sh --staged-only + scripts/ci/packages.sh pre-commit --staged-only"
echo "  pre-push   -> npm run quality:pre-push -> scripts/quality-gate.sh pre-push"
