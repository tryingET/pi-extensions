#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
bash -n "$script_dir/benchmark.sh"
test -s "$script_dir/shutdown-probe.ts"
output=$(bash "$script_dir/benchmark.sh" --profile no-extensions --mode json --trials 1)
grep -Eq '^METRIC startup_elapsed_ms_median=[0-9]+$' <<<"$output"
printf 'startup latency harness check: pass\n'
