#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
node scripts/generate-golden-vectors.mjs
node scripts/validate-proto-source.mjs
node --test tests/*.test.mjs
node scripts/validate-artifacts.mjs
if [[ "${SKIP_PROTO:-0}" != "1" ]]; then
  npm run proto:lint
  npm run proto:generate
  REQUIRE_GENERATED_PROTO=1 node scripts/validate-generated-proto.mjs
fi
if [[ "${SKIP_RUST:-0}" != "1" ]]; then
  npm run rust:fmt
  npm run rust:test
fi
if [[ "${SKIP_TLC:-0}" != "1" ]]; then
  npm run formal:check
fi
npm pack --dry-run >/dev/null
echo "Release check passed."
