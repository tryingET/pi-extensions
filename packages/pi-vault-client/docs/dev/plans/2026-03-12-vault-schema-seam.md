---
summary: "Plan for a bounded pi-vault-client maintenance slice: extract schema-compatibility checks from src/vaultDb.ts into a dedicated seam without changing runtime behavior."
read_when:
  - "Refactoring src/vaultDb.ts after company-context hardening."
  - "Adding focused tests around schema-compatibility reporting in pi-vault-client."
system4d:
  container: "Focused package maintenance plan for schema-compatibility extraction."
  compass: "Reduce src/vaultDb.ts responsibility without changing Prompt Vault compatibility behavior."
  engine: "Document scope -> extract schema helper -> update focused tests -> validate package/release gates."
  fog: "Main risk is drifting the schema-report contract or missing a transpiled-test dependency when the new helper module is introduced."
---

# Plan: vault schema compatibility seam

## Scope
- extract schema-compatibility constants and report assembly from `src/vaultDb.ts` into a dedicated helper module
- keep `runtime.checkSchemaCompatibilityDetailed()` and `runtime.checkSchemaVersion()` behavior unchanged
- add focused tests for the new seam and update existing regression tests to point at the extracted module
- update transpiled test harness file lists where `src/vaultDb.ts` now imports the new helper

## Acceptance criteria
- `src/vaultDb.ts` no longer owns the required schema-column lists or low-level schema-report assembly directly
- schema compatibility still requires Prompt Vault schema `9` plus the governed prompt/execution/feedback columns already enforced today
- focused tests cover both matching and mismatching schema reports through the new helper seam
- runtime-facing tests that transpile `src/vaultDb.ts` continue to pass with the new module dependency
- `npm run fix`, `npm run typecheck`, `npm run check`, and `npm run release:check` pass

## Non-goals
- no Prompt Vault schema changes
- no read/mutation behavior changes in the runtime
- no broad `src/vaultDb.ts` rewrite beyond this schema-focused extraction
