#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

echo "== private local-package artifact check"

node <<'NODE'
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const fail = (message) => {
  console.error(message);
  process.exit(1);
};
if (pkg.private !== true) fail('package.json must keep private:true');
if (pkg?.['x-pi-template']?.releaseConfigMode !== 'none') {
  fail('x-pi-template.releaseConfigMode must remain none');
}
if (pkg?.pi?.extensions?.[0] !== './extensions/semantic-code-intelligence.ts') {
  fail('Pi extension entrypoint drifted');
}
console.log(`private posture OK: ${pkg.name}@${pkg.version}`);
NODE

echo "== npm pack --dry-run --json (artifact whitelist only; no publish command)"
PACK_JSON="$(npm pack --dry-run --json)"
echo "$PACK_JSON"
PACK_JSON="$(printf '%s' "$PACK_JSON" | node "$REPO_ROOT/scripts/npm-pack-json.mjs")"

PACK_JSON="$PACK_JSON" node <<'NODE'
const pack = JSON.parse(process.env.PACK_JSON || '[]');
const files = new Set((pack[0]?.files || []).map((entry) => String(entry.path || '')));
const required = [
  'package.json',
  'README.md',
  'extensions/semantic-code-intelligence.ts',
  'src/extension.ts',
  'src/mcp-bridge.ts',
  'src/tool-definitions.ts',
];
const missing = required.filter((file) => !files.has(file));
if (missing.length > 0) {
  console.error(`private artifact missing required files: ${missing.join(', ')}`);
  process.exit(1);
}
const forbidden = [...files].filter((file) =>
  /(^|\/)(node_modules|tests?|scripts?|\.env|\.git)(\/|$)/.test(file),
);
if (forbidden.length > 0) {
  console.error(`private artifact contains forbidden files: ${forbidden.join(', ')}`);
  process.exit(1);
}
console.log(`private artifact whitelist OK (${files.size} files)`);
NODE

echo "private release check done; npm publication was not invoked"
