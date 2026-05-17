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

# AGENTS.md — pi-model-selection

## Package scope

`packages/pi-model-selection/` is a top-level shared support library package for Pi model-selection and auth-resolution primitives. It is not part of the `packages/pi-interaction/` package group.

It is template-baseline-aligned with `../pi-extensions-template`, but it intentionally does **not** expose a live Pi extension entrypoint or package prompt bundle yet. Do not add `package.json#pi.extensions`, `package.json#pi.prompts`, slash commands, or hooks unless the operator explicitly asks for a live extension surface and no-double-registration tests exist.

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
- Keep package scripts compatible with monorepo root runners.
- Do not add package-local `.github/` workflows unless explicitly requested by maintainers.
- Keep release metadata (`x-pi-template`) aligned with root release-please component mapping.
- This package is a support library exception to the generated installable-extension shape; keep that exception explicit rather than adding a no-op command just to satisfy scaffold defaults.

## Documentation placement

- Put dated RFCs, runbooks, and implementation/evidence notes in `docs/project/`.
- Put adopted architecture decisions in `docs/adr/`.
- Do not create new `docs/dev/` trees in this package.

## Docs workflow

- Run `npm run docs:list` when task scope touches architecture/process/domain docs.
- Use `npm run docs:list:workspace` for workspace/monorepo scans.
- For TypeScript extension conventions, consult `engineering-core` lane `pi-ts`:
  - `uv tool run --from ~/ai-society/core/engineering-core engineering-core show pi-ts --prefer-repo`
- If your docs-list script is not at `~/ai-society/core/agent-scripts/scripts/docs-list.mjs`, set `DOCS_LIST_SCRIPT`.

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
