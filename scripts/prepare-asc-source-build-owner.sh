#!/usr/bin/env bash
# summary: Materialize the linked ASC source runtime before a clean consumer install invokes prepare.
# read_when: A clean CI/release job installs a package whose lockfile links the ASC source directory.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASC_ROOT="$ROOT_DIR/packages/pi-autonomous-session-control"

if [[ ! -f "$ASC_ROOT/package-lock.json" ]]; then
  echo "ASC source build owner has no package-lock.json: $ASC_ROOT" >&2
  exit 1
fi

cd "$ASC_ROOT"
npm ci \
  --include=dev \
  --omit=peer \
  --ignore-scripts \
  --no-audit \
  --no-fund
npm run build:runtime
