#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUESTIONS_FILE="$ROOT_DIR/docs/org/project-docs-intake.questions.json"
ROUTER_FILE="$ROOT_DIR/.pi/extensions/startup-intake-router.ts"
PROMPT_FILE="$ROOT_DIR/.pi/prompts/init-project-docs.md"

INSTALL_INTERVIEW=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-interview)
      INSTALL_INTERVIEW=true
      ;;
    -h|--help)
      echo "Usage: ./scripts/init-project-docs.sh [--install-interview]"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" >&2
      echo "Usage: ./scripts/init-project-docs.sh [--install-interview]" >&2
      exit 1
      ;;
  esac
  shift
done

for required in "$QUESTIONS_FILE" "$ROUTER_FILE" "$PROMPT_FILE"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing required file: $required" >&2
    exit 1
  fi
done

if [[ "$INSTALL_INTERVIEW" == "true" ]]; then
  if command -v pi-interview >/dev/null 2>&1; then
    pi-interview
  else
    echo "pi-interview command not found. Install the interactive-interview extension first, then rerun with --install-interview." >&2
  fi
fi

echo "Interview-first document setup"
echo ""
echo "0) Optional: run npm run docs:list to review docs + read_when hints."
echo "1) Ensure the interview extension is installed and loaded in pi."
echo "2) Open this repository in pi."
echo "3) Send a natural-language intent as the first non-command message in a session."
echo "4) Router will prefill: /init-project-docs \"<intent>\""
echo "5) Review/edit and run that command."
echo ""
echo "Fallback: run /init-project-docs manually."
echo "Questions source: $QUESTIONS_FILE"
echo ""
echo "After updates, run: bash ./scripts/validate-structure.sh"
