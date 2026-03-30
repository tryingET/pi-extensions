---
summary: "Monorepo root overview and operator entrypoint for pi-extensions."
read_when:
  - "Starting work at the pi-extensions monorepo root."
  - "Looking for root-level validation, canary, and governance commands."
---

# pi-extensions

Software Company monorepo workspace.

## Structure

```
packages/        # Reusable libraries
apps/            # Deployable services/applications
docs/            # Documentation
ontology/        # ROCS ontology
governance/      # Work items, policies
scripts/         # CI/utility scripts
```

## Package Manager

- **npm** — monorepo validation surface at root plus per-package manifests under `packages/` and `apps/`
- Languages — defined per-package (see `packages/` and `apps/`)
- Root `package.json` currently exists to expose consistent validation commands; it is not a full npm workspace manifest.
- Root validation routes through `scripts/quality-gate.sh`.
- Root pre-push/CI validation aggregates root infrastructure checks plus package checks orchestrated via `scripts/package-quality-gate.sh` from `scripts/ci/packages.sh`.
- Editor/formatter configuration remains package-local; the monorepo root intentionally does not define a root `biome.jsonc` or root `.vscode/settings.json`.

## Quick Commands

```bash
# ROCS tooling
./scripts/rocs.sh --doctor
./scripts/rocs.sh version

# CI lanes / canonical root validation
./scripts/quality-gate.sh pre-commit   # canonical root quality-gate wrapper
./scripts/quality-gate.sh pre-push
./scripts/quality-gate.sh ci
./scripts/ci/smoke.sh                  # root infrastructure smoke checks
./scripts/ci/full.sh                   # root infrastructure + canonical package checks
./scripts/package-quality-gate.sh ci packages/pi-vault-client
npm run quality:pre-commit
npm run quality:pre-push
npm run quality:ci
npm run check
npm run compat:canary:list          # list host-compatibility scenarios + exact host contract
npm run compat:canary               # local mirror of the dedicated compatibility-canary workflow (auto-aligns scenario packages to the pinned host contract)
PI_HOST_COMPAT_CANARY=1 ./scripts/ci/full.sh   # optional local full-lane mirror
# explicit upgrade candidate
PI_HOST_COMPAT_HOST_VERSION=0.61.0 PI_HOST_COMPAT_CHANGELOG_REF='https://github.com/badlogic/pi-mono/compare/v0.60.0...v0.61.0' npm run compat:canary -- --profile upgrade

# dedicated CI signal
# GitHub Actions: .github/workflows/compatibility-canary.yml

# local feedback bootstrap
bash ./scripts/install-hooks.sh

# legacy standalone repo deprecation helpers
./scripts/legacy-package-deprecation.sh inspect --legacy ~/programming/pi-extensions/<legacy> --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
./scripts/legacy-package-deprecation.sh render-handoff --legacy ~/programming/pi-extensions/<legacy> --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
./scripts/legacy-package-deprecation.sh relocate-sessions --legacy ~/programming/pi-extensions/<legacy> --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
```

## ROCS command flow

1. `./scripts/rocs.sh --doctor` — verify ROCS environment
2. `./scripts/rocs.sh validate --repo .` — validate ontology
3. `./scripts/rocs.sh lint --repo .` — lint governance files

## Adding Packages

Use `tpl-package` from your L1 templates to add packages:

```bash
# From L1 templates repo
./scripts/new-repo-from-copier.sh tpl-package /path/to/monorepo/packages/<name> \
  -d package_name=<name> \
  -d package_type=library \
  -d language=<python|node|typescript|rust|go> \
  --defaults --overwrite
```

## Adding Apps

```bash
# From L1 templates repo
./scripts/new-repo-from-copier.sh tpl-package /path/to/monorepo/apps/<name> \
  -d package_name=<name> \
  -d package_type=app \
  -d language=<python|node|typescript|rust|go> \
  --defaults --overwrite
```

## Governance

- Work items: `governance/work-items.json`
- Policies: `policy/`
- Ontology: `ontology/`
- Root capability registry:
  - `docs/project/root-capabilities.md`
- Pi host compatibility canary:
  - `policy/pi-host-compatibility-canary.json`
  - `docs/project/pi-host-compatibility-canary.md`
  - `scripts/pi-host-compatibility-canary.mjs`
  - `.github/workflows/compatibility-canary.yml`
  - upstream trigger bridge lives in `~/ai-society/softwareco/contrib/scripts/pi-mono-compatibility-relay.sh`
- Legacy standalone repo shutdown workflow:
  - `docs/project/legacy-package-deprecation-workflow.md`
- Legacy transition backlog:
  - `docs/project/legacy-transition-backlog.md`
- Review/ownership feedback:
  - `.github/pull_request_template.md`
  - `.github/CODEOWNERS`
  - `.github/VOUCHED.td`
  - `.github/ISSUE_TEMPLATE/*`
  - `.github/workflows/ci.yml`
  - `.github/workflows/vouch-check-pr.yml`
  - `.github/workflows/vouch-manage.yml`
  - `.github/dependabot.yml`
- Repo-local stack note:
  - `docs/tech-stack.local.md`
- Package stack contract surface:
  - reduced-form target: package-local `docs/tech-stack.local.md` only when a package has a real local override
  - current audit + routing note: `docs/project/tech-stack-review-surfaces.md`
  - live audit command: `npm run tech-stack:review-surfaces`
  - package-local `policy/stack-lane.json` remains present in some existing packages and is tracked by the audit
  - root helper `scripts/validate-tech-stack-contract.mjs`
  - package-local `AGENTS.md` / `docs/project/resources.md`
- Upstream lane CLI:
  - `uv tool run --from ~/ai-society/core/tech-stack-core tech-stack-core show pi-ts --prefer-repo`
- Agent/operator feedback prompt:
  - `.pi/prompts/commit.md`
- Community/process docs:
  - `CONTRIBUTING.md`
  - `CODE_OF_CONDUCT.md`
  - `SECURITY.md`
  - `SUPPORT.md`

## Diary

Capture sessions in `diary/YYYY-MM-DD--type-scope-summary.md`.

## Recursion Policy

- **Allowed**: L1 → L2 (this monorepo), L2 → L3 (packages/apps)
- **Forbidden**: L2 → L1, L1 → L0
