---
summary: "Session log for the schema-compatibility extraction slice in pi-vault-client after company-context hardening."
read_when:
  - "Reviewing the maintenance slice that followed company-context hardening in pi-vault-client."
  - "Understanding why schema compatibility moved out of src/vaultDb.ts."
system4d:
  container: "Repo-local diary capture for a bounded vaultDb decomposition step."
  compass: "Reduce src/vaultDb.ts responsibility without changing Prompt Vault compatibility behavior."
  engine: "Extract schema seam -> add focused tests -> update runtime harnesses -> validate package/release gates -> record next follow-up."
  fog: "Main risk is drifting the schema-report contract or forgetting to include the new helper in transpiled runtime tests."
---

# 2026-03-12 — vault schema compatibility seam

## What changed
- extracted schema compatibility constants and report assembly into `src/vaultSchema.ts`
- kept `runtime.checkSchemaCompatibilityDetailed()` and `runtime.checkSchemaVersion()` stable by delegating from `src/vaultDb.ts`
- added focused unit coverage in `tests/vault-schema.test.mjs`
- updated the architecture regression test to guard the new seam instead of assuming the full schema logic stays embedded in `src/vaultDb.ts`
- updated transpiled runtime test harness file lists so tests importing `src/vaultDb.ts` also include `src/vaultSchema.ts`
- updated `biome.jsonc` to ignore generated `src/vaultSchema.js`

## Why
`src/vaultDb.ts` was still carrying schema compatibility bookkeeping even after company-context extraction.
That code is small but conceptually separate from query, mutation, and execution logic.
Moving it behind a dedicated seam makes the next bounded `vaultDb` decomposition step simpler without changing operator-visible behavior.

## Validation run
```bash
npm run docs:list
npm run fix
node --test tests/vault-schema.test.mjs tests/company-context.test.mjs tests/vault-dolt-integration.test.mjs tests/vault-query-regression.test.mjs tests/vault-replay.test.mjs tests/vault-update.test.mjs
npm run typecheck
npm run check
npm run release:check
```

## Maintain review
Reviewed `src/vaultSchema.ts` as the new seam introduced by this slice.
Decision: **keep as-is for now**.
Reason: the module is purpose-built, pure except for the injected query function, and now has direct focused tests for both match and mismatch cases.

## Recommended next slice
If continuing the `vaultDb` decomposition, the next best bounded step is likely separating mutation/auth helpers from the main query/runtime assembly path so owner checks and optimistic-lock update logic stop living in the same module as read/query code.
