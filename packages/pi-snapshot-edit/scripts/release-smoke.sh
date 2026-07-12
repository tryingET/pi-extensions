#!/usr/bin/env bash
# ---
# summary: "compares packed and installed artifacts before running the rpc smoke client"
# read_when:
#   - "checking release tarball whitelists or offline installation smoke coverage"
# ---
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${PI_CODING_AGENT_DIR:?PI_CODING_AGENT_DIR is required}"
: "${NPM_CONFIG_PREFIX:?NPM_CONFIG_PREFIX is required}"
: "${TARBALL_PATH:?TARBALL_PATH is required}"
: "${INSTALLED_PACKAGE_DIR:?INSTALLED_PACKAGE_DIR is required}"

case "$PI_CODING_AGENT_DIR" in /tmp/*) ;; *) echo "Refusing non-temporary PI_CODING_AGENT_DIR" >&2; exit 1 ;; esac
case "$NPM_CONFIG_PREFIX" in /tmp/*) ;; *) echo "Refusing non-temporary NPM_CONFIG_PREFIX" >&2; exit 1 ;; esac
[[ -f "$TARBALL_PATH" ]] || { echo "Packed tarball is missing: $TARBALL_PATH" >&2; exit 1; }
[[ -d "$INSTALLED_PACKAGE_DIR" ]] || { echo "Installed package is missing: $INSTALLED_PACKAGE_DIR" >&2; exit 1; }

umask 077
TEMP_DIR="$(mktemp -d /tmp/pi-snapshot-edit-smoke-XXXXXX)"
cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT
chmod 700 "$TEMP_DIR"
tar -xzf "$TARBALL_PATH" -C "$TEMP_DIR"

expected_files=(
  LICENSE
  README.md
  dist/snapshot-edit.js
  package.json
  policy/engineering-lane.json
  policy/security-policy.json
)
mapfile -t packed_files < <(cd "$TEMP_DIR/package" && find . -type f -not -path './node_modules/*' -printf '%P\n' | sort)
if [[ "${packed_files[*]}" != "${expected_files[*]}" ]]; then
  printf 'Unexpected packed whitelist: %s\n' "${packed_files[*]}" >&2
  exit 1
fi

for relative in "${expected_files[@]}"; do
  cmp "$TEMP_DIR/package/$relative" "$INSTALLED_PACKAGE_DIR/$relative"
done
if grep -Eq "from [\"'](\\.?\\.?/|/)" "$INSTALLED_PACKAGE_DIR/dist/snapshot-edit.js"; then
  echo "Installed bundle retains a relative runtime import" >&2
  exit 1
fi
if grep -q 'sourceMappingURL' "$INSTALLED_PACKAGE_DIR/dist/snapshot-edit.js"; then
  echo "Installed bundle contains a sourcemap reference" >&2
  exit 1
fi

echo "Packed and installed artifact bytes match exact whitelist."
FIXTURE="$TEMP_DIR/protocol-b.txt"
PI_SNAPSHOT_EDIT_RELEASE_SMOKE=1 \
  node "$ROOT_DIR/scripts/release-smoke-client.mjs" "$ROOT_DIR" "$INSTALLED_PACKAGE_DIR" "$FIXTURE"
