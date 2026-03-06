#!/usr/bin/env bash
set -euo pipefail

WITH_POLICY=false
WITH_PROMPTS=false

usage() {
  cat <<'USAGE'
Usage: ./scripts/sync-to-live.sh [--with-policy] [--with-prompts] [--all]

Copies extension entrypoints from ./extensions and shared modules from ./src into
a repo-named subdirectory under ~/.pi/agent/extensions/, then generates index.ts
for auto-discovery.
Optional flags also sync policy and prompt templates.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-policy)
      WITH_POLICY=true
      ;;
    --with-prompts)
      WITH_PROMPTS=true
      ;;
    --all)
      WITH_POLICY=true
      WITH_PROMPTS=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/extensions"
SRC_DIR="$ROOT_DIR/src"
TARGET_DIR="$HOME/.pi/agent/extensions"
PACKAGE_NAME="$(basename "$ROOT_DIR")"
PACKAGE_TARGET_DIR="$TARGET_DIR/$PACKAGE_NAME"

mkdir -p "$TARGET_DIR"
mkdir -p "$PACKAGE_TARGET_DIR"

shopt -s nullglob
extension_files=("$SOURCE_DIR"/*.ts)
if (( ${#extension_files[@]} == 0 )); then
  echo "No extension files found in: $SOURCE_DIR" >&2
  exit 1
fi

# Clean and resync extension entrypoints into package-local folder.
rm -rf "$PACKAGE_TARGET_DIR/extensions"
mkdir -p "$PACKAGE_TARGET_DIR/extensions"

extension_imports=()
extension_calls=()

for source_file in "${extension_files[@]}"; do
  base_file="$(basename "$source_file")"
  cp "$source_file" "$PACKAGE_TARGET_DIR/extensions/$base_file"

  var_name="ext_$(basename "$source_file" .ts | tr -c 'a-zA-Z0-9_' '_')"
  extension_imports+=("import $var_name from \"./extensions/$base_file\";")
  extension_calls+=("  $var_name(pi);")

  stale_top_level="$TARGET_DIR/$base_file"
  if [[ -f "$stale_top_level" ]]; then
    rm -f "$stale_top_level"
    echo "Removed stale top-level extension: $stale_top_level"
  fi

done
shopt -u nullglob

# Sync shared source modules required by extension imports.
if [[ -d "$SRC_DIR" ]]; then
  if command -v rsync >/dev/null 2>&1; then
    mkdir -p "$PACKAGE_TARGET_DIR/src"
    rsync -a --delete "$SRC_DIR/" "$PACKAGE_TARGET_DIR/src/"
  else
    rm -rf "$PACKAGE_TARGET_DIR/src"
    mkdir -p "$PACKAGE_TARGET_DIR/src"
    cp -R "$SRC_DIR/." "$PACKAGE_TARGET_DIR/src/"
  fi
else
  rm -rf "$PACKAGE_TARGET_DIR/src"
fi

# Generate auto-discovery entrypoint (global subdirectory pattern: */index.ts).
index_file="$PACKAGE_TARGET_DIR/index.ts"
{
  echo 'import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";'
  for import_line in "${extension_imports[@]}"; do
    echo "$import_line"
  done
  echo
  echo 'export default function (pi: ExtensionAPI) {'
  for call_line in "${extension_calls[@]}"; do
    echo "$call_line"
  done
  echo '}'
} > "$index_file"

echo "Synced extension package: $PACKAGE_TARGET_DIR"

if [[ "$WITH_PROMPTS" == "true" ]]; then
  PROMPT_SOURCE_DIR="$ROOT_DIR/prompts"
  PROMPT_TARGET_DIR="$HOME/.pi/agent/prompts"
  mkdir -p "$PROMPT_TARGET_DIR"

  shopt -s nullglob
  prompt_files=("$PROMPT_SOURCE_DIR"/*.md)
  if (( ${#prompt_files[@]} == 0 )); then
    echo "No prompt templates found in: $PROMPT_SOURCE_DIR"
  else
    for prompt_file in "${prompt_files[@]}"; do
      cp "$prompt_file" "$PROMPT_TARGET_DIR/"
      echo "Synced prompt: $prompt_file -> $PROMPT_TARGET_DIR/$(basename "$prompt_file")"
    done
  fi
  shopt -u nullglob
fi

if [[ "$WITH_POLICY" == "true" ]]; then
  POLICY_SOURCE="$ROOT_DIR/policy/security-policy.json"
  POLICY_TARGET="$HOME/.pi/agent/security-policy.json"

  if [[ -f "$POLICY_SOURCE" ]]; then
    cp "$POLICY_SOURCE" "$POLICY_TARGET"
    echo "Synced policy: $POLICY_SOURCE -> $POLICY_TARGET"
  else
    echo "Policy file not found: $POLICY_SOURCE (skipped)"
  fi
fi

echo "Done. In pi, run /reload to pick up changes."
