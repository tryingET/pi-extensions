#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
node --test tests/protocol-benchmark.test.js
first="$(mktemp)"
trap 'rm -f "$first"' EXIT
./autoresearch.sh >/dev/null
cp .autoresearch/protocol-token-aggregate.json "$first"
output="$(./autoresearch.sh)"
cmp "$first" .autoresearch/protocol-token-aggregate.json
if ! grep -Eq '^METRIC tokens_per_correct_mutation_case=[0-9]+([.][0-9]+)?$' <<<"$output"; then
  echo "error: required baseline metric missing" >&2
  exit 1
fi
