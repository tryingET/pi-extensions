#!/usr/bin/env bash
set -euo pipefail

start_ms=$(node -e 'console.log(Date.now())')
npm test
end_ms=$(node -e 'console.log(Date.now())')
echo "METRIC total_ms=$((end_ms - start_ms))"
