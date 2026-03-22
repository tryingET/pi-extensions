---
summary: "Session log for AK task #229: close the remaining live /vault: rate-limit validation follow-through after the schema-v9 cutover by tightening package source-of-truth docs and proving the current canary lane still passes."
read_when:
  - "Reviewing why AK task #229 was completed after the debounce/runtime work had already landed."
  - "Looking for the current validation path for the live /vault: shared-trigger seam."
system4d:
  container: "Repo-local diary capture for the live /vault: validation follow-through slice."
  compass: "Prefer truthful source-of-truth updates over reopening already-landed runtime work."
  engine: "Reconstruct queue truth -> verify landed debounce/canary state -> tighten docs -> validate -> complete task."
  fog: "Main risk is re-implementing already-landed live-trigger behavior instead of documenting and validating the actual operator path."
---

# 2026-03-22 — live `/vault:` rate-limit validation follow-through

## Queue truth first
Fresh AK truth exposed task `#229` for the monorepo root:

- `Finish remaining live /vault: rate-limiting and validation follow-through after Prompt Vault schema-v9 cutover`

Current package/runtime truth showed that the actual debounce/runtime work was already landed earlier in commit `1fcb3252e87f75b6e73133f7a713c3bdb2c6f979`:

- `LIVE_VAULT_TRIGGER_DEBOUNCE_MS = 150`
- broker-driven live-trigger contract test exists in `tests/vault-live-trigger-contract.test.mjs`
- package script exists: `npm run test:compat:live-trigger-contract`
- root-owned compatibility canary already carries scenario `vault-live-trigger-contract`

That meant the remaining truthful slice was **validation/source-of-truth follow-through**, not another runtime change.

## What changed
- `README.md`
  - package checks now point directly at `npm run test:compat:live-trigger-contract`
  - isolated validation guidance now points at both the package-local live-trigger contract lane and the root-owned `vault-live-trigger-contract` compatibility canary scenario
- `docs/dev/v9-cutover.md`
  - validation section now treats the live `/vault:` seam as a first-class cutover proof path
  - explicitly names the protected surfaces: shared broker, registration, `150ms` debounce/rate-limiting, bare `/vault:` query prompt, and picker fallback
  - verified fast-path outcome now includes both the package-local contract test and the root-owned canary scenario
- `CHANGELOG.md`
  - records that the docs now point operators to the focused live-trigger validation/canary path

## Validation run
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run test:compat:live-trigger-contract
npm run typecheck
npm run check

cd ~/ai-society/softwareco/owned/pi-extensions
npm run compat:canary -- --profile current --scenario vault-live-trigger-contract
```

## Review note
No runtime/code-path refactor was needed.
The highest-leverage improvement was to tighten the operator-visible source of truth so future sessions do not reopen the debounce task as if it were still missing.

## Current truth after this session
- task `#229` should be treated as complete after fresh validation
- live `/vault:` rate limiting remains the existing `150ms` debounce contract
- the canonical focused validation path is `npm run test:compat:live-trigger-contract`
- the canonical monorepo-host canary path is `npm run compat:canary -- --profile current --scenario vault-live-trigger-contract`
- the schema-v9 cutover doc now names both validation lanes explicitly
