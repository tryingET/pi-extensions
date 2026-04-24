---
summary: "Package scope note for pi-session-compaction."
read_when:
  - "You are editing files under packages/pi-session-compaction/."
---

# AGENTS.md — pi-session-compaction

## Scope

`packages/pi-session-compaction/` is the intended single owner for custom Pi `session_before_compact` summaries in this monorepo.

This package is template-baseline-aligned with `../pi-extensions-template`, but it intentionally does **not** expose or install a live Pi compaction extension entrypoint yet. Do not add `package.json#pi.extensions`, slash commands, prompts, or a `session_before_compact` hook until handler-level tests pass and no other compaction override is enabled.

## Boundaries

- Own custom compaction summary shape, summarizer model resolution, files-touched manifests, and user-prompt/command preservation.
- Do not move compaction-summary ownership into `pi-autonomous-session-control`; ASC owns runtime/subagent/rewind behavior and may observe `session_compact` for rewind aliasing.
- Do not enable more than one custom `session_before_compact` override at a time.
- Keep branch-tree summary augmentation optional and documented separately from the main compaction override.

## Current implementation status

The package has model-resolution, files-touched, user-prompt preservation, non-live `session_before_compact` handler tests, a non-live fail-closed registration guard, and non-live branch-tree augmentation helpers. Do not install this package as the live compaction owner until a deliberate hook registration plan confirms no other compaction override is enabled.

## Template / scaffold policy

- Keep `.copier-answers.yml` tracked.
- Do not manually edit `.copier-answers.yml`.
- For template refreshes, generate/update from `../pi-extensions-template`, then re-apply this package's deliberate non-live compaction exception.
- After template reconciliation, run `npm run check`.

## Validation

From this package root:

```bash
npm run test
npm run check
```
