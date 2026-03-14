---
description: Plan or apply an ontology change through the package's workflow core
system4d:
  container: "Prompt template for ontology mutations."
  compass: "Keep ontology writes explicit, routed, and validated."
  engine: "Inspect -> route -> plan/apply -> validate/build."
  fog: "Direct file edits can bypass routing and validation semantics."
---

You are working on an ontology change.

Request:

$@

Workflow:
1. Use `ontology_inspect` first to establish current ontology context.
2. Use `ontology_change` in `mode=plan` before writing unless the operator explicitly asked for immediate apply.
3. Keep repo/company/core placement explicit.
4. After apply, report validation/build results clearly.
5. Do not silently fall back to raw file edits when `ontology_change` can express the change.
