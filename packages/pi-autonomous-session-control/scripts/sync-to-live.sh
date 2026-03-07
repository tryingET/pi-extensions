#!/usr/bin/env bash
set -euo pipefail

WITH_POLICY=false
WITH_PROMPTS=false
SYMLINK_MODE=false

usage() {
  cat <<'USAGE'
Usage: ./scripts/sync-to-live.sh [--symlink] [--with-policy] [--with-prompts] [--all]

Default mode copies ./extensions (recursively) and ./src into
~/.pi/agent/extensions/REPO_NAME/, then generates index.ts from extension entrypoints.

Use --symlink to link ~/.pi/agent/extensions/REPO_NAME directly to this repo
(single source of truth, no copy drift).

Optional flags also sync policy and prompt templates.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --symlink)
      SYMLINK_MODE=true
      ;;
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

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Extensions directory not found: $SOURCE_DIR" >&2
  exit 1
fi

realpath_or_empty() {
  node -e '
const fs = require("node:fs");
const input = process.argv[1];
try {
  console.log(fs.realpathSync(input));
} catch {}
' "$1"
}

ROOT_DIR_REAL="$(realpath_or_empty "$ROOT_DIR")"
SOURCE_DIR_REAL="$(realpath_or_empty "$SOURCE_DIR")"

sync_prompts() {
  local prompt_source_dir="$ROOT_DIR/prompts"
  local prompt_target_dir="$HOME/.pi/agent/prompts"

  mkdir -p "$prompt_target_dir"

  shopt -s nullglob
  local prompt_files=("$prompt_source_dir"/*.md)
  if (( ${#prompt_files[@]} == 0 )); then
    echo "No prompt templates found in: $prompt_source_dir"
  else
    for prompt_file in "${prompt_files[@]}"; do
      cp "$prompt_file" "$prompt_target_dir/"
      echo "Synced prompt: $prompt_file -> $prompt_target_dir/$(basename "$prompt_file")"
    done
  fi
  shopt -u nullglob
}

sync_policy() {
  local policy_source="$ROOT_DIR/policy/security-policy.json"
  local policy_target="$HOME/.pi/agent/security-policy.json"

  if [[ -f "$policy_source" ]]; then
    cp "$policy_source" "$policy_target"
    echo "Synced policy: $policy_source -> $policy_target"
  else
    echo "Policy file not found: $policy_source (skipped)"
  fi
}

path_in_dir() {
  local path="$1"
  local dir="$2"
  [[ "$path" == "$dir" || "$path" == "$dir/"* ]]
}

contains_value() {
  local needle="$1"
  shift
  local value
  for value in "$@"; do
    if [[ "$value" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

discover_extension_entries_in_dir() {
  local dir="$1"
  local -a entries=()

  [[ -d "$dir" ]] || return 0

  shopt -s nullglob
  local file
  for file in "$dir"/*.ts "$dir"/*.js; do
    [[ -f "$file" ]] && entries+=("$file")
  done

  local sub_dir
  for sub_dir in "$dir"/*; do
    [[ -d "$sub_dir" ]] || continue
    [[ -f "$sub_dir/index.ts" ]] && entries+=("$sub_dir/index.ts")
    [[ -f "$sub_dir/index.js" ]] && entries+=("$sub_dir/index.js")
  done
  shopt -u nullglob

  printf '%s\n' "${entries[@]}"
}

collect_entry_files() {
  local -a collected=()
  local package_json="$ROOT_DIR/package.json"

  if [[ -f "$package_json" ]]; then
    local -a manifest_entries=()
    while IFS= read -r entry; do
      [[ -n "$entry" ]] && manifest_entries+=("$entry")
    done < <(node -e '
const fs = require("node:fs");
const packagePath = process.argv[1];
try {
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const exts = pkg?.pi?.extensions;
  if (Array.isArray(exts)) {
    for (const ext of exts) {
      if (typeof ext === "string") console.log(ext);
    }
  }
} catch {}
' "$package_json")

    if (( ${#manifest_entries[@]} > 0 )); then
      local manifest_entry
      for manifest_entry in "${manifest_entries[@]}"; do
        local normalized="${manifest_entry#./}"
        local absolute="$ROOT_DIR/$normalized"
        local absolute_real
        absolute_real="$(realpath_or_empty "$absolute")"
        [[ -n "$absolute_real" ]] || continue

        if ! path_in_dir "$absolute_real" "$SOURCE_DIR_REAL"; then
          echo "Skipping manifest extension outside ./extensions: $manifest_entry" >&2
          continue
        fi

        if [[ -f "$absolute_real" ]]; then
          case "$absolute_real" in
            *.ts|*.js)
              collected+=("$absolute_real")
              ;;
          esac
        elif [[ -d "$absolute_real" ]]; then
          while IFS= read -r discovered; do
            [[ -n "$discovered" ]] && collected+=("$discovered")
          done < <(discover_extension_entries_in_dir "$absolute_real")
        fi
      done
    fi
  fi

  if (( ${#collected[@]} == 0 )); then
    while IFS= read -r discovered; do
      [[ -n "$discovered" ]] && collected+=("$discovered")
    done < <(discover_extension_entries_in_dir "$SOURCE_DIR")
  fi

  local -a deduped=()
  local file
  for file in "${collected[@]}"; do
    local file_real
    file_real="$(realpath_or_empty "$file")"
    [[ -n "$file_real" && -f "$file_real" ]] || continue

    if ! contains_value "$file_real" "${deduped[@]}"; then
      deduped+=("$file_real")
    fi
  done

  printf '%s\n' "${deduped[@]}"
}

cleanup_stale_top_level_files() {
  shopt -s nullglob
  local source_file
  for source_file in "$SOURCE_DIR"/*.ts "$SOURCE_DIR"/*.js; do
    local stale_top_level="$TARGET_DIR/$(basename "$source_file")"
    if [[ -f "$stale_top_level" ]]; then
      rm -f "$stale_top_level"
      echo "Removed stale top-level extension: $stale_top_level"
    fi
  done
  shopt -u nullglob
}

mkdir -p "$TARGET_DIR"

if [[ "$SYMLINK_MODE" == "true" ]]; then
  local_target="$(realpath_or_empty "$ROOT_DIR")"

  if [[ -L "$PACKAGE_TARGET_DIR" ]]; then
    current_target="$(realpath_or_empty "$PACKAGE_TARGET_DIR")"
    if [[ "$current_target" != "$local_target" ]]; then
      rm -f "$PACKAGE_TARGET_DIR"
      ln -s "$ROOT_DIR" "$PACKAGE_TARGET_DIR"
      echo "Updated symlink: $PACKAGE_TARGET_DIR -> $ROOT_DIR"
    else
      echo "Symlink already up to date: $PACKAGE_TARGET_DIR -> $ROOT_DIR"
    fi
  elif [[ -e "$PACKAGE_TARGET_DIR" ]]; then
    backup_dir="$TARGET_DIR/.backup-$PACKAGE_NAME-$(date +%Y%m%d-%H%M%S)"
    mv "$PACKAGE_TARGET_DIR" "$backup_dir"
    ln -s "$ROOT_DIR" "$PACKAGE_TARGET_DIR"
    echo "Backed up existing target: $PACKAGE_TARGET_DIR -> $backup_dir"
    echo "Created symlink: $PACKAGE_TARGET_DIR -> $ROOT_DIR"
  else
    ln -s "$ROOT_DIR" "$PACKAGE_TARGET_DIR"
    echo "Created symlink: $PACKAGE_TARGET_DIR -> $ROOT_DIR"
  fi

  cleanup_stale_top_level_files

  if [[ "$WITH_PROMPTS" == "true" ]]; then
    sync_prompts
  fi

  if [[ "$WITH_POLICY" == "true" ]]; then
    sync_policy
  fi

  echo "Done. In pi, run /reload to pick up changes."
  exit 0
fi

if [[ -L "$PACKAGE_TARGET_DIR" ]]; then
  echo "Refusing copy sync because target is a symlink: $PACKAGE_TARGET_DIR" >&2
  echo "Use --symlink mode, or remove the symlink to switch back to copy mode." >&2
  exit 1
fi

mkdir -p "$PACKAGE_TARGET_DIR"

if command -v rsync >/dev/null 2>&1; then
  mkdir -p "$PACKAGE_TARGET_DIR/extensions"
  rsync -a --delete "$SOURCE_DIR/" "$PACKAGE_TARGET_DIR/extensions/"
else
  rm -rf "$PACKAGE_TARGET_DIR/extensions"
  mkdir -p "$PACKAGE_TARGET_DIR/extensions"
  cp -R "$SOURCE_DIR/." "$PACKAGE_TARGET_DIR/extensions/"
fi

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

entry_files=()
while IFS= read -r entry_file; do
  [[ -n "$entry_file" ]] && entry_files+=("$entry_file")
done < <(collect_entry_files)

if (( ${#entry_files[@]} == 0 )); then
  echo "No extension entry files found under: $SOURCE_DIR" >&2
  exit 1
fi

used_var_names=()
extension_imports=()
extension_calls=()

for entry_file in "${entry_files[@]}"; do
  relative_path="${entry_file#$ROOT_DIR_REAL/}"
  if [[ "$relative_path" == "$entry_file" ]]; then
    echo "Skipping entry outside repo root: $entry_file" >&2
    continue
  fi

  if [[ ! -f "$PACKAGE_TARGET_DIR/$relative_path" ]]; then
    echo "Skipping entry not present in synced target: $relative_path" >&2
    continue
  fi

  base_without_ext="${relative_path%.*}"
  safe_name="${base_without_ext//[^a-zA-Z0-9_]/_}"
  var_name="ext_${safe_name}"

  suffix=2
  while contains_value "$var_name" "${used_var_names[@]}"; do
    var_name="ext_${safe_name}_${suffix}"
    ((suffix++))
  done
  used_var_names+=("$var_name")

  extension_imports+=("import $var_name from \"./$relative_path\";")
  extension_calls+=("  $var_name(pi);")
done

if (( ${#extension_imports[@]} == 0 )); then
  echo "No valid synced entry files found for index generation." >&2
  exit 1
fi

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

cleanup_stale_top_level_files

if [[ "$WITH_PROMPTS" == "true" ]]; then
  sync_prompts
fi

if [[ "$WITH_POLICY" == "true" ]]; then
  sync_policy
fi

echo "Done. In pi, run /reload to pick up changes."
