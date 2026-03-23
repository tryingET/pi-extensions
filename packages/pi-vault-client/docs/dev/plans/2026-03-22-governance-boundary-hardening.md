---
summary: "Close the remaining governance and provenance gaps after deep-review hardening."
status: "completed"
updated: "2026-03-22"
system4d:
  container: "Package-local follow-through plan for vault governance hardening."
  compass: "Close the highest-risk policy gaps without widening scope."
  engine: "Enforce visibility policy -> harden provenance -> verify package and release surfaces."
  fog: "The main risk is leaving one fail-open edge after apparently successful verification."
---

# Plan: governance boundary hardening

## Scope

Complete the highest-leverage follow-through after adversarial review:

1. enforce `export_to_pi=true` on Pi-visible reads
2. fail closed on invalid governed contract JSON
3. require company-scoped receipt access through the runtime registry bridge
4. harden receipt persistence so primary-sink failure still preserves replayable provenance
5. write schema-required execution capture columns explicitly

## Acceptance criteria

- hidden (`export_to_pi=false`) templates are no longer returned by Pi-visible read surfaces
- invalid governed contract JSON no longer downgrades silently to baked-in defaults
- registry receipt accessors do not expose unscoped reads
- receipt finalization survives primary sink failure via fallback persistence
- validation covers runtime + regression + packaging paths

## Verification target

- `npm run check`
- `npm run release:check:quick`
- live reinstall into Pi
- headless `vault_query` smoke
