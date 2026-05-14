---
summary: "Superseded mixed decision packet for level-2 campaign automation; retained only as decision #43's historical RFC reference."
read_when:
  - "Encountering AK decision #43 or the earlier level-2 decision-packet path."
  - "Tracing why decision #44 replaced the initial mixed artifact with the usual problem-intent/RFC chain."
type: "superseded-decision-packet"
status: "superseded"
date: "2026-05-14"
superseded_by:
  decision: "AK decision #44"
  problem_intent: "docs/project/2026-05-14-level-2-campaign-automation-problem-intent.md"
  rfc: "docs/project/2026-05-14-rfc-level-2-checkpointed-campaign-automation.md"
system4d:
  container: "Historical shim for the initially misframed level-2 campaign automation decision packet."
  compass: "Prevent stale references from being mistaken for the active RFC."
  engine: "Point readers from decision #43 to the repaired decision #44 lifecycle artifacts."
  fog:
    risks:
      - "Treating this mixed packet as the active RFC."
      - "Skipping the problem-intent/RFC/review/ADR workflow."
---

# Superseded — level-2 campaign automation decision packet

This artifact is superseded.

It is retained only because AK decision `#43` was initially created with this path as `rfc_ref`. That was the wrong lifecycle shape: the artifact mixed problem intent, evidence, RFC/design, and decision framing.

Use the repaired decision chain instead:

- problem intent: `docs/project/2026-05-14-level-2-campaign-automation-problem-intent.md`
- RFC: `docs/project/2026-05-14-rfc-level-2-checkpointed-campaign-automation.md`
- governing AK decision: `#44`

Decision `#43` is superseded by decision `#44`.
