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
- Keep the package stack contract explicit:
  - `policy/stack-lane.json` pins the `tech-stack-core` lane
  - `docs/tech-stack.local.md` records repo-local overrides
  - root `scripts/validate-tech-stack-contract.mjs` centralizes stack-contract validation policy
  - package `AGENTS.md` may point to the canonical `tech-stack-core` CLI command

## Live package activation
- When a package change affects live Pi extension behavior, reinstall that package into Pi from its local package path.
- Path shape depends on topology:
  - simple package: `pi install /absolute/path/to/packages/<package-name>`
  - monorepo package inside a package group: `pi install /absolute/path/to/packages/<group-name>/<package-name>`
- Use the actual directory containing the package's `package.json` with the `pi` manifest.
- Then reload Pi:
  - `/reload`
- Verify with a real command/tool call after reload; do not assume install alone updated the active runtime.
- Keep package-specific install examples in package docs/AGENTS; keep this root rule generic.

## Read order
1. `docs/_core/` (if present)
2. `docs/org_context/` (if present)
3. `docs/project/`
4. `docs/decisions/`
5. relevant package docs
6. relevant package manifests/scripts
