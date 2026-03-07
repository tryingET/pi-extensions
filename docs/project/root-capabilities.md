---
summary: "Canonical inventory of what the pi-extensions monorepo root does and does not own."
read_when:
  - "Deciding whether a capability belongs at monorepo root or package level."
  - "Before migrating legacy standalone repo artifacts into the monorepo root."
system4d:
  container: "Monorepo root capability registry."
  compass: "Keep root responsibilities explicit, minimal, and durable."
  engine: "Read capability map -> place change at correct layer -> validate."
  fog: "Without an explicit map, package-level and root-level concerns drift into each other."
---

# Root capabilities — pi-extensions monorepo

## Root owns

### Validation control plane
- `package.json` root validation surface:
  - `npm run quality:pre-commit`
  - `npm run quality:pre-push`
  - `npm run quality:ci`
  - `npm run check`
- Shell implementation:
  - `scripts/quality-gate.sh`
  - `scripts/ci/smoke.sh`
  - `scripts/ci/full.sh`
  - `scripts/ci/packages.sh`
  - `scripts/package-quality-gate.sh`

### Local feedback bootstrap
- `.githooks/pre-commit`
- `.githooks/pre-push`
- `scripts/install-hooks.sh`
- `.pi/prompts/commit.md`

### Review / governance feedback
- `.github/pull_request_template.md`
- `.github/CODEOWNERS`
- `.github/VOUCHED.td`
- `.github/ISSUE_TEMPLATE/*`
- `.github/dependabot.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/vouch-check-pr.yml`
- `.github/workflows/vouch-manage.yml`

### Monorepo root docs
- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `docs/tech-stack.local.md`

## Root does not own

### Package-local implementation contracts
- package source layout
- package-local tests
- package-local release checks
- package-local TypeScript/Biome/editor settings

### Intentional non-goals at root (current)
- no root `biome.jsonc`
- no root `.vscode/settings.json`
- no claim that root is a full npm workspace manifest
- no blind reuse of standalone-package release workflows (`release-please`, `publish`, package-scoped release-check`) until explicitly redesigned for monorepo use

## Placement rule

Use monorepo root for:
- shared feedback loops
- shared governance/review mechanisms
- shared validation orchestration
- root-level documentation of repo responsibilities

Use package/group roots for:
- code-quality configs tied to package source
- package build/test/release contracts
- package-specific docs and stack deviations

## Deletion rule for legacy standalone repos

A legacy standalone repo is ready for deletion when:
1. canonical code lives elsewhere,
2. high-value feedback/governance/docs assets are either migrated or intentionally rejected,
3. the root capability map still explains where those functions now live.

Use the reusable shutdown workflow in:
- [legacy-package-deprecation-workflow.md](legacy-package-deprecation-workflow.md)
