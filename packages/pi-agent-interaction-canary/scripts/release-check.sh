#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
release-check is intentionally unavailable for @tryinget/pi-agent-interaction-canary.

This package is private, experimental, and configured with releaseConfigMode=none.
Template generation, package validation, installation, and live canary proof do not
authorize npm publication, tagging, release workflow execution, or credential use.
EOF
exit 1
