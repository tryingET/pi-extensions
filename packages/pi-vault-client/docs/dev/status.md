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
  - interaction helpers are consumed through real package dependencies on `@tryinget/pi-interaction-kit` and `@tryinget/pi-trigger-adapter`
  - `prepack` rewrites local `file:` specs to versioned package dependencies and stages bundled runtime copies for release-safe tarballs while the support packages are still being rolled out independently
  - npm registry lookups for `@tryinget/pi-interaction-kit`, `@tryinget/pi-trigger-adapter`, and `@tryinget/pi-editor-registry` currently return 404, so the temporary bundled-dependency staging path is still required
  - package release gate now checks static runtime imports, packed-manifest rewrite, clean-room tarball install, and installed-package extension registration
  - execution / feedback / template writes commit only their scoped Dolt tables; there is no repo-wide session-shutdown auto-commit
- Verification completed:
  - `npm run check`
  - `npm run release:check`
  - `npm run docs:list`
- Remaining uncertainty:
  - installed interactive `/reload` parity proof in a normal Pi runtime
  - final live TUI evidence for `/vault`, `/vault:`, and `/vault-check` after reload
- Explicit boundary:
  - `pi-vault-client` owns `/vault`, `/vault:`, and Prompt Vault client/runtime behavior
  - PTX `$$ /...` behavior belongs to `pi-prompt-template-accelerator`
