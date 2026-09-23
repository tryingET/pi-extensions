# summary: "Puts an already-installed exact pinned Node first on PATH when the ambient Node differs; never installs."
# read_when:
#   - "A gate reports a Node mismatch, or changing how gates choose their Node binary."
#
# Sourced (not executed) by the commit gates before check-gate-toolchain.mjs, from the repo root.
# Commit gates certify on the pinned lane only, so this forces PI_GATE_NODE_LANE=pinned: an
# exported `next` left over from reproducing a node-next run can never admit a push on it.
# Only `node` is shimmed: npm stays the one on PATH, which the toolchain check still pins exactly.
# Candidates, first match wins, each verified by `--version` before use:
#   1. PI_GATE_NODE_BIN
#   2. ~/.local/opt/node-v<version>-<platform>/bin/node (the layout of an unpacked nodejs.org tarball)
# With no candidate the ambient Node is left alone and the toolchain check reports the mismatch.

PI_GATE_NODE_LANE="pinned"
export PI_GATE_NODE_LANE

select_gate_node() {
  _gate_want="$(node -p "require('./policy/ci-toolchain-lock.json').nodeVersion" 2>/dev/null)" || return 0
  _gate_have="$(node -p 'process.versions.node' 2>/dev/null)" || _gate_have="none"
  [ -n "$_gate_want" ] && [ "$_gate_have" != "$_gate_want" ] || return 0

  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) _gate_platform="linux-x64" ;;
    Linux-aarch64) _gate_platform="linux-arm64" ;;
    Darwin-x86_64) _gate_platform="darwin-x64" ;;
    Darwin-arm64) _gate_platform="darwin-arm64" ;;
    *) _gate_platform="" ;;
  esac

  for _gate_candidate in "${PI_GATE_NODE_BIN:-}" "${HOME:-}/.local/opt/node-v$_gate_want-$_gate_platform/bin/node"; do
    [ -n "$_gate_candidate" ] || continue
    # The link is read from the shim directory, so a relative candidate must be made absolute.
    case "$_gate_candidate" in /*) ;; *) _gate_candidate="$PWD/$_gate_candidate" ;; esac
    [ -x "$_gate_candidate" ] || continue
    [ "$("$_gate_candidate" --version 2>/dev/null)" = "v$_gate_want" ] || continue
    # A fresh private directory, never a predictable path another user could pre-create.
    _gate_shim="$(mktemp -d "${PI_EXTENSIONS_TMPDIR:-${TMPDIR:-/tmp}}/pi-gate-node.XXXXXX")" || return 0
    ln -s "$_gate_candidate" "$_gate_shim/node" || return 0
    PATH="$_gate_shim:$PATH"
    export PATH
    echo "gate-toolchain: using installed Node $_gate_want at $_gate_candidate (ambient Node $_gate_have)"
    return 0
  done
  return 0
}

select_gate_node
