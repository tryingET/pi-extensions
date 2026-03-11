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
  - visibility-sensitive tool reads fail closed without explicit company context
  - cross-company visibility overrides are rejected on the tool surface
- Execution behavior:
  - `/vault` exact-name path covered
  - live `/vault:` exact-name transform path covered
  - `/route` now shares the same preparation boundary instead of bypassing rendering/frontmatter handling
  - render preparation is shared across vault execution paths
- Packaging / persistence behavior:
  - runtime `.js` artifacts are generated from the package `*.ts` entrypoints for installable tarballs
  - interaction helpers are consumed through published semver dependencies on `@tryinget/pi-interaction-kit` and `@tryinget/pi-trigger-adapter`
  - the temporary bundled-dependency staging bridge is gone
  - package release gate now checks static runtime imports, packed-manifest dependency hygiene, clean-room tarball install, and installed-package extension registration
  - execution / feedback / template writes commit only their scoped Dolt tables; there is no repo-wide session-shutdown auto-commit
- Verification completed:
  - `npm run check`
  - `npm run release:check`
  - `npm run docs:list`
  - isolated installed-package `vault_schema_diagnostics` headless smoke
  - isolated installed-package `vault_query` headless smoke
  - isolated installed-package live `/vault:meta-orchestration::phase-1-live` smoke
- Remaining uncertainty:
  - same-session interactive `/reload` parity proof in a normal Pi runtime
  - final TUI evidence for interactive command-handler paths (`/vault`, `/route`, `/vault-check`) after reload
- Explicit boundary:
  - `pi-vault-client` owns `/vault`, `/vault:`, and Prompt Vault client/runtime behavior
  - PTX `$$ /...` behavior belongs to `pi-prompt-template-accelerator`
