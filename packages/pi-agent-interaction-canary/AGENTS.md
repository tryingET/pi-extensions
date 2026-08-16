---
summary: "Agent operating guardrails for this monorepo package workspace."
read_when:
  - "Before editing package code or docs in this workspace."
system4d:
  container: "Local package rules inside a shared monorepo."
  compass: "Keep package changes coherent and root-compatible."
  engine: "Targeted reading -> implement -> validate -> summarize."
  fog: "Most regressions come from root/package convention drift."
---

# AGENTS.md

## Defaults

- Prefer coherent, task-complete changes; avoid unrelated churn.
- Prefer `read` before edits.
- Prefer markdown links like `[text](path)`.
- Avoid destructive git/file ops unless explicitly requested.

## Monorepo package constraints

- This folder is a package workspace, not a git root.
- Use plain installed `ak` for task/work-item operations from any directory.
- Do not invent package-local AK wrappers or treat this package folder as an independent repo identity.
- Direction authority stays at the monorepo root; when direction docs change or you need current posture, run `ak direction import|check|export` against the root repo context rather than inventing package-local direction state.
- If the parent monorepo declares AK-native task, direction, or route authority, run package AK route checks from the monorepo root: read the root AK task and route/open-frame status before inventing package work.
- Generic operator input such as `proceed` continues the active root execution task when one exists; it does not authorize lifecycle closeout, source-owner mutation, publication, or knowledge promotion.
- Treat package docs and generated files as projections unless the monorepo declares otherwise; hand off Prompt Vault, ROCS, AK runtime, Pi/runtime, KES, steward/publication, template propagation, Oracle/DSPx, and other repo facts to their owners.
- Do not revive SG/TG/OP markdown planning where AK-native direction authority is declared; legacy `strategic_goals.md`, `tactical_goals.md`, `operating_plan.md`, or `operational_plan.md` files are archive/projection only unless a repo-local owner decision explicitly says otherwise.
- Keep package scripts compatible with monorepo root runners.
- Do not add package-local `.github/` workflows unless explicitly requested by maintainers.
- Keep release metadata (`x-pi-template`) aligned with root release-please component mapping.

## Documentation placement

- Put dated RFCs, runbooks, and implementation/evidence notes in `docs/project/`.
- Put adopted architecture decisions in `docs/adr/`.
- Do not create new `docs/dev/` trees in this package.

## Docs workflow

- Run `npm run docs:list` when task scope touches architecture/process/domain docs.
- Use `npm run docs:list:workspace` for workspace/monorepo scans.
- For TypeScript extension conventions, consult `engineering-core` lane `pi-ts`:
  - `uv tool -n run --from ~/ai-society/core/engineering-core engineering-core show pi-ts`
- The docs scripts invoke `node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs` directly; do not add a package-local wrapper or alternate implementation.

## Validation

- Run `npm run check` after structural/documentation changes.

## Copier policy

- Keep `.copier-answers.yml` tracked.
- Do not manually edit `.copier-answers.yml`.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.

## Canary-specific boundary

- This is an experimental, private, injected-receipt-only Pi package.
- Pi is a transient consumer only: never add owner acquisition, writes, caches,
  evidence recording, session persistence, memory, or authority claims.
- Registered handler provenance is not caller authentication.
- Validate with `npm run check`; live install/reload proof remains separate.
