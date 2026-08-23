#!/bin/sh
# summary: "Runs ROCS build and validation against an isolated ontology copy."
# read_when:
#   - "Changing ROCS validation isolation or scratch cleanup behavior."
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(CDPATH= cd -- "$script_dir/../.." && pwd)"

if [ -z "${TMPDIR:-}" ] || [ ! -d "$TMPDIR" ]; then
  echo "error: TMPDIR must name an existing scratch directory" >&2
  exit 2
fi

scratch=""
child_pid=""

cleanup() {
  if [ -n "$scratch" ] && { [ -e "$scratch" ] || [ -L "$scratch" ]; }; then
    rm -rf -- "$scratch"
  fi
  scratch=""
}

terminate_child() {
  if [ -n "$child_pid" ]; then
    kill -TERM "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
    child_pid=""
  fi
}

on_exit() {
  status=$?
  trap - EXIT HUP INT TERM
  terminate_child
  cleanup
  exit "$status"
}

on_signal() {
  status=$1
  trap - EXIT HUP INT TERM
  terminate_child
  cleanup
  exit "$status"
}

trap on_exit EXIT
trap 'on_signal 129' HUP
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

reject_symlinks() {
  tree=$1
  label=$2
  symlink="$(find "$tree" -type l -print -quit)"
  if [ -n "$symlink" ]; then
    echo "error: $label contains a symlink: $symlink" >&2
    return 2
  fi
}

run_rocs() {
  "$repo_root/scripts/rocs.sh" "$@" &
  child_pid=$!
  if wait "$child_pid"; then
    status=0
  else
    status=$?
  fi
  child_pid=""
  return "$status"
}

reject_symlinks "$repo_root/ontology" "source ontology"
scratch="$(mktemp -d "$TMPDIR/pi-extensions-rocs.XXXXXX")"
cp -R "$repo_root/ontology" "$scratch/ontology"
reject_symlinks "$scratch/ontology" "scratch ontology"

run_rocs version
run_rocs build --repo "$scratch" --resolve-refs --clean
run_rocs validate --repo "$scratch" --resolve-refs
