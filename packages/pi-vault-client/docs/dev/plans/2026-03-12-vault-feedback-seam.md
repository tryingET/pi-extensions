---
summary: "Plan for a bounded pi-vault-client maintenance slice: extract feedback/rating mutation helpers from src/vaultDb.ts into a dedicated seam without changing runtime behavior."
read_when:
  - "Refactoring src/vaultDb.ts after the template mutation/auth extraction."
  - "Separating feedback mutation logic from query/runtime assembly in pi-vault-client."
system4d:
  container: "Focused package maintenance plan for feedback/rating extraction."
  compass: "Reduce src/vaultDb.ts responsibility while preserving current feedback mutation behavior and contracts."
  engine: "Document scope -> extract feedback seam -> add/update focused tests -> validate package/release gates."
  fog: "Main risk is drifting exact execution-binding, receipt-visibility, or duplicate-feedback protections while moving code out of the runtime assembly module."
---

# Plan: vault feedback/rating seam

## Scope
- extract `rateTemplate(...)` and feedback-mutation helpers from `src/vaultDb.ts` into a dedicated helper module
- keep `src/vaultDb.ts` as the runtime assembly surface while delegating feedback mutation behavior to the new seam
- keep the public runtime behavior unchanged for:
  - `runtime.rateTemplate(...)`
  - exact `execution_id` validation
  - duplicate-feedback rejection
  - receipt-based visibility preservation for archived executions
  - forged receipt identity/version rejection
- add focused direct seam tests and update transpiled runtime harnesses that import `src/vaultDb.ts`

## Acceptance criteria
- `src/vaultDb.ts` no longer owns the low-level feedback/rating mutation implementation directly
- feedback mutation behavior stays unchanged, including:
  - explicit mutation company requirements
  - exact execution lookup
  - active-template visibility checks when no receipt snapshot is available
  - receipt identity/version validation when a receipt snapshot is provided
  - duplicate-feedback rejection and insert race protection
- focused tests cover the new feedback seam directly
- runtime-facing transpiled tests that import `src/vaultDb.ts` continue to pass with the new module dependency
- `npm run fix`, `npm run typecheck`, `npm run check`, and `npm run release:check` pass

## Non-goals
- no Prompt Vault schema changes
- no query/read behavior changes
- no execution logging redesign
- no tool-surface contract changes
- no broad `src/vaultDb.ts` rewrite beyond this feedback-mutation-focused extraction
