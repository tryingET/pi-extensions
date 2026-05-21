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
  - `npm run release:contracts:validate`
  - `npm run compat:canary:list`
  - `npm run compat:canary`
  - `npm run compat:canary:validate`
- Shell / script implementation:
  - `scripts/quality-gate.sh`
  - `scripts/ci/smoke.sh`
  - `scripts/ci/full.sh`
  - `scripts/ci/packages.sh`
  - `scripts/package-quality-gate.sh`
  - `scripts/validate-package-release-contracts.mjs`
  - `scripts/pi-host-compatibility-canary.mjs`
  - `scripts/engineering-review-surfaces.mjs`
- Validation composition:
  - root pre-commit = `scripts/ci/smoke.sh --staged-only` + `scripts/ci/packages.sh pre-commit --staged-only`
  - root pre-push / CI = `scripts/ci/full.sh`
- Dedicated CI workflow:
  - `.github/workflows/compatibility-canary.yml`
- Root-owned compatibility contract:
  - `policy/pi-host-compatibility-canary.json`
  - exact host version + review anchor resolution for each canary profile

### Local feedback bootstrap
- `.githooks/pre-commit`
- `.githooks/pre-push`
- `scripts/install-hooks.sh`
- `.pi/prompts/commit.md`
  - repo-local commit workflow / validation gate prompt

### Repo-owned operator prompt entrypoints
- `.pi/prompts/pi-extensions-deep-dive.md`
  - repo-local discoverability / routing prompt for fresh-context package-selection and ownership questions inside this monorepo
- root docs that decide package selection and ownership boundaries:
  - `README.md`
  - `README.terse.md`
  - `docs/project/root-capabilities.md`
  - `docs/project/2026-05-08-fcos-m48-pi-wakeup-carrier.md`
    - exact Pi/host-runtime carrier boundary for FCOS-M48 steward-continuity wake-up participation; names `pi-context-overlay` as the presentation carrier and `pi-provenance` as the minimal runtime provenance helper without making Pi continuity-state authority
- live inventory/audit helpers that those root docs should stay aligned with:
  - `scripts/release-components.mjs`
  - `scripts/engineering-review-surfaces.mjs`
- keep this surface repo-specific; these prompts encode monorepo workflow + routing, while installable package prompts belong in package-local `prompts/` directories exposed via `package.json#pi.prompts`

### Review / governance feedback
- `.github/pull_request_template.md`
- `.github/CODEOWNERS`
- `.github/VOUCHED.td`
- `.github/ISSUE_TEMPLATE/*`
- `.github/dependabot.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/release-check.yml`
- `.github/workflows/release-please.yml`
- `.github/workflows/publish.yml`
- `.github/workflows/vouch-check-pr.yml`
- `.github/workflows/vouch-manage.yml`

### Release automation control plane
- `.release-please-config.json`
- `.release-please-manifest.json`
- `scripts/release-components.mjs`
- root component-mode release automation for publish-ready packages
  - current source of truth: package metadata with `x-pi-template.releaseConfigMode=component`
  - independent component PRs/tags/releases
  - publish dispatch by component-scoped tag
  - packages that were scaffolded as private or `releaseConfigMode=none` are intentionally excluded until their package metadata truthfully declares a publishable component
  - `packages/pi-interaction` remains excluded because it is a private logical group/root, not a runtime package; its publishable interaction artifacts live in split child packages

### Monorepo root docs
- `README.md`
- `AGENTS.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `SUPPORT.md`
- `docs/engineering.local.md`
- `docs/project/engineering-review-surfaces.md`
- `docs/project/reduced-form-migration-contract.md`

### Repo-owned operator routing surfaces
- repo-root prompts that encode pi-extensions-specific workflow or package-selection entrypoints:
  - `.pi/prompts/commit.md`
  - `.pi/prompts/pi-extensions-deep-dive.md`
- repo-root skills under `.pi/skills/` when the operator needs pi-extensions-specific routing or package-family grounding
- decision rule: keep repo-root prompts only when they depend on pi-extensions-specific routing, release, or workflow truth; move generic prompts to the owning shared package/runtime instead of treating the monorepo root as a generic prompt warehouse

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
- no blind reuse of standalone-package release workflows; root release automation must stay explicitly redesigned for monorepo component mode
- no repo-root claim over generic cross-repo prompts, upstream Pi command semantics, or package-local operator docs that belong in a specific package

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
- package-owned local diagnostic surfaces, such as `packages/pi-agent-vent` for agent frustration/recurrence capture
- canonicalized legacy runtime ownership, such as `packages/pi-evalset-lab` for `/evalset` datasets, compare runs, and report export

## Deletion rule for legacy standalone repos

A legacy standalone repo is ready for deletion when:
1. canonical code lives elsewhere,
2. high-value feedback/governance/docs assets are either migrated or intentionally rejected,
3. the root capability map still explains where those functions now live.

Use the reusable shutdown workflow in:
- [legacy-package-deprecation-workflow.md](legacy-package-deprecation-workflow.md)
