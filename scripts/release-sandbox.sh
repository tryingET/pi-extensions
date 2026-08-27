#!/usr/bin/env bash
# summary: "runs package release npm/Pi operations without inherited credentials or ambient configuration"
# read_when:
#   - "changing package release checks, packed-artifact installation, or provider-free release smokes"

release_sandbox_require_tmpdir() {
  if [[ -z "${TMPDIR:-}" || ! -d "$TMPDIR" ]]; then
    echo "release sandbox requires an existing managed TMPDIR" >&2
    return 1
  fi
  local resolved
  resolved="$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$TMPDIR")"
  if [[ "$resolved" == "/tmp" || "$resolved" == /tmp/* ]]; then
    echo "release sandbox refuses system /tmp: $TMPDIR" >&2
    return 1
  fi
}

release_sandbox_initialize_home() {
  local home_dir="$1"
  mkdir -p -m 700 "$home_dir" "$home_dir/.config" "$home_dir/.cache"
  : > "$home_dir/user.npmrc"
  : > "$home_dir/global.npmrc"
  chmod 600 "$home_dir/user.npmrc" "$home_dir/global.npmrc"
}

release_sandbox_command() (
  set -euo pipefail
  release_sandbox_require_tmpdir
  local sandbox_home
  sandbox_home="$(mktemp -d "$TMPDIR/pi-release-command-home.XXXXXX")"
  trap "rm -rf -- '$sandbox_home'" EXIT
  release_sandbox_initialize_home "$sandbox_home"
  env -i \
    PATH="$PATH" \
    HOME="$sandbox_home" \
    TMPDIR="$TMPDIR" \
    TMP="$TMPDIR" \
    TEMP="$TMPDIR" \
    XDG_CONFIG_HOME="$sandbox_home/.config" \
    XDG_CACHE_HOME="$sandbox_home/.cache" \
    NPM_CONFIG_USERCONFIG="$sandbox_home/user.npmrc" \
    npm_config_userconfig="$sandbox_home/user.npmrc" \
    NPM_CONFIG_GLOBALCONFIG="$sandbox_home/global.npmrc" \
    npm_config_globalconfig="$sandbox_home/global.npmrc" \
    NPM_CONFIG_CACHE="$sandbox_home/.npm-cache" \
    npm_config_cache="$sandbox_home/.npm-cache" \
    "$@"
)

release_sandbox_npm() {
  release_sandbox_command npm "$@"
}

release_sandbox_prepare_runtime() {
  local agent_dir="$1"
  local npm_prefix="$2"
  local npm_cache="$3"
  release_sandbox_require_tmpdir
  local runtime_home="$agent_dir/release-home"
  mkdir -p -m 700 "$agent_dir" "$npm_prefix" "$npm_cache"
  release_sandbox_initialize_home "$runtime_home"
  cat > "$agent_dir/settings.json" <<'JSON'
{
  "extensions": [],
  "packages": []
}
JSON
  chmod 600 "$agent_dir/settings.json"
}

release_sandbox_link_available_peers() {
  local agent_dir="$1"
  local package_root="$2"
  local source_node_modules="$package_root/node_modules"
  local target_node_modules="$agent_dir/npm/node_modules"
  [[ -f "$package_root/package.json" ]] || {
    echo "release sandbox package manifest is missing: $package_root/package.json" >&2
    return 1
  }
  mkdir -p "$target_node_modules"
  while IFS= read -r dependency; do
    [[ -n "$dependency" ]] || continue
    local source_path="$source_node_modules/$dependency"
    local target_path="$target_node_modules/$dependency"
    [[ -e "$source_path" ]] || continue
    [[ -e "$target_path" ]] && continue
    mkdir -p "$(dirname "$target_path")"
    ln -s "$(node -e 'console.log(require("node:fs").realpathSync(process.argv[1]))' "$source_path")" "$target_path"
  done < <(node - "$package_root/package.json" <<'NODE'
const fs = require("node:fs");
const pkg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const name of Object.keys(pkg.peerDependencies ?? {}).sort()) console.log(name);
NODE
  )
}

release_sandbox_exec() {
  local agent_dir="$1"
  local npm_prefix="$2"
  local npm_cache="$3"
  shift 3
  local runtime_home="$agent_dir/release-home"
  if [[ ! -f "$runtime_home/user.npmrc" || ! -f "$runtime_home/global.npmrc" ]]; then
    echo "release sandbox runtime is not prepared: $agent_dir" >&2
    return 1
  fi
  env -i \
    PATH="$PATH" \
    HOME="$runtime_home" \
    TMPDIR="$TMPDIR" \
    TMP="$TMPDIR" \
    TEMP="$TMPDIR" \
    XDG_CONFIG_HOME="$runtime_home/.config" \
    XDG_CACHE_HOME="$runtime_home/.cache" \
    PI_CODING_AGENT_DIR="$agent_dir" \
    NPM_CONFIG_USERCONFIG="$runtime_home/user.npmrc" \
    npm_config_userconfig="$runtime_home/user.npmrc" \
    NPM_CONFIG_GLOBALCONFIG="$runtime_home/global.npmrc" \
    npm_config_globalconfig="$runtime_home/global.npmrc" \
    NPM_CONFIG_PREFIX="$npm_prefix" \
    npm_config_prefix="$npm_prefix" \
    NPM_CONFIG_CACHE="$npm_cache" \
    npm_config_cache="$npm_cache" \
    "$@"
}
