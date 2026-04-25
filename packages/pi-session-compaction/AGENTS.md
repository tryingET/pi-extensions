---
summary: "Package scope note for pi-session-compaction."
read_when:
  - "You are editing files under packages/pi-session-compaction/."
---

# AGENTS.md — pi-session-compaction

## Scope

`packages/pi-session-compaction/` is the intended single owner for custom Pi `session_before_compact` summaries in this monorepo.

This package is template-baseline-aligned with `../pi-extensions-template` and now exposes a live Pi compaction extension entrypoint behind the existing fail-closed registration guard. Do not add slash commands or prompts, and do not enable any second custom `session_before_compact` owner.

## Boundaries

- Own custom compaction summary shape, summarizer model resolution, files-touched manifests, and user-prompt/command preservation.
- Do not move compaction-summary ownership into `pi-autonomous-session-control`; ASC owns runtime/subagent/rewind behavior and may observe `session_compact` for rewind aliasing.
- Do not enable more than one custom `session_before_compact` override at a time.
- Keep branch-tree summary augmentation optional and documented separately from the main compaction override.

## Current implementation status

The package has model-resolution, files-touched, user-prompt preservation, `session_before_compact` handler tests, a fail-closed registration guard, live extension entrypoint, and non-live branch-tree augmentation helpers. The live entrypoint registers input tracking plus one `session_before_compact` handler only after the cutover preflight proves no other compaction override is installed.

## Template / scaffold policy

- Keep `.copier-answers.yml` tracked.
- Do not manually edit `.copier-answers.yml`.
- For template refreshes, generate/update from `../pi-extensions-template`, then re-apply this package's deliberate live compaction-entrypoint exception.
- After template reconciliation, run `npm run check`.

## Validation

From this package root:

```bash
npm run test
npm run check
```
