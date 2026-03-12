---
summary: "Session log for the template mutation/auth extraction slice in pi-vault-client after the schema seam work."
read_when:
  - "Reviewing the maintenance slice that followed schema-compatibility extraction in pi-vault-client."
  - "Understanding why template mutation/auth helpers moved out of src/vaultDb.ts."
system4d:
  container: "Repo-local diary capture for a bounded vaultDb decomposition step."
  compass: "Reduce src/vaultDb.ts responsibility without changing template mutation behavior."
  engine: "Extract mutation seam -> add/update focused tests -> validate package/release gates -> record next follow-up."
  fog: "Main risk is drifting owner authorization or optimistic-lock behavior while moving template mutation logic out of the main runtime assembly file."
---

# 2026-03-12 — vault mutation/auth seam

## What changed
- extracted template mutation/auth helpers into `src/vaultMutations.ts`
- kept `src/vaultDb.ts` as the runtime assembly surface while delegating template insert/update behavior to the new seam
- moved the following logic out of `src/vaultDb.ts`:
  - mutation actor resolution
  - template-content validation
  - template update preparation/merge validation
  - owner authorization for insert/update
  - duplicate-name insert rejection
  - optimistic-lock update SQL assembly and stale-writer handling
- kept `rateTemplate(...)` in `src/vaultDb.ts` for now, since this slice was scoped to template mutation/auth rather than feedback mutation flow
- added focused direct seam coverage in `tests/vault-mutations.test.mjs`
- updated transpiled runtime test harness file lists so `src/vaultDb.ts` imports continue to work under isolated test harnesses
- updated the architecture regression test to guard the new mutation seam instead of assuming the helper bodies still live inside `src/vaultDb.ts`
- updated `NEXT_SESSION_PROMPT.md` so future work touching `src/vaultDb.ts` or mutation resolution also reads this diary and the focused mutation tests
- updated `biome.jsonc` to ignore generated `src/vaultMutations.js`

## Why
After company-context and schema extractions, `src/vaultDb.ts` still mixed read/query assembly with template mutation/auth logic.
That made owner checks and optimistic-lock update behavior live beside largely unrelated read/runtime paths.
This slice isolates the template mutation seam without changing operator-visible behavior.

## Validation run
```bash
npm run docs:list
npm run fix
node --test tests/vault-mutations.test.mjs tests/vault-schema.test.mjs tests/company-context.test.mjs tests/vault-dolt-integration.test.mjs tests/vault-query-regression.test.mjs tests/vault-replay.test.mjs tests/vault-update.test.mjs
npm run typecheck
npm run check
npm run release:check
```

## Maintain review
Reviewed `src/vaultMutations.ts` as the new seam introduced by this slice.
Decision: **keep as-is for now**.
Reason: the module is still coherent around one concern — template mutation/auth flow — and now has direct seam coverage plus runtime-level regression coverage.

## Recommended next slice
If continuing the `vaultDb` decomposition after this, the next best bounded step is likely separating feedback/rating mutation helpers from read/runtime assembly so `rateTemplate(...)` no longer sits in the same module as query/runtime helpers.
