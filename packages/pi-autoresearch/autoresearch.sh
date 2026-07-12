#!/usr/bin/env bash
# ---
# summary: "Measures the package test suite wall-clock duration and emits it as the total_ms autoresearch metric."
# read_when:
#   - "Changing the default pi-autoresearch benchmark command, test invocation, or elapsed-time metric."
# ---
set -euo pipefail

start_ms=$(node -e 'console.log(Date.now())')
npm test
end_ms=$(node -e 'console.log(Date.now())')
echo "METRIC total_ms=$((end_ms - start_ms))"
