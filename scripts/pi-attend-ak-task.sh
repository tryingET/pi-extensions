#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# Sequential on purpose: the next run starts only after the previous pi process exits.
# Do not run overlapping seam tasks in parallel in the same worktree.
pi_bin="${PI_BIN:-pi}"

if [[ $# -eq 0 ]]; then
  tasks=(626 627 628 629)
else
  tasks=("$@")
fi

for task_id in "${tasks[@]}"; do
  if ! [[ "$task_id" =~ ^[0-9]+$ ]]; then
    echo "error: task id must be numeric: $task_id" >&2
    exit 1
  fi

  echo "=== task $task_id ===" >&2
  "$pi_bin" --no-session -p "read next_session_prompt.md and attend ak task #$task_id and then proceed with the workflow until completed and commited."
done
