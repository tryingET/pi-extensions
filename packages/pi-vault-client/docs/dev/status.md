---
summary: "Current status snapshot for pi-vault-client after the Prompt Vault schema-v9 cutover and diagnostic-mode hardening."
read_when:
  - "Checking package health before editing runtime behavior or docs."
  - "Preparing handoff after a pi-vault-client implementation slice."
system4d:
  container: "Status report for the current package state."
  compass: "Keep `/vault` package truth separate from adjacent PTX or Prompt Vault authoring issues."
  engine: "State current runtime guarantees -> state verified evidence -> state remaining uncertainty."
  fog: "The main risk is resuming from stale v8/PTX-adjacent assumptions instead of the current package truth."
---

# Status

- Prompt Vault contract target: **schema v9 only**
- Schema diagnostics:
  - `checkSchemaCompatibilityDetailed()` available in runtime
  - `vault_schema_diagnostics()` available on the tool surface
  - `/vault-check` available in the interactive TUI
- Startup behavior:
  - extension stays loaded in diagnostic mode on schema mismatch
  - vault query/mutation/live-trigger surfaces stay gated when schema compatibility fails
- Query/retrieval behavior:
  - facet-native only (`artifact_kind`, `control_mode`, `formalization_level`, `controlled_vocabulary`, company visibility)
  - no tag-based compatibility logic
- Execution behavior:
  - `/vault` exact-name path covered
  - live `/vault:` exact-name transform path covered
  - render preparation is shared across vault execution paths
- Verification completed:
  - `npm run check`
  - `npm run docs:list`
  - isolated headless `vault_schema_diagnostics` smoke
  - isolated headless `vault_query` smoke
  - isolated headless `vault_retrieve` smoke
- Remaining uncertainty:
  - installed interactive `/reload` parity proof in a normal Pi runtime
  - final live TUI evidence for `/vault`, `/vault:`, and `/vault-check` after reload
- Explicit boundary:
  - `pi-vault-client` owns `/vault`, `/vault:`, and Prompt Vault client/runtime behavior
  - PTX `$$ /...` behavior belongs to `pi-prompt-template-accelerator`
