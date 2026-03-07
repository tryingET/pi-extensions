#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage:
  scripts/legacy-package-deprecation.sh inspect --legacy <path> --canonical <path> [--topology <simple-package|package-group>]
  scripts/legacy-package-deprecation.sh relocate-sessions --legacy <path> --canonical <path> [--execute]

Commands:
  inspect            Emit a JSON summary for legacy-repo shutdown planning.
  relocate-sessions  Dry-run by default; with --execute, move the Pi session-history dir.

Notes:
  - Session directory names are derived from the full absolute cwd path.
  - inspect is intended to be jq-friendly for repeated migrations.
EOF
}

fail() {
  echo "error: $*" >&2
  exit 1
}

json_escape() {
  python - <<'PY' "$1"
import json, sys
print(json.dumps(sys.argv[1]))
PY
}

session_dir_name() {
  python - <<'PY' "$1"
from pathlib import Path
import sys
p = Path(sys.argv[1]).expanduser().resolve()
normalized = str(p).strip('/').replace('/', '-')
print(f"--{normalized}--")
PY
}

file_list_json() {
  python - <<'PY' "$1"
from pathlib import Path
import json, sys
root = Path(sys.argv[1])
if not root.exists():
    print('[]')
    raise SystemExit(0)
files = []
excluded_exact = {'.git', 'node_modules', '.obsidian'}
excluded_prefixes = ('.tmp',)
for path in sorted(root.rglob('*')):
    if not path.is_file():
        continue
    rel = path.relative_to(root)
    parts = rel.parts
    if any(part in excluded_exact for part in parts):
        continue
    if any(part.startswith(prefix) for prefix in excluded_prefixes for part in parts):
        continue
    files.append(str(rel))
print(json.dumps(files))
PY
}

package_name() {
  python - <<'PY' "$1"
from pathlib import Path
import json, sys
manifest = Path(sys.argv[1]) / 'package.json'
if not manifest.exists():
    print('')
    raise SystemExit(0)
try:
    data = json.loads(manifest.read_text())
except Exception:
    print('')
    raise SystemExit(0)
print(data.get('name', ''))
PY
}

command="${1-}"
[ -n "$command" ] || {
  usage
  exit 1
}
shift

legacy=""
canonical=""
topology="simple-package"
execute="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --legacy)
      [ "$#" -ge 2 ] || fail "missing value for --legacy"
      legacy="$2"
      shift 2
      ;;
    --canonical)
      [ "$#" -ge 2 ] || fail "missing value for --canonical"
      canonical="$2"
      shift 2
      ;;
    --topology)
      [ "$#" -ge 2 ] || fail "missing value for --topology"
      topology="$2"
      shift 2
      ;;
    --execute)
      execute="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[ -n "$legacy" ] || fail "--legacy is required"
[ -n "$canonical" ] || fail "--canonical is required"

legacy_abs="$(python - <<'PY' "$legacy"
from pathlib import Path
import sys
print(Path(sys.argv[1]).expanduser().resolve())
PY
)"
canonical_abs="$(python - <<'PY' "$canonical"
from pathlib import Path
import sys
print(Path(sys.argv[1]).expanduser().resolve())
PY
)"

sessions_root="$HOME/.pi/agent/sessions"
legacy_session_name="$(session_dir_name "$legacy_abs")"
canonical_session_name="$(session_dir_name "$canonical_abs")"
legacy_session_path="$sessions_root/$legacy_session_name"
canonical_session_path="$sessions_root/$canonical_session_name"
legacy_pkg_name="$(package_name "$legacy_abs")"
canonical_pkg_name="$(package_name "$canonical_abs")"
archive_name="$(basename "$legacy_abs")-final-archive.tar.gz"

case "$command" in
  inspect)
    legacy_files_json="$(file_list_json "$legacy_abs")"
    canonical_files_json="$(file_list_json "$canonical_abs")"
    printf '{\n'
    printf '  "topology": %s,\n' "$(json_escape "$topology")"
    printf '  "legacy": {\n'
    printf '    "path": %s,\n' "$(json_escape "$legacy_abs")"
    printf '    "exists": %s,\n' "$( [ -e "$legacy_abs" ] && echo true || echo false )"
    printf '    "packageName": %s,\n' "$(json_escape "$legacy_pkg_name")"
    printf '    "sessionDirName": %s,\n' "$(json_escape "$legacy_session_name")"
    printf '    "sessionDirPath": %s,\n' "$(json_escape "$legacy_session_path")"
    printf '    "sessionDirExists": %s,\n' "$( [ -d "$legacy_session_path" ] && echo true || echo false )"
    printf '    "archiveName": %s,\n' "$(json_escape "$archive_name")"
    printf '    "files": %s\n' "$legacy_files_json"
    printf '  },\n'
    printf '  "canonical": {\n'
    printf '    "path": %s,\n' "$(json_escape "$canonical_abs")"
    printf '    "exists": %s,\n' "$( [ -e "$canonical_abs" ] && echo true || echo false )"
    printf '    "packageName": %s,\n' "$(json_escape "$canonical_pkg_name")"
    printf '    "sessionDirName": %s,\n' "$(json_escape "$canonical_session_name")"
    printf '    "sessionDirPath": %s,\n' "$(json_escape "$canonical_session_path")"
    printf '    "sessionDirExists": %s,\n' "$( [ -d "$canonical_session_path" ] && echo true || echo false )"
    printf '    "files": %s\n' "$canonical_files_json"
    printf '  },\n'
    printf '  "suggestedChecks": [\n'
    printf '    "validate canonical package or package-group",\n'
    printf '    "validate monorepo root",\n'
    printf '    "classify legacy files into moved-to-root, moved-to-package, archive-only, runtime-junk, safe-to-delete",\n'
    printf '    "rewrite legacy NEXT_SESSION_PROMPT.md as deprecation handoff",\n'
    printf '    "relocate Pi session history using full-path-derived session directory names",\n'
    printf '    "create exactly one final tar.gz archive before deletion"\n'
    printf '  ]\n'
    printf '}\n'
    ;;
  relocate-sessions)
    [ -d "$legacy_session_path" ] || fail "legacy session dir not found: $legacy_session_path"
    if [ -e "$canonical_session_path" ]; then
      fail "canonical session dir already exists: $canonical_session_path"
    fi
    if [ "$execute" != "true" ]; then
      echo "dry-run: would move"
      echo "  from: $legacy_session_path"
      echo "    to: $canonical_session_path"
      exit 0
    fi
    mkdir -p "$sessions_root"
    mv "$legacy_session_path" "$canonical_session_path"
    echo "moved session history"
    echo "  from: $legacy_session_path"
    echo "    to: $canonical_session_path"
    ;;
  *)
    fail "unknown command: $command"
    ;;
esac
