---
summary: "Post-migration audit of pi-vault-client against the current monorepo package template."
read_when:
  - "Auditing package drift after the standalone-to-monorepo migration."
  - "Deciding whether remaining deltas are intentional or should be folded back into the template."
system4d:
  container: "Package-vs-template drift audit."
  compass: "Keep intentional product deltas while removing accidental standalone-era drift."
  engine: "Compare against template scaffold -> classify deltas -> normalize docs/metadata where helpful."
  fog: "The main risk is treating all differences as debt when some are the actual product implementation."
---

# pi-vault-client template drift audit

## Baseline

Compared against:
- `~/ai-society/softwareco/owned/pi-extensions-template/copier-template-monorepo-package/`

## Intentional deltas to keep

These are product implementation, not scaffold drift:
- `src/evaluator.ts`
- `src/fuzzySelector.js`
- `src/pi-runtime.d.ts`
- `src/vaultCandidateAdapter.js`
- `src/vaultCommands.ts`
- `src/vaultDb.ts`
- `src/vaultGrounding.ts`
- `src/vaultPicker.ts`
- `src/vaultTools.ts`
- `src/vaultTypes.ts`
- `tests/fuzzy-selector.test.mjs`
- `tests/inline-selector-verify.mjs`
- `tests/vault-candidate-adapter.test.mjs`
- `tests/vault-query-regression.test.mjs`
- `docs/dev/prompt-vault-v2-relocation-handoff.md`

## Normalized during audit

These were updated to fit monorepo-package reality better:
- `README.md`
- `NEXT_SESSION_PROMPT.md`
- `docs/dev/trusted_publishing.md`

## Remaining deliberate differences from bare scaffold

- `package.json` keeps package name `pi-vault-client` per canonical migration target rather than the template's scoped default naming convention.
- package depends on shared monorepo helper packages:
  - `@tryinget/pi-trigger-adapter`
  - `@tryinget/pi-interaction-kit`
- package currently ships `src/` in published files because runtime implementation lives there.

## Follow-up questions

1. Should the template eventually support an optional `src` publish whitelist entry for code-heavy packages like this one?
2. Should monorepo package scaffolds optionally include a package-local `tsconfig.json` baseline again?
3. Should package naming policy stay flexible enough to allow unscoped canonical names such as `pi-vault-client`?
