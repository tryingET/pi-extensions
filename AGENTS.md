# AGENTS.md — pi-extensions

## Intent
Template for a monorepo workspace (packages + apps + shared tooling).

## Structure
```
packages/        # Reusable libraries
apps/            # Deployable services/applications
tools/           # Shared tooling (if any)
docs/            # Documentation
ontology/        # ROCS ontology
governance/      # Work items, policies
```

## Guardrails
- No secrets in git.
- Never push to `main`; MRs only.
- Treat `docs/_core/**` as immutable.
- Packages in `packages/` have NO `.git` (managed by monorepo).
- Apps in `apps/` have NO `.git` (managed by monorepo).
- Root local feedback bootstrap is provided by `bash ./scripts/install-hooks.sh`.
- Root GitHub feedback automation includes CI and vouch trust workflows under `.github/workflows/`.

## Deterministic tooling policy (ROCS-first)
- Prefer `./scripts/rocs.sh <args...>` before ad-hoc inline scripting.
- For ontology/policy checks, use ROCS commands as the default execution path.
- Use inline Python only as an explicit escape hatch when no deterministic command exists.

## Package Management
- Package manager: **npm**
- Languages: Defined per-package in `packages/` and `apps/` (via tpl-package)
- Root `package.json` exists to provide a monorepo validation surface (`npm run quality:pre-commit`, `npm run quality:pre-push`).
- Packages keep their own manifests and checks; do not assume npm workspace wiring exists at root unless it is added explicitly.
- Editor/formatter settings are package-local unless a root editor contract is introduced deliberately.

## Agent/operator prompts
- Repo-local commit workflow prompt lives at `.pi/prompts/commit.md`.

## Validation contract
- Monorepo root:
  - `npm run quality:pre-commit` -> `./scripts/ci/smoke.sh`
  - `npm run quality:pre-push` -> `./scripts/ci/full.sh`
  - `npm run quality:ci` -> alias for the full root validation lane
- `./scripts/ci/full.sh` is the single implementation for full root validation and is expected to cover both root infrastructure checks and the package checks discovered recursively by `scripts/ci/packages.sh`.
- Package/group roots under `packages/` use their local `package.json` scripts.
- Install local hooks with `bash ./scripts/install-hooks.sh` when you want automatic root feedback before commit/push.
- When a workflow says "run quality:* at repo root", use the root npm wrapper surface above.

## Knowledge Crystallization Flow

```
Session → diary/ (raw) → docs/learnings/ (crystallized) → TIPs (propagated)
```

**Knowledge that isn't crystallized is knowledge that will be re-learned the hard way.**

1. During work: Capture in `diary/YYYY-MM-DD--type-scope-summary.md`
2. End of session: Extract patterns, decisions, learnings
3. Weekly: Promote to `docs/learnings/` and `docs/decisions/`
4. When pattern generalizes: Propose TIP

## Recursion policy (explicit)
Allowed:
- L1 -> L2 (this monorepo)
- L2 -> L3 (packages/apps via tpl-package)

Forbidden:
- L1 -> L0
- L2 -> L1
- any cycle

## Read order
1) `docs/_core/`
2) `docs/org_context/`
3) `docs/project/`
4) `docs/decisions/`
5) `docs/learnings/`
6) `diary/`               ← recent work sessions
7) `packages/`            ← reusable libraries
8) `apps/`                ← deployable services

## Root capability map
- Before salvaging legacy repo artifacts or adding new root tooling, read:
  - `docs/project/root-capabilities.md`
