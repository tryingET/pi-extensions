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
- Root pre-push/CI validation aggregates root infrastructure checks plus package checks discovered recursively under `packages/**/package.json` via `scripts/ci/packages.sh` (excluding `node_modules`).
- Editor/formatter configuration remains package-local; the monorepo root intentionally does not define a root `biome.jsonc` or root `.vscode/settings.json`.

## Quick Commands

```bash
# ROCS tooling
./scripts/rocs.sh --doctor
./scripts/rocs.sh version

# CI lanes / canonical root validation
./scripts/ci/smoke.sh        # root infrastructure smoke checks
./scripts/ci/full.sh         # root infrastructure + canonical package checks
npm run quality:pre-commit   # wrapper for smoke.sh
npm run quality:pre-push     # wrapper for full.sh
npm run quality:ci           # alias for the full root validation lane
npm run check                # alias for quality:ci

# local feedback bootstrap
bash ./scripts/install-hooks.sh

# legacy standalone repo deprecation helpers
./scripts/legacy-package-deprecation.sh inspect --legacy ~/programming/pi-extensions/<legacy> --canonical ~/ai-society/softwareco/owned/pi-extensions/packages/<target>
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
