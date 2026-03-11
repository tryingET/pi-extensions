#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(
  "README.md"
  "CHANGELOG.md"
  "SECURITY.md"
  "CODE_OF_CONDUCT.md"
  "SUPPORT.md"
  "CONTRIBUTING.md"
  "AGENTS.md"
  ".copier-answers.yml"
  "package.json"
  "package-lock.json"
  "prek.toml"
  "docs/org/operating_model.md"
  "docs/project/foundation.md"
  "docs/project/vision.md"
  "docs/project/incentives.md"
  "docs/project/resources.md"
  "docs/project/skills.md"
  "docs/project/strategic_goals.md"
  "docs/project/tactical_goals.md"
  "docs/dev/CONTRIBUTING.md"
  "docs/dev/EXTENSION_SOP.md"
  "extensions/ptx.ts"
  "scripts/install-hooks.sh"
  "scripts/docs-list.sh"
  "scripts/quality-gate.sh"
  "scripts/validate-structure.sh"
  "prompts/implementation-planning.md"
  "prompts/security-review.md"
)

required_dirs=(
  "docs/org"
  "docs/dev/plans"
  "examples"
  "external"
  "extensions"
  "ontology"
  "policy"
  "scripts"
  "src"
  "tests"
  "prompts"
)

required_executables=(
  "scripts/install-hooks.sh"
  "scripts/docs-list.sh"
  "scripts/quality-gate.sh"
  "scripts/validate-structure.sh"
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

plan_count=$(find "docs/dev/plans" -maxdepth 1 -type f -name "*.md" | wc -l | tr -d ' ')
if [[ "$plan_count" -lt 1 ]]; then
  echo "docs/dev/plans must contain at least one markdown plan file" >&2
  ((errors+=1))
fi

for copier_key in "_src_path:" "repo_name:" "command_name:"; do
  if ! grep -q "^${copier_key}" ".copier-answers.yml"; then
    echo "Missing copier answer key in .copier-answers.yml: ${copier_key}" >&2
    ((errors+=1))
  fi
done

if [[ -d ".github" ]]; then
  placeholder_pattern='\{username\}|\{repo\}|\{discordInvite\}|\{@twitter\}'
  placeholder_hits="$(grep -R -nE "$placeholder_pattern" .github || true)"
  if [[ -n "$placeholder_hits" ]]; then
    echo "Unresolved placeholders found under .github:" >&2
    echo "$placeholder_hits" >&2
    ((errors+=1))
  fi

  vouch_ref="5713ce1baedf75e2f830afa3dac813a9c48bff12"
  if [[ -f ".github/workflows/vouch-check-pr.yml" ]] && ! grep -q "mitchellh/vouch/action/check-pr@${vouch_ref}" ".github/workflows/vouch-check-pr.yml"; then
    echo "vouch-check-pr workflow must pin mitchellh/vouch/action/check-pr to ${vouch_ref}" >&2
    ((errors+=1))
  fi

  if [[ -f ".github/workflows/vouch-manage.yml" ]] && ! grep -q "mitchellh/vouch/action/manage-by-issue@${vouch_ref}" ".github/workflows/vouch-manage.yml"; then
    echo "vouch-manage workflow must pin mitchellh/vouch/action/manage-by-issue to ${vouch_ref}" >&2
    ((errors+=1))
  fi

  if compgen -G ".github/workflows/vouch-*.yml" >/dev/null && grep -n "@main" .github/workflows/vouch-*.yml >/dev/null 2>&1; then
    echo "vouch workflows must not use @main refs" >&2
    ((errors+=1))
  fi

  if [[ -f ".github/workflows/vouch-check-pr.yml" ]]; then
    if ! grep -q "pull_request_target" ".github/workflows/vouch-check-pr.yml"; then
      echo "vouch-check-pr workflow must trigger on pull_request_target" >&2
      ((errors+=1))
    fi
    if ! grep -q "require-vouch" ".github/workflows/vouch-check-pr.yml"; then
      echo "vouch-check-pr workflow must set require-vouch" >&2
      ((errors+=1))
    fi
    if ! grep -q "auto-close" ".github/workflows/vouch-check-pr.yml"; then
      echo "vouch-check-pr workflow must set auto-close" >&2
      ((errors+=1))
    fi
  fi

  if [[ -f ".github/workflows/vouch-manage.yml" ]]; then
    if ! grep -q "issue_comment" ".github/workflows/vouch-manage.yml"; then
      echo "vouch-manage workflow must trigger on issue_comment" >&2
      ((errors+=1))
    fi
    if ! grep -q "concurrency:" ".github/workflows/vouch-manage.yml" || ! grep -q "group: vouch-manage" ".github/workflows/vouch-manage.yml"; then
      echo "vouch-manage workflow must define serialized concurrency" >&2
      ((errors+=1))
    fi
    if ! grep -q "vouched-file: .github/VOUCHED.td" ".github/workflows/vouch-manage.yml"; then
      echo "vouch-manage workflow must target .github/VOUCHED.td" >&2
      ((errors+=1))
    fi
  fi

  if [[ -f ".github/CODEOWNERS" ]] && grep -q "@your-github-handle" ".github/CODEOWNERS"; then
    echo ".github/CODEOWNERS must not keep @your-github-handle placeholder" >&2
    ((errors+=1))
  fi

  if [[ -f ".github/VOUCHED.td" ]] && ! grep -Eq "^github:[A-Za-z0-9][A-Za-z0-9-]*" ".github/VOUCHED.td"; then
    echo ".github/VOUCHED.td must include at least one github maintainer entry" >&2
    ((errors+=1))
  fi
fi

if command -v node >/dev/null 2>&1; then
  if ! node - <<'NODE'
const fs = require("node:fs");

let failed = false;
const fail = (msg) => {
  console.error(msg);
  failed = true;
};

try {
  const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (!Array.isArray(p.keywords) || !p.keywords.includes("pi-package")) {
    fail("package.json missing keywords entry: pi-package");
  }

  const ext = p.pi?.extensions;
  if (!Array.isArray(ext) || ext.length < 1) {
    fail("package.json missing pi.extensions array");
  } else {
    for (const entry of ext) {
      const normalized = entry.replace(/^\.\//, "");
      if (!fs.existsSync(normalized)) {
        fail(`pi.extensions entry does not exist: ${entry}`);
      }
    }
  }

  const prompts = p.pi?.prompts;
  if (!Array.isArray(prompts) || prompts.length < 1) {
    fail("package.json missing pi.prompts array");
  } else {
    for (const entry of prompts) {
      const normalized = entry.replace(/\/$/, "").replace(/^\.\//, "");
      if (!fs.existsSync(normalized)) {
        fail(`pi.prompts entry does not exist: ${entry}`);
      }
    }
  }

  const checkScript = p.scripts?.check;
  if (!["bash ./scripts/validate-structure.sh", "npm run quality:ci"].includes(checkScript)) {
    fail("package.json scripts.check must be 'bash ./scripts/validate-structure.sh' or 'npm run quality:ci'");
  }

  const testScript = p.scripts?.test;
  if (!["bash ./scripts/validate-structure.sh", "bash ./scripts/quality-gate.sh test"].includes(testScript)) {
    fail("package.json scripts.test must be 'bash ./scripts/validate-structure.sh' or 'bash ./scripts/quality-gate.sh test'");
  }

  const docsListScript = p.scripts?.["docs:list"];
  if (docsListScript !== "bash ./scripts/docs-list.sh") {
    fail("package.json scripts.docs:list must be 'bash ./scripts/docs-list.sh'");
  }

  const docsListWorkspaceScript = p.scripts?.["docs:list:workspace"];
  if (docsListWorkspaceScript !== "bash ./scripts/docs-list.sh --workspace --discover") {
    fail("package.json scripts.docs:list:workspace must be 'bash ./scripts/docs-list.sh --workspace --discover'");
  }

  const docsListJsonScript = p.scripts?.["docs:list:json"];
  if (docsListJsonScript !== "bash ./scripts/docs-list.sh --json") {
    fail("package.json scripts.docs:list:json must be 'bash ./scripts/docs-list.sh --json'");
  }

  const versionPattern = /^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/;
  const templateMeta = p["x-pi-template"] || {};
  if (templateMeta.scaffoldMode !== "simple-package") {
    fail("package.json x-pi-template.scaffoldMode must be 'simple-package'");
  }
  if (templateMeta.workspacePath !== "packages/pi-prompt-template-accelerator") {
    fail("package.json x-pi-template.workspacePath must match packages/pi-prompt-template-accelerator");
  }
  if (templateMeta.releaseComponent !== "pi-prompt-template-accelerator") {
    fail("package.json x-pi-template.releaseComponent must be 'pi-prompt-template-accelerator'");
  }
  if (templateMeta.releaseConfigMode !== "component") {
    fail("package.json x-pi-template.releaseConfigMode must be 'component'");
  }

  const rootReleaseComponentsPath = "../../scripts/release-components.mjs";
  if (!fs.existsSync(rootReleaseComponentsPath)) {
    fail(`Missing root release component helper: ${rootReleaseComponentsPath}`);
  }

  const rootRpConfigPath = "../../.release-please-config.json";
  const rootRpManifestPath = "../../.release-please-manifest.json";
  if (!fs.existsSync(rootRpConfigPath)) {
    fail(`Missing root release-please config: ${rootRpConfigPath}`);
  }
  if (!fs.existsSync(rootRpManifestPath)) {
    fail(`Missing root release-please manifest: ${rootRpManifestPath}`);
  }

  const rpConfig = JSON.parse(fs.readFileSync(rootRpConfigPath, "utf8"));
  if (rpConfig["include-v-in-tag"] !== true) {
    fail("root .release-please-config.json must set include-v-in-tag=true");
  }
  if (rpConfig["include-component-in-tag"] !== true) {
    fail("root .release-please-config.json must set include-component-in-tag=true for monorepo component tags");
  }
  if (!rpConfig.packages || !rpConfig.packages["packages/pi-prompt-template-accelerator"]) {
    fail("root .release-please-config.json must include packages/pi-prompt-template-accelerator");
  }

  const rpManifest = JSON.parse(fs.readFileSync(rootRpManifestPath, "utf8"));
  const manifestVersion = rpManifest["packages/pi-prompt-template-accelerator"];
  if (!manifestVersion) {
    fail("root .release-please-manifest.json must include packages/pi-prompt-template-accelerator");
  }
  if (!versionPattern.test(manifestVersion)) {
    fail("root .release-please-manifest.json entry must match X.Y.Z");
  }
  if (manifestVersion !== p.version) {
    fail("root .release-please-manifest.json entry must match package.json version");
  }
} catch (error) {
  fail(`Failed to validate package/release metadata: ${error.message}`);
}

process.exit(failed ? 1 : 0);
NODE
  then
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

  if [[ "$markdown_file" == "./prompts/"* || "$markdown_file" == "./.pi/prompts/"* ]]; then
    if ! grep -q "^description:" "$markdown_file"; then
      echo "Prompt template missing frontmatter description: $markdown_file" >&2
      ((errors+=1))
    fi
  fi
done < <(find . -type f -name "*.md" ! -path "./.git/*" ! -path "./node_modules/*" -print0)

if [[ "$errors" -gt 0 ]]; then
  echo "Structure validation failed with $errors issue(s)." >&2
  exit 1
fi

echo "Structure validation passed."
