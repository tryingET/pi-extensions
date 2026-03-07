---
summary: "Lifecycle SOP for extension delivery and maintenance."
read_when:
  - "Planning, implementing, verifying, releasing, or maintaining extension work."
system4d:
  container: "End-to-end extension operating procedure."
  compass: "Consistent quality from idea to maintenance."
  engine: "plan -> implement -> verify -> release -> maintain."
  fog: "Unknowns resolved through incremental validation loops."
---

# Extension SOP

## 1) Plan

- Define scope and acceptance criteria.
- Run `npm run docs:list` and read docs matching your task domain.
- Capture work in `docs/dev/plans/`.
- Confirm risks and dependencies.

## 2) Implement

- Build in small commits.
- Keep command/tool behavior explicit.
- Update docs as behavior changes.

## 3) Verify

- Run `npm run check`.
- Execute relevant extension tests.
- Validate prompt templates if changed.

## 4) Release

- Run `npm run release:check` (or `npm run release:check:quick` for artifact-only CI mode).
- Confirm GitHub Actions settings allow marketplace actions and PR creation by workflows.
- Use release-please PR flow for versioning/changelog updates.
- For first-time npm packages, bootstrap once with token auth before switching fully to trusted publishing.
- Publish from GitHub release after publish workflow checks pass.
- Sync extension to live pi when needed.

## 5) Maintain

- Monitor regressions and user feedback.
- Re-run validation after dependency/script changes.
- Keep `docs/dev/status.md` and `NEXT_SESSION_PROMPT.md` current.
