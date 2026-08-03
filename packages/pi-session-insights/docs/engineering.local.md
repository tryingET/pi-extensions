---
summary: "Engineering-core overrides for the jq-first, skill-only pi-session-insights package."
read_when:
  - "Selecting validation or implementation discipline for this package."
---

# engineering.local

The generated package retains the `ts` / `pi-ts` engineering-core lineage for Node package conventions, while the correctness implementation is JavaScript orchestration plus jq.

Repo-local rules:

- Node validates arguments and spawns jq; it does not parse session JSONL.
- jq owns structural extraction and bounded machine output.
- Static fixtures cover branching, both `firstKeptEntryId` and `retainedTail` compactions, custom entries, model/thinking-level changes, spawn roles, strict attribution, output caps, and malformed trees.
- `security-privacy` requires capped cardinality and strings and excludes tool output, provider payloads, hidden thinking, auth, and full chronology.
- Authority-bearing attribution requires `{value, source}` records with non-whitespace sources; source-less or blank-source values fail closed and cannot populate owner or propagation fields.
- `local-first-data` requires explicit session/attribution files and no network.
- `validation`, `testing`, `observability`, `specification-and-dsls`, and `engineering-reasoning` apply.
- The package is private, skill-only, and `releaseConfigMode=none`; no release or live activation gate applies to this slice.

Validation:

```bash
npm run fixtures:test
npm run check
```
