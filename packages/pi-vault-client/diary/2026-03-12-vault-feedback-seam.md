---
summary: "Session log for the feedback/rating extraction slice in pi-vault-client after the template mutation/auth seam work."
read_when:
  - "Reviewing the maintenance slice that followed mutation/auth extraction in pi-vault-client."
  - "Understanding why feedback mutation helpers moved out of src/vaultDb.ts."
system4d:
  container: "Repo-local diary capture for a bounded vaultDb decomposition step."
  compass: "Reduce src/vaultDb.ts responsibility without changing feedback mutation behavior."
  engine: "Extract feedback seam -> add/update focused tests -> validate package/release gates -> record next follow-up."
  fog: "Main risk is drifting exact execution binding, receipt visibility reuse, or duplicate-feedback protection while moving code out of the runtime assembly file."
---

# 2026-03-12 — vault feedback/rating seam

## What changed
- extracted feedback/rating mutation logic into `src/vaultFeedback.ts`
- kept `src/vaultDb.ts` as the runtime assembly surface while delegating `rateTemplate(...)` to the new seam
- moved the following logic out of `src/vaultDb.ts`:
  - input validation for `execution_id` and `rating`
  - exact execution lookup
  - receipt identity/version/visibility validation for feedback writes
  - active-template visibility lookup when no receipt snapshot is available
  - duplicate-feedback detection and insert race protection
  - feedback insert SQL assembly and success message formatting
- added focused direct seam coverage in `tests/vault-feedback.test.mjs`
- updated transpiled runtime test harness file lists so `src/vaultDb.ts` imports continue to work under isolated test harnesses
- updated the architecture regression test to guard the new feedback seam instead of assuming feedback mutation logic still lives in `src/vaultDb.ts`
- updated `NEXT_SESSION_PROMPT.md` so future work touching `src/vaultDb.ts` or mutation resolution also reads this diary and the focused feedback tests
- updated `biome.jsonc` to ignore generated `src/vaultFeedback.js`

## Why
After company-context, schema, and template-mutation extractions, `src/vaultDb.ts` still mixed read/query assembly with feedback mutation behavior.
That left execution-bound feedback validation and duplicate-protection logic living beside unrelated query/runtime helpers.
This slice isolates the feedback mutation seam without changing operator-visible behavior.

## Validation run
```bash
npm run docs:list
npm run fix
node --test tests/vault-feedback.test.mjs tests/vault-mutations.test.mjs tests/vault-schema.test.mjs tests/company-context.test.mjs tests/vault-dolt-integration.test.mjs tests/vault-query-regression.test.mjs tests/vault-replay.test.mjs tests/vault-update.test.mjs
npm run typecheck
npm run check
npm run release:check
```

## Maintain review
Reviewed `src/vaultFeedback.ts` as the new seam introduced by this slice.
Decision: **keep as-is for now**.
Reason: the module stays coherent around one concern — execution-bound feedback mutation flow — and now has both direct seam coverage and runtime-level regression coverage.

## Recommended next slice
If continuing the `vaultDb` decomposition after this, the next best bounded step is likely separating execution logging helpers so `logExecution(...)` no longer lives in the same module as broad query/runtime assembly.
