#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
repo_root=$(cd "$script_dir/../.." && pwd -P)
bash -n "$script_dir/benchmark.sh"
test -s "$script_dir/shutdown-probe.ts"
node --check "$script_dir/dogfood-vault-rpc.mjs"
node "$script_dir/dogfood-vault-rpc.mjs" --help >/dev/null
node --check "$script_dir/summarize-timings.mjs"
node "$script_dir/summarize-timings.mjs" --help >/dev/null
output=$(bash "$script_dir/benchmark.sh" --profile no-extensions --mode json --trials 1)
grep -Fxq 'MODEL_SCOPE openai-codex/gpt-5.6-sol' <<<"$output"
grep -Eq '^METRIC startup_elapsed_ms_median=[0-9]+$' <<<"$output"

tmp_dir=$(mktemp -d "${TMPDIR:?TMPDIR must be set}/startup-latency-check.XXXXXX")
trap 'rm -rf "$tmp_dir"' EXIT
cat >"$tmp_dir/example-extension.ts" <<'EOF'
export default function () {}
EOF
custom_output=$(bash "$script_dir/benchmark.sh" --profile custom --extension "$tmp_dir/example-extension.ts" --mode json --trials 1)
grep -Fxq "EXTENSION $tmp_dir/example-extension.ts" <<<"$custom_output"
grep -Eq '^METRIC startup_elapsed_ms_median=[0-9]+$' <<<"$custom_output"
for trial in 1 2; do
  import_ms=$((8 + trial * 2))
  cat >"$tmp_dir/trial-${trial}.timings.txt" <<EOF
--- Startup Timings: extensions ---
  $repo_root/packages/pi-example/extensions/example.ts module import: ${import_ms}ms
  $repo_root/packages/pi-example/extensions/example.ts factory: 2ms
  TOTAL: $((import_ms + 2))ms
-----------------------------------
EOF
done
node "$script_dir/summarize-timings.mjs" --owned-only --output "$tmp_dir/summary.json" "$tmp_dir" >/dev/null
node -e '
  const summary = require(process.argv[1]);
  const entry = summary.entries.find((candidate) => candidate.packageName === "pi-example");
  if (!entry || entry.ownership !== "owned" || entry.sampleCount !== 2 || entry.meanTotalMs !== 13) process.exit(1);
' "$tmp_dir/summary.json"
printf 'startup latency harness check: pass\n'
