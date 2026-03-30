---
summary: "Contribution workflow for this extension repository."
read_when:
  - "Before opening PRs or submitting local changes."
system4d:
  container: "Contributor process and quality gates."
  compass: "Small, validated, documented changes."
  engine: "Branch -> implement -> check -> document -> review."
  fog: "Process details may adjust with team scale."
---

# Contributing

## Workflow

1. Create a focused branch.
2. Run `npm run docs:list` and read matched docs before cross-cutting changes.
3. Implement one scoped change.
4. Run `npm run fix` (Biome auto-fix).
5. Run `npm run check`.
6. Update docs/changelog where relevant.
7. Open PR with concise rationale and validation output.

## Standards

- Keep diffs small and reviewable.
- Preserve markdown frontmatter in generated docs.
- Prefer explicit scripts over manual one-off commands.

## Biome suppression policy

- Prefer fixing the root cause over adding suppression comments.
- Every `biome-ignore` must include a short rationale after `:`.
- If a suppression cannot be removed in the same PR, add a tracking reference (`TODO(#123)` or `Issue: #123`).
- Keep suppressions rule-scoped and line-scoped (no file-wide blanket ignores).

Example:

```ts
// biome-ignore lint/suspicious/noExplicitAny: upstream SDK type gap; TODO(#123) remove after typed client migration.
```

## Copier policy

- Keep `.copier-answers.yml` in version control.
- Do not edit `.copier-answers.yml` manually.
- Run update/recopy from a clean destination repo (commit or stash pending changes first).
- Use `copier update --trust` when `.copier-answers.yml` includes `_commit` and update is supported.
- In non-interactive shells/CI, append `--defaults` to update/recopy.
- Use `copier recopy --trust` when update is unavailable (for example local non-VCS source) or cannot reconcile cleanly.
- After recopy, re-apply local deltas intentionally and run `npm run check`.
