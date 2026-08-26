---
summary: "Engineering-core overrides for the non-live, jq-first pi-context-corpus package."
read_when:
  - "Selecting validation or implementation discipline for this package."
system4d:
  container: "Repo-local deltas on top of the shared engineering-core lane."
  compass: "Node orchestrates; jq owns the query surface; fixtures pin the corpus contract."
  engine: "Shared lane -> local override -> validate with package scripts."
  fog: "Quiet schema drift between the corpus index, jq dispatch, and fixtures."
---

# engineering.local

The package retains the `ts` / `pi-ts` engineering-core lineage for Node package
conventions. The implementation is plain ESM JavaScript (`.mjs`) plus one jq
program; there is no TypeScript compile boundary.

Repo-local rules:

- `projections/corpus.jq` is the only query surface; do not invent a second
  query language or a server-side engine. The `--arg p <name>` dispatch
  convention is pinned by tests.
- Node owns argument validation, artifact discovery, batch spawning, and HTML
  rendering; it never parses session JSONL.
- Static fixtures cover: linear/faulted/empty/failed strata classification,
  exact index entries, every projection (exact JSON equality), secret-marker
  content-freedom, HTML link/escaping behavior, CLI fail-closed paths, and
  batch orchestration through a stub replay script.
- `security-privacy` requires content-free outputs (derived aggregates and
  path/label metadata only) and no coercion of `null` epistemics into numbers.
- `local-first-data`: explicit operator-named paths only; no bulk inventory of
  `~/.pi/agent/sessions`; batch globs are operator-provided.
- `validation`, `testing`, `dependency-governance`, and
  `specification-and-dsls` apply.
- The package is private, deliberately non-live, and `releaseConfigMode=none`;
  no release or live activation gate applies.

Validation:

```bash
npm run fixtures:test
npm run check
```
