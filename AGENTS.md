# AGENTS.md — pi-extensions

## Scope
Repo-level meta context for the `pi-extensions` monorepo.
Keep this file stable, concise, and non-volatile.

## Structure
```
packages/        # Reusable libraries and package groups
apps/            # Deployable services/applications
tools/           # Shared tooling (if any)
docs/            # Documentation
ontology/        # ROCS ontology
governance/      # Work items, policies
```

## Layering
This file is the leaf repo AGENTS for the monorepo root.
Use it for repo-wide structure and navigation only.

Do not duplicate:
- workspace/company/lane policy from parent AGENTS files
- package-specific execution details that belong in package docs or scripts
- deep rationale that should live in ADRs or project docs

## Package guidance
- Put package-specific validation and workflow details in each package's docs, scripts, and manifests.
- Keep package-local AGENTS files minimal and package-scoped.
- Treat package folders as monorepo members, not independent repos, unless explicitly documented otherwise.

## Read order
1. `docs/_core/` (if present)
2. `docs/org_context/` (if present)
3. `docs/project/`
4. `docs/decisions/`
5. relevant package docs
6. relevant package manifests/scripts
