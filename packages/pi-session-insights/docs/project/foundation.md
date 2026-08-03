---
summary: "Foundation and authority boundary for deterministic Pi session insight extraction."
read_when:
  - "Changing the package architecture or authority model."
system4d:
  container: "One explicit-session jq extractor plus a thin Node CLI and Pi skill."
  compass: "Session observation is not canonical ownership."
  engine: "validate file -> jq tree reconstruction -> bounded facts -> optional sourced attribution."
  fog: "Cwd, assistant claims, or filesystem mtime may be mistaken for authority/currentness."
---

# Foundation

## Components

- `lib/session-insights.jq` — only JSONL parser and machine-contract producer.
- `bin/pi-session-insights.mjs` — argument/file validation and jq process orchestration only.
- `skills/pi-session-jsonl/SKILL.md` — thin operator procedure over the CLI.
- `tests/session-insights.test.mjs` — fixture, branching, compaction, role, attribution, bounds, and failure coverage.

## Authority

Session bytes establish persisted observations only. They may identify header cwd, message text, explicit AK references, tool-call paths, and session-tree structure. They do not establish:

- current task status or task owner;
- source/runtime/KES owner;
- successful Git/runtime mutation;
- diary/learnings propagation;
- activation, promotion, release, or publication.

Those fields remain null/session-only unless a source-qualified attribution document is supplied after owner readback.

## Scaling

The jq pass is O(n) storage plus parent-map reconstruction for one named file. It may read a tens-of-megabytes JSONL into jq memory, but it never asks an LLM to scan that input. Output caps bound message text and active-chain identifiers.
