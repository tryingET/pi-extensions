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

## Deterministic tooling policy (ROCS-first)
- Prefer `./scripts/rocs.sh <args...>` before ad-hoc inline scripting.
- For ontology/policy checks, use ROCS commands as the default execution path.
- Use inline Python only as an explicit escape hatch when no deterministic command exists.

## Package Management
- Package manager: **npm**
- Languages: Defined per-package in `packages/` and `apps/` (via tpl-package)
- Workspace config at root; packages inherit workspace settings.

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
