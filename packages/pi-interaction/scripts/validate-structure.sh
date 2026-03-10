#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(
  "README.md"
  "AGENTS.md"
  "CHANGELOG.md"
  "biome.jsonc"
  ".vscode/settings.json"
  ".copier-answers.yml"
  "package.json"
  "NEXT_SESSION_PROMPT.md"
  "docs/org/operating_model.md"
  "docs/project/foundation.md"
  "docs/project/vision.md"
  "docs/project/incentives.md"
  "docs/project/resources.md"
  "docs/tech-stack.local.md"
  "docs/dev/CONTRIBUTING.md"
  "docs/dev/EXTENSION_SOP.md"
  "docs/dev/trusted_publishing.md"
  "policy/stack-lane.json"
  "policy/security-policy.json"
  ".pi/prompts/commit.md"
  "scripts/docs-list.sh"
  "scripts/release-check.sh"
  "scripts/validate-structure.sh"
  "scripts/validate-structure.mjs"
  "scripts/quality-gate.sh"
  "prompts/implementation-planning.md"
  "prompts/security-review.md"
)

required_dirs=(
  ".vscode"
  "docs"
  "docs/dev"
  "docs/org"
  "docs/project"
  "extensions"
  "examples"
  "external"
  "ontology"
  "policy"
  "scripts"
  "src"
  "tests"
  ".pi"
  ".pi/prompts"
  "prompts"
)

required_executables=(
  "scripts/docs-list.sh"
  "scripts/release-check.sh"
  "scripts/validate-structure.sh"
  "scripts/validate-structure.mjs"
  "scripts/quality-gate.sh"
)

errors=0

for required_file in "${required_files[@]}"; do
  if [[ ! -f "$required_file" ]]; then
    echo "Missing required file: $required_file" >&2
    ((errors+=1))
  fi
done

for required_dir in "${required_dirs[@]}"; do
  if [[ ! -d "$required_dir" ]]; then
    echo "Missing required directory: $required_dir" >&2
    ((errors+=1))
  fi
done

for executable in "${required_executables[@]}"; do
  if [[ ! -x "$executable" ]]; then
    echo "Expected executable bit on: $executable" >&2
    ((errors+=1))
  fi
done

for copier_key in "_src_path:" "repo_name:" "command_name:" "scaffold_mode:" "workspace_relative_path:" "release_component_key:" "release_config_mode:"; do
  if ! grep -q "^${copier_key}" ".copier-answers.yml"; then
    echo "Missing copier answer key in .copier-answers.yml: ${copier_key}" >&2
    ((errors+=1))
  fi
done

if [[ -d ".github" ]]; then
  echo "Monorepo package scaffold must not create package-local .github directory" >&2
  ((errors+=1))
fi

if [[ -d ".githooks" ]]; then
  echo "Monorepo package scaffold must not create package-local .githooks directory" >&2
  ((errors+=1))
fi

if ! grep -q '^\*\.tgz$' ".gitignore"; then
  echo ".gitignore must ignore npm tarball outputs (*.tgz)" >&2
  ((errors+=1))
fi

if command -v node >/dev/null 2>&1; then
  if ! node "$ROOT_DIR/scripts/validate-structure.mjs"; then
    ((errors+=1))
  fi
fi

while IFS= read -r -d '' markdown_file; do
  if [[ "$(head -n 1 "$markdown_file")" != "---" ]]; then
    echo "Missing YAML frontmatter start in: $markdown_file" >&2
    ((errors+=1))
    continue
  fi

  if ! grep -q "^system4d:" "$markdown_file"; then
    echo "Missing system4d section in: $markdown_file" >&2
    ((errors+=1))
    continue
  fi

  for key in container compass engine fog; do
    if ! grep -q "^  $key:" "$markdown_file"; then
      echo "Missing system4d.$key in: $markdown_file" >&2
      ((errors+=1))
    fi
  done

done < <(find . -type f -name "*.md" ! -path "*/node_modules/*" ! -path "./.git/*" -print0)

if [[ "$errors" -gt 0 ]]; then
  echo "Structure validation failed with $errors issue(s)." >&2
  exit 1
fi

echo "Structure validation passed."
