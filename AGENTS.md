---
summary: "Repo-level meta context for the pi-extensions monorepo."
read_when:
  - "Starting work in the pi-extensions monorepo root."
  - "Needing repo-level structure, package guidance, or live package activation rules."
---

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
- When creating a new package under `packages/`, start from `../pi-extensions-template` (usually `scaffold_mode=simple-package`) and keep `.copier-answers.yml` tracked. If the package is a private support library or deliberately non-live package that must not expose `package.json#pi.extensions` / `package.json#pi.prompts`, record that exception in the package-local `AGENTS.md` and README rather than silently hand-scaffolding.
- For AK task/work-item operations in this monorepo, use plain installed `ak`.
  - Run it from the repo root or a package directory; repo identity still belongs to the monorepo root.
  - Do not invent package-local AK wrappers or treat a package folder as its own repo identity.
- For new package-local documentation, prefer:
  - `docs/project/` for dated RFCs, runbooks, evidence notes, and implementation guidance
  - `docs/adr/` for adopted architectural decisions
  - avoid creating new `docs/dev/` trees
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

## Agent discoverability
- Repo-specific operator knowledge should live primarily in repo-owned skills under `.pi/skills/`.
- Repo-specific explicit invocation helpers should live under `.pi/prompts/` when a named entrypoint is useful.
- If a prompt/helper stops being repo-specific, move it to the owning shared package or runtime instead of accumulating generic prompts at the monorepo root.
- Keep this root `AGENTS.md` stable and structural; put package-family/operator depth into canonical docs and repo-owned skills instead of bloating this file.

## Direction workflow
- When this repo's direction docs under `docs/project/` change, or when current posture needs verification, use `ak direction import|check|export` from the repo root.
- Treat `ak direction check` as the authority-reconciliation gate between repo direction docs and AK's structured direction substrate.

## Read order
1. `docs/_core/` (if present)
2. `docs/org_context/` (if present)
3. `docs/project/`
4. `docs/adr/` (if present)
5. `docs/decisions/` (legacy, if present)
6. relevant package docs
7. relevant package manifests/scripts
