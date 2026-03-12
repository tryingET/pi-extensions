---
summary: "Plan for a bounded pi-vault-client maintenance slice: extract template mutation/auth helpers from src/vaultDb.ts into a dedicated seam without changing runtime behavior."
read_when:
  - "Refactoring src/vaultDb.ts after the schema-compatibility extraction."
  - "Separating template mutation/auth logic from query/runtime assembly in pi-vault-client."
system4d:
  container: "Focused package maintenance plan for template mutation/auth extraction."
  compass: "Reduce src/vaultDb.ts responsibility while preserving current mutation behavior and contracts."
  engine: "Document scope -> extract mutation seam -> add/update focused tests -> validate package/release gates."
  fog: "Main risk is drifting owner-authorization or optimistic-lock behavior while moving code out of the runtime assembly module."
---

# Plan: vault mutation/auth seam

## Scope
- extract template mutation/auth helpers from `src/vaultDb.ts` into a dedicated helper module
- move owner-authorization, mutation-context resolution, mutation validation, and optimistic-lock update assembly out of the main runtime assembly file
- keep the public runtime behavior unchanged for:
  - `runtime.insertTemplate(...)`
  - `runtime.updateTemplate(...)`
  - `resolveMutationActorContext(...)`
  - `prepareTemplateUpdate(...)`
  - `validateTemplateContent(...)`
- add focused tests for the new mutation seam and update existing regression/runtime harnesses to include the new module

## Acceptance criteria
- `src/vaultDb.ts` no longer owns the low-level template mutation/auth helper implementations directly
- insert/update behavior stays unchanged, including:
  - explicit mutation company requirements
  - owner authorization
  - duplicate-name rejection on insert
  - optimistic-lock update protection via template `version`
- focused tests cover the new mutation seam directly
- runtime-facing transpiled tests that import `src/vaultDb.ts` continue to pass with the new module dependency
- `npm run fix`, `npm run typecheck`, `npm run check`, and `npm run release:check` pass

## Non-goals
- no Prompt Vault schema changes
- no query/read behavior changes
- no feedback/rating redesign
- no broad `src/vaultDb.ts` rewrite beyond this mutation/auth-focused extraction
