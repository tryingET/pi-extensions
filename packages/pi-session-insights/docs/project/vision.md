---
summary: "Product vision for deterministic Pi session insight extraction."
read_when:
  - "Evaluating scope or future work for pi-session-insights."
system4d:
  container: "Bounded local session analysis package."
  compass: "Extract first, synthesize second."
  engine: "correct structural facts -> explicit attribution -> optional synthesis."
  fog: "Feature pressure may pull semantic ranking, KES writes, or runtime activation into the correctness layer."
---

# Vision

Make large Pi sessions cheap and safe to inspect without weakening source-owner boundaries.

The stable first product is a jq-first CLI and skill that answer structural questions deterministically. Future UI or slash-command affordances are allowed only after the CLI schema and fixtures remain stable across real session shapes.

## Non-goals

- no all-session surveillance daemon;
- no MCP exposure without independent clients;
- no DSPy or semantic ranking without a labeled metric;
- no automatic KES promotion;
- no inference of owner from cwd;
- no replacement for Pi SessionManager, compaction, AK, Git, or owner-repo evidence.
