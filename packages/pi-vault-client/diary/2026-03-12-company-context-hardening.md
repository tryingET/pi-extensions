---
summary: "Session log for company-context resolution hardening after the shared test harness cleanup in pi-vault-client."
read_when:
  - "Reviewing the maintenance slice that followed the shared test harness refactor."
  - "Understanding why cwd-based company inference moved out of src/vaultDb.ts."
system4d:
  container: "Repo-local diary capture for focused company-context maintenance work."
  compass: "Make cwd/env company inference less fragile without widening into a broad vaultDb rewrite."
  engine: "Extract resolver -> add adversarial tests -> validate package/release gates -> record next follow-up."
  fog: "Main risk is breaking legitimate cwd-based company detection while eliminating substring false positives."
---

# 2026-03-12 — company-context hardening

## What changed
- extracted cwd/env company resolution into `src/companyContext.ts`
- kept the runtime contract stable through `runtime.resolveCurrentCompanyContext(cwd?)`
- changed cwd inference from arbitrary substring matching to exact path-segment matching
- gave canonical `ai-society/<company>/...` anchoring priority when present
- added support for exact `software` and `softwareco` path segments mapping to company `software`
- added focused tests for:
  - env precedence
  - `ai-society` anchor preference
  - Windows-style path separators
  - substring false-positive avoidance
- updated the architecture regression test to guard the new seam
- documented the cwd-inference nuance briefly in `README.md`

## Why
The previous implementation lived inline in `src/vaultDb.ts` and relied on checks such as `normalizedCwd.includes("/softwareco/")`.
That was easy to understand but too permissive: paths like `/tmp/notsoftwareco/project` or `/tmp/softwareco-tools/project` could drift into accidental matches if similar patterns accumulated.

This slice keeps cwd inference useful while making it more explicit and more testable.

## Validation run
```bash
npm run docs:list
npm run fix
node --test tests/company-context.test.mjs tests/vault-dolt-integration.test.mjs tests/vault-query-regression.test.mjs tests/vault-replay.test.mjs tests/vault-update.test.mjs
npm run typecheck
npm run check
npm run release:check
```

## Maintain review
Reviewed `src/companyContext.ts` as the new seam introduced by this slice.
Decision: **keep as-is for now**.
Reason: it is small, purpose-built, and already injects `env` / `processCwd` for deterministic tests without dragging more runtime dependencies into the contract.

## Recommended next slice
If continuing maintenance after this, the next best refactor is likely a further decomposition of `src/vaultDb.ts` into smaller read/mutation/schema modules now that company-context resolution is no longer embedded there.
