---
summary: "Plan for the next pi-vault-client maintenance slice: centralize cwd/env company inference and harden it against substring false positives."
read_when:
  - "Refactoring company-context resolution after the shared test harness cleanup."
  - "Adding focused adversarial tests around explicit company inference in pi-vault-client."
system4d:
  container: "Focused package maintenance plan for company-context resolution hardening."
  compass: "Reduce company-resolution fragility without widening into broader runtime architecture refactors."
  engine: "Document scope -> extract resolver -> add adversarial tests -> validate package and release gates."
  fog: "Main risk is breaking legitimate cwd-based company inference while trying to eliminate substring false positives."
---

# Plan: company-context hardening

## Scope
- extract cwd/env company-context resolution from `src/vaultDb.ts` into a dedicated helper module
- harden cwd inference so it matches exact path segments instead of arbitrary substrings
- add focused tests for precedence, anchored workspace detection, and false-positive avoidance
- keep the public runtime contract unchanged (`resolveCurrentCompanyContext(cwd?) -> { company, source }`)

## Acceptance criteria
- `src/vaultDb.ts` no longer owns the low-level cwd/env parsing logic directly
- cwd-based inference still resolves canonical package paths such as `.../ai-society/softwareco/...`
- cwd-based inference no longer false-matches paths like `.../notsoftwareco/...` or `.../softwareco-tools/...`
- explicit env precedence remains intact (`PI_COMPANY` before `VAULT_CURRENT_COMPANY` before cwd)
- `npm run fix`, `npm run typecheck`, `npm run check`, and `npm run release:check` pass

## Non-goals
- no Prompt Vault schema changes
- no tool/command surface redesign
- no large `src/vaultDb.ts` decomposition beyond this company-context seam
