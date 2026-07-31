#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: benchmark.sh [--profile current|no-extensions|interaction|vault|hotspots|auto]
                    [--mode json|rpc] [--trials N]

Emits: METRIC startup_elapsed_ms_median=<integer>

Environment:
  PI_STARTUP_MODEL_SCOPE  model scope used only to suppress unrelated global
                          enabledModels warnings (default: openai-codex/gpt-5.6-sol)

Profiles:
  current        current user-configured Pi resource set
  no-extensions host baseline plus the explicit shutdown probe
  interaction    candidate worktree's pi-interaction entry only
  vault          candidate worktree's pi-vault-client entry only
  hotspots       interaction + vault candidate entries
  auto           infer interaction/vault/hotspots from candidate git changes;
                 otherwise use current
EOF
}

profile="auto"
mode="rpc"
trials=5
while (($#)); do
  case "$1" in
    --profile) profile=${2:?missing profile}; shift 2 ;;
    --mode) mode=${2:?missing mode}; shift 2 ;;
    --trials) trials=${2:?missing trials}; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$mode" in json|rpc) ;; *) echo "invalid mode: $mode" >&2; exit 2 ;; esac
[[ "$trials" =~ ^[1-9][0-9]*$ ]] || { echo "trials must be a positive integer" >&2; exit 2; }

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
default_repo_root=$(cd "$script_dir/../.." && pwd -P)
repo_root=$(cd "${PI_STARTUP_REPO_ROOT:-$default_repo_root}" && pwd -P)
probe="$script_dir/shutdown-probe.ts"
model_scope=${PI_STARTUP_MODEL_SCOPE:-openai-codex/gpt-5.6-sol}
[[ -n "$model_scope" ]] || { echo "PI_STARTUP_MODEL_SCOPE must not be empty" >&2; exit 2; }

changed_paths() {
  local base=""
  if git -C "$repo_root" show-ref --verify --quiet refs/heads/main; then
    base=$(git -C "$repo_root" merge-base HEAD refs/heads/main 2>/dev/null || true)
  fi
  {
    [[ -n "$base" ]] && git -C "$repo_root" diff --name-only "$base" HEAD || true
    git -C "$repo_root" diff --name-only || true
    git -C "$repo_root" diff --name-only --cached || true
  } | sort -u
}

if [[ "$profile" == auto ]]; then
  changes=$(changed_paths)
  has_interaction=0
  has_vault=0
  grep -q '^packages/pi-interaction/pi-interaction/' <<<"$changes" && has_interaction=1 || true
  grep -q '^packages/pi-vault-client/' <<<"$changes" && has_vault=1 || true
  if ((has_interaction && has_vault)); then
    profile=hotspots
  elif ((has_interaction)); then
    profile=interaction
  elif ((has_vault)); then
    profile=vault
  else
    profile=current
  fi
fi

case "$profile" in
  current|no-extensions|interaction|vault|hotspots) ;;
  *) echo "invalid profile: $profile" >&2; exit 2 ;;
esac

run_root="$repo_root/.autoresearch/startup-latency/runs"
mkdir -p "$run_root"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
run_dir="$run_root/${stamp}-${profile}-${mode}-$$"
mkdir -p "$run_dir"

common=(pi --offline --mode "$mode" --no-session --no-skills --no-prompt-templates --no-themes --no-context-files --models "$model_scope" -e "$probe")
case "$profile" in
  current)
    command=("${common[@]}")
    ;;
  no-extensions)
    command=("${common[@]}" --no-extensions)
    ;;
  interaction)
    command=("${common[@]}" --no-extensions -e "$repo_root/packages/pi-interaction/pi-interaction/extensions/input-triggers.ts")
    ;;
  vault)
    command=("${common[@]}" --no-extensions -e "$repo_root/packages/pi-vault-client/extensions/vault.js")
    ;;
  hotspots)
    command=("${common[@]}" --no-extensions \
      -e "$repo_root/packages/pi-interaction/pi-interaction/extensions/input-triggers.ts" \
      -e "$repo_root/packages/pi-vault-client/extensions/vault.js")
    ;;
esac

printf 'trial\telapsed_ms\n' >"$run_dir/trials.tsv"
for ((trial=1; trial<=trials; trial++)); do
  start_ns=$(date +%s%N)
  (
    cd "${PI_STARTUP_BENCH_CWD:-$repo_root}"
    PI_OFFLINE=1 PI_TIMING=1 timeout 90 "${command[@]}"
  ) >"$run_dir/trial-${trial}.stdout.jsonl" 2>"$run_dir/trial-${trial}.timings.txt"
  end_ns=$(date +%s%N)
  elapsed_ms=$(((end_ns - start_ns) / 1000000))
  printf '%s\t%s\n' "$trial" "$elapsed_ms" | tee -a "$run_dir/trials.tsv" >/dev/null
done

mapfile -t sorted < <(tail -n +2 "$run_dir/trials.tsv" | cut -f2 | sort -n)
count=${#sorted[@]}
if ((count % 2)); then
  median=${sorted[$((count / 2))]}
else
  lower=${sorted[$((count / 2 - 1))]}
  upper=${sorted[$((count / 2))]}
  median=$(((lower + upper) / 2))
fi

node - "$run_dir/summary.json" "$profile" "$mode" "$trials" "$median" "$model_scope" "$run_dir/trials.tsv" <<'NODE'
const fs = require("node:fs");
const [out, profile, mode, trials, median, modelScope, tsv] = process.argv.slice(2);
const rows = fs.readFileSync(tsv, "utf8").trim().split("\n").slice(1).map((line) => {
  const [trial, elapsedMs] = line.split("\t").map(Number);
  return { trial, elapsedMs };
});
fs.writeFileSync(out, `${JSON.stringify({
  kind: "pi.startup_latency_benchmark.v1",
  capturedAt: new Date().toISOString(),
  profile,
  mode,
  trials: Number(trials),
  modelScope,
  metric: { name: "startup_elapsed_ms_median", direction: "lower", unit: "ms", value: Number(median) },
  samples: rows,
}, null, 2)}\n`);
NODE

printf 'PROFILE %s\n' "$profile"
printf 'MODE %s\n' "$mode"
printf 'TRIALS %s\n' "$trials"
printf 'MODEL_SCOPE %s\n' "$model_scope"
printf 'RUN_DIR %s\n' "$run_dir"
printf 'METRIC startup_elapsed_ms_median=%s\n' "$median"
