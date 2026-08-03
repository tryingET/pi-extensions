---
summary: "Contribution workflow for the private pi-session-insights package."
read_when:
  - "Changing extractor, CLI, skill, tests, or docs."
---

# Contributing

1. Bind work to a scoped pi-extensions AK task.
2. Preserve the jq-only JSONL parsing boundary.
3. Add a deterministic fixture for every session-shape or classifier change.
4. Keep output bounded and attribution source-qualified.
5. Run `npm run fixtures:test` and `npm run check`.
6. Run the root scoped package gate and inspect the exact diff.
7. Obtain independent correctness/privacy review.

Do not add live activation, extensions, prompt bundles, publication, semantic ranking, or KES writes by convenience.
