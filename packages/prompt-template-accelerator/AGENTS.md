---
summary: "Agent operating guardrails for this repository."
read_when:
  - "Before an agent edits code or docs in this repository."
system4d:
  container: "Local repo rules for coding agents."
  compass: "Small diffs, clear validation, no silent assumptions."
  engine: "Read docs -> implement -> validate -> summarize."
  fog: "Task ambiguity resolved by asking concise clarifying questions."
---

# AGENTS.md

## Defaults

- Keep changes reviewable and scoped.
- Prefer `read` before edits.
- Prefer markdown links like `[text](path)`.
- Avoid destructive git/file ops unless explicitly requested.

## Docs workflow

- Run `npm run docs:list` at task start to surface docs and `read_when` hints.
- Use `npm run docs:list:workspace` for workspace/monorepo scans.
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
