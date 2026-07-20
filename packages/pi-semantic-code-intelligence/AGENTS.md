---
summary: "Package-local rules for Pi's SCI composite-workflow bridge."
read_when:
  - "Changing SCI tool registration, transport, or toolbox profiles."
type: "reference"
system4d:
  container: "Package-local Pi-to-SCI registration and transport boundary."
  compass: "Keep native SCI usage composite-first, preview-first, and owner-separated."
  engine: "Read owner contracts -> change schemas/bridge -> unit test -> live MCP dogfood -> Pi reload proof."
  fog: "Schema drift, automatic retries after indeterminate effects, or accidental publication/apply enablement."
---

# AGENTS.md — pi-semantic-code-intelligence

## Scope

This package owns Pi-side registration and MCP stdio bridging for SCI composite workflows. SCI owns workflow behavior and MCP contracts; `pi-toolbox-discovery` owns activation/risk gating.

## Guardrails

- Keep the model-facing surface composite-first; do not expose SCI primitives merely to mirror its full registry.
- Preserve exact SCI workflow names so evidence maps directly to the producer contract.
- Keep the native schemas preview-only: do not expose `apply` and do not set `ALLOW_SNAPSHOT_APPLY`.
- Keep runtime state under the target workspace's `.ontology/` boundary.
- Never retry a failed check workflow automatically because command effects may be indeterminate.
- Use native Pi `read`/`edit` after SCI identifies relevant files and for straightforward textual/Markdown edits.
- Keep `private:true` and `releaseConfigMode=none` unless a separate publication decision is accepted.

## Validation

```bash
npm install
npm test
npm run dogfood
bash ../../scripts/package-quality-gate.sh ci packages/pi-semantic-code-intelligence
```

After a live package change, reinstall from this package directory, reload Pi, and verify at least one real native SCI tool call.
