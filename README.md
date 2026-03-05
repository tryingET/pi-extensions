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

- **npm** — workspace package management
- Languages — defined per-package (see `packages/` and `apps/`)

## Quick Commands

```bash
# ROCS tooling
./scripts/rocs.sh --doctor
./scripts/rocs.sh version

# CI lanes
./scripts/ci/smoke.sh
./scripts/ci/full.sh
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

## Diary

Capture sessions in `diary/YYYY-MM-DD--type-scope-summary.md`.

## Recursion Policy

- **Allowed**: L1 → L2 (this monorepo), L2 → L3 (packages/apps)
- **Forbidden**: L2 → L1, L1 → L0
