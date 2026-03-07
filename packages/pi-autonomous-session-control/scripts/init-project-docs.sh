#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUESTIONS_FILE="$ROOT_DIR/docs/org/project-docs-intake.questions.json"
ROUTER_FILE="$ROOT_DIR/.pi/extensions/startup-intake-router.ts"
PROMPT_FILE="$ROOT_DIR/.pi/prompts/init-project-docs.md"
BUILDER_FILE="$ROOT_DIR/scripts/build-intake-questions-runtime.mjs"

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

for required in "$QUESTIONS_FILE" "$ROUTER_FILE" "$PROMPT_FILE" "$BUILDER_FILE"; do
  if [[ ! -f "$required" ]]; then
    echo "Missing required file: $required" >&2
    exit 1
  fi
done

read_pkg_config_string() {
  local key="$1"
  local fallback="$2"

  if ! command -v node >/dev/null 2>&1; then
    echo "$fallback"
    return 0
  fi

  local value
  value="$(node -e '
const fs = require("node:fs");
const pkgPath = process.argv[1];
const key = process.argv[2];
const fallback = process.argv[3];
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const val = pkg?.config?.[key];
process.stdout.write(typeof val === "string" && val.trim() ? val : fallback);
' "$ROOT_DIR/package.json" "$key" "$fallback" 2>/dev/null || true)"

  if [[ -z "$value" ]]; then
    echo "$fallback"
  else
    echo "$value"
  fi
}

INTAKE_PROFILE="$(read_pkg_config_string intakeProfile guided)"
INTERVIEW_TOOL_VERSION="$(read_pkg_config_string interviewToolVersion 0.5.1)"
INTAKE_CONTEXT_SEED="$(read_pkg_config_string intakeContextSeed "")"
INTERVIEW_PACKAGE_SPEC="pi-interview@${INTERVIEW_TOOL_VERSION}"

install_interview_tool() {
  local installed=false

  if command -v pi >/dev/null 2>&1; then
    echo "Attempting interview tool install via: pi install npm:${INTERVIEW_PACKAGE_SPEC}"
    if pi install "npm:${INTERVIEW_PACKAGE_SPEC}"; then
      installed=true
      echo "Installed ${INTERVIEW_PACKAGE_SPEC} via pi package install. Restart pi to load it."
    else
      echo "pi install npm:${INTERVIEW_PACKAGE_SPEC} failed; trying npm exec fallback." >&2
    fi
  fi

  if [[ "$installed" != "true" ]] && command -v npm >/dev/null 2>&1; then
    echo "Attempting interview tool install via: npm exec --yes --package ${INTERVIEW_PACKAGE_SPEC} -- pi-interview"
    if npm exec --yes --package "$INTERVIEW_PACKAGE_SPEC" -- pi-interview; then
      installed=true
      echo "Installed ${INTERVIEW_PACKAGE_SPEC} via npm exec helper. Restart pi to load it."
    else
      echo "npm exec install helper failed." >&2
    fi
  fi

  if [[ "$installed" != "true" ]]; then
    echo "Could not auto-install interview tooling." >&2
    echo "Manual fallback: run 'pi install npm:${INTERVIEW_PACKAGE_SPEC}' and restart pi." >&2
    echo "Prompt fallback still works: /init-project-docs can collect answers in plain chat when interview is unavailable." >&2
  fi
}

if [[ "$INSTALL_INTERVIEW" == "true" ]]; then
  install_interview_tool
fi

echo "Interview-first document setup"
echo ""
echo "0) Optional: run npm run docs:list to review docs + read_when hints."
echo "1) Intake profile: ${INTAKE_PROFILE}"
echo "2) Intake context seed from package config: ${INTAKE_CONTEXT_SEED:-<none>}"
echo "3) Ensure interview capability is available in pi (built-in interview tool OR pinned pi-interview package)."
echo "   Install option: pi install npm:${INTERVIEW_PACKAGE_SPEC} (pi-agent/extensions API v0.35.0+; then restart pi)."
echo "4) Open this repository in pi."
echo "5) Send a natural-language intent as the first non-command message in a session."
echo "6) Router will prefill: /init-project-docs \"<intent>\""
echo "7) Runtime intake questions are context-adapted via:"
echo "   node ./scripts/build-intake-questions-runtime.mjs --output docs/org/project-docs-intake.runtime.questions.json"
echo "8) Review/edit and run that command."
echo ""
echo "Fallback: run /init-project-docs manually (it can proceed with plain chat Q&A if interview tool is unavailable)."
echo "Questions source: $QUESTIONS_FILE"
echo "Runtime builder: $BUILDER_FILE"
echo ""
echo "After updates, run: bash ./scripts/validate-structure.sh"
