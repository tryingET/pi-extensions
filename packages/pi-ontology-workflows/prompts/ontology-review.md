---
description: Review ontology state and route likely changes without writing
system4d:
  container: "Prompt template for ontology review and routing."
  compass: "Understand ontology state before making scope decisions."
  engine: "Status -> search/pack -> propose route -> stop before apply."
  fog: "Scope mistakes are common when ontology changes are guessed from filenames alone."
---

Review this ontology request without applying changes:

$@

Workflow:
1. Use `ontology_inspect` with `kind=status` first.
2. Use `ontology_inspect` with `kind=search` or `kind=pack` as needed.
3. Recommend repo/company/core placement explicitly.
4. If a change is needed, finish with an `ontology_change` `mode=plan` response rather than `mode=apply`.
