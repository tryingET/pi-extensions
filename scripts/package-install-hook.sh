#!/usr/bin/env bash
# summary: Warning-only post-operation entrypoint; never installs or changes Git's result.
event="${1:-unknown}"
# Git supplies rewrite pairs on stdin; consume them even though the check uses the
# current tree, not historical pairs. This also avoids a broken pipe on long rebases.
if [[ "$event" == post-rewrite ]]; then cat >/dev/null; fi
root="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "package-install-health ($event): WARNING: cannot locate checkout; installs were not checked." >&2
  exit 0
}
if ! command -v node >/dev/null 2>&1; then
  echo "package-install-health ($event): WARNING: Node unavailable; run node scripts/package-install-health.mjs after restoring the toolchain." >&2
  exit 0
fi
if ! node "$root/scripts/package-install-health.mjs" --hook "$event"; then
  echo "package-install-health ($event): WARNING: checker could not finish; installs were not verified. Git was not blocked." >&2
fi
exit 0
