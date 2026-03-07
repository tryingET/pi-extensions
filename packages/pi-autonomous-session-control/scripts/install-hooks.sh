#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

chmod +x \
  "$ROOT_DIR/.githooks/pre-commit" \
  "$ROOT_DIR/.githooks/pre-push" \
  "$ROOT_DIR/scripts/install-hooks.sh" \
  "$ROOT_DIR/scripts/quality-gate.sh"

git -C "$ROOT_DIR" config core.hooksPath .githooks
echo "Configured git hooks path: .githooks"
echo "Hook wiring:"
echo "  pre-commit -> scripts/quality-gate.sh pre-commit"
echo "  pre-push   -> scripts/quality-gate.sh pre-push"
