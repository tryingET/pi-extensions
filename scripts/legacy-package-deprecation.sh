#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage:
  scripts/legacy-package-deprecation.sh inspect --legacy <path> --canonical <path> [--topology <simple-package|package-group>]
  scripts/legacy-package-deprecation.sh relocate-sessions --legacy <path> --canonical <path> [--execute]
  scripts/legacy-package-deprecation.sh render-handoff --legacy <path> --canonical <path> [--topology <simple-package|package-group>]

Commands:
  inspect            Emit a JSON summary for legacy-repo shutdown planning.
  relocate-sessions  Dry-run by default; with --execute, move the Pi session-history dir.
  render-handoff     Print a deprecation handoff for the legacy next_session_prompt.md.

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

abs_path() {
  python - <<'PY' "$1"
from pathlib import Path
import sys
print(Path(sys.argv[1]).expanduser().resolve())
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

monorepo_root_guess() {
  python - <<'PY' "$1"
from pathlib import Path
import sys
path = Path(sys.argv[1]).expanduser().resolve()
parts = path.parts
for marker in ('packages', 'apps'):
    if marker in parts:
        idx = parts.index(marker)
        root = Path(parts[0])
        for part in parts[1:idx]:
            root /= part
        print(root)
        raise SystemExit(0)
print(path.parent)
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

inventory_diff_json() {
  python - <<'PY' "$1" "$2"
import json, sys
legacy = set(json.loads(sys.argv[1]))
canonical = set(json.loads(sys.argv[2]))
shared = sorted(legacy & canonical)
legacy_only = sorted(legacy - canonical)
canonical_only = sorted(canonical - legacy)
print(json.dumps({
    'sharedRelativeFiles': shared,
    'legacyOnlyFiles': legacy_only,
    'canonicalOnlyFiles': canonical_only,
    'sharedCount': len(shared),
    'legacyOnlyCount': len(legacy_only),
    'canonicalOnlyCount': len(canonical_only),
}))
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

ownership_outline_json() {
  python - <<'PY' "$1"
import json, sys
topology = sys.argv[1]
payload = {
    'rootOwnedExamples': [
        '.github/',
        '.githooks/',
        'scripts/',
        'governance/',
        'docs/project/',
    ],
    'packageOwnedExamples': [
        'extensions/',
        'tests/',
        'README.md',
        'package.json',
        'prompts/',
        'examples/',
    ],
    'classificationBuckets': [
        'moved-to-root',
        'moved-to-package',
        'archive-only',
        'runtime-junk',
        'safe-to-delete',
    ],
    'topologyNotes': [
        'Use simple-package when one package root owns the migrated capability.',
        'Use package-group when one logical capability now spans multiple related packages.',
    ],
}
if topology == 'package-group':
    payload['groupOwnedExamples'] = [
        'group README.md',
        'group docs/',
        'child package manifests',
        'child package tests/docs/code',
    ]
print(json.dumps(payload))
PY
}

recommended_session_action() {
  if [ "$legacy_session_path" = "$canonical_session_path" ]; then
    echo "noop-same-path"
  elif [ ! -d "$legacy_session_path" ]; then
    echo "skip-no-history"
  elif [ -e "$canonical_session_path" ]; then
    echo "manual-merge"
  else
    echo "relocate"
  fi
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
case "$topology" in
  simple-package|package-group) ;;
  *) fail "unsupported topology: $topology" ;;
esac

legacy_abs="$(abs_path "$legacy")"
canonical_abs="$(abs_path "$canonical")"
monorepo_root="$(monorepo_root_guess "$canonical_abs")"

sessions_root="$HOME/.pi/agent/sessions"
legacy_session_name="$(session_dir_name "$legacy_abs")"
canonical_session_name="$(session_dir_name "$canonical_abs")"
legacy_session_path="$sessions_root/$legacy_session_name"
canonical_session_path="$sessions_root/$canonical_session_name"
legacy_pkg_name="$(package_name "$legacy_abs")"
canonical_pkg_name="$(package_name "$canonical_abs")"
archive_name="$(basename "$legacy_abs")-final-archive.tar.gz"
session_action="$(recommended_session_action)"

case "$command" in
  inspect)
    legacy_files_json="$(file_list_json "$legacy_abs")"
    canonical_files_json="$(file_list_json "$canonical_abs")"
    inventory_diff="$(inventory_diff_json "$legacy_files_json" "$canonical_files_json")"
    ownership_outline="$(ownership_outline_json "$topology")"
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
    printf '    "monorepoRoot": %s,\n' "$(json_escape "$monorepo_root")"
    printf '    "packageName": %s,\n' "$(json_escape "$canonical_pkg_name")"
    printf '    "sessionDirName": %s,\n' "$(json_escape "$canonical_session_name")"
    printf '    "sessionDirPath": %s,\n' "$(json_escape "$canonical_session_path")"
    printf '    "sessionDirExists": %s,\n' "$( [ -d "$canonical_session_path" ] && echo true || echo false )"
    printf '    "files": %s\n' "$canonical_files_json"
    printf '  },\n'
    printf '  "inventory": %s,\n' "$inventory_diff"
    printf '  "sessionRelocation": {\n'
    printf '    "legacySessionDirPath": %s,\n' "$(json_escape "$legacy_session_path")"
    printf '    "canonicalSessionDirPath": %s,\n' "$(json_escape "$canonical_session_path")"
    printf '    "legacyExists": %s,\n' "$( [ -d "$legacy_session_path" ] && echo true || echo false )"
    printf '    "canonicalExists": %s,\n' "$( [ -e "$canonical_session_path" ] && echo true || echo false )"
    printf '    "recommendedAction": %s\n' "$(json_escape "$session_action")"
    printf '  },\n'
    printf '  "ownershipOutline": %s,\n' "$ownership_outline"
    printf '  "suggestedChecks": [\n'
    printf '    "validate canonical package or package-group",\n'
    printf '    "validate monorepo root",\n'
    printf '    "classify legacy files into moved-to-root, moved-to-package, archive-only, runtime-junk, safe-to-delete",\n'
    printf '    "rewrite legacy next_session_prompt.md as deprecation handoff",\n'
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
  render-handoff)
    cat <<EOF
---
summary: "Legacy deprecation handoff after canonical migration into the pi-extensions monorepo."
read_when:
  - "Opening this legacy standalone repo after the canonical monorepo home exists."
---

# Legacy deprecation handoff

Do **not** continue implementation in this legacy folder.

Canonical monorepo root:
- $monorepo_root

Canonical destination ($topology):
- $canonical_abs

Legacy source pending archive-and-delete:
- $legacy_abs

## Allowed work here

- verify legacy vs canonical inventory
- relocate Pi session history from:
  - $legacy_session_path
  to:
  - $canonical_session_path
- create exactly one final tar.gz archive: $archive_name
- delete the legacy repo after validation + archive verification

## Required validation before deletion

\`\`\`bash
cd $canonical_abs
npm run check

cd $monorepo_root
./scripts/ci/full.sh
\`\`\`

## Session-history rule

Use full-path-derived session directory names.
Do not relocate by basename-only matching.

Recommended relocation action right now:
- $session_action
EOF
    ;;
  *)
    fail "unknown command: $command"
    ;;
esac
