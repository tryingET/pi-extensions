---
summary: "Session log for VRE-09 replay command/tool surface in pi-vault-client."
read_when:
  - "Starting the next session after replay surface landed."
  - "You need the exact delta between replay core and VRE-10 hardening/docs follow-up."
system4d:
  container: "Repo-local diary capture for VRE-09 replay surface delivery."
  compass: "Expose deterministic replay by execution_id without widening beyond the existing replay core contract."
  engine: "Read queue truth -> add slash command/tool surface -> validate operator-visible reports -> record next slice."
  fog: "Main risk is leaking hidden receipts across company boundaries or inventing replay semantics beyond match/drift/unavailable."
---

# 2026-03-12 — VRE-09 replay command/tool surface

## What changed
Implemented deterministic operator access to the already-landed replay core.

### New operator surface
- `/vault-replay <execution_id>` now opens a formatted replay report in the editor.
- `vault_replay({ execution_id })` now exposes the same replay report on the tool surface for headless use.
- both surfaces stay keyed to the exact local `execution_id`
- both surfaces preserve existing replay statuses and reasons from the replay core:
  - `match`
  - `drift`
  - `unavailable`
  - reasons such as `receipt-missing`, `template-missing`, `version-mismatch`, `render-mismatch`, `company-mismatch`, and `missing-input-contract`

### Safety/visibility behavior
- replay remains company-scoped on the operator surface
- receipts not visible to the current company are treated as missing instead of leaking template identity
- visible receipts replay under the caller's explicit company context, so cross-company replays surface the existing `company-mismatch` classification instead of silently switching companies

### Formatting/runtime details
- added a deterministic markdown replay formatter derived directly from the replay report contract
- report includes stored vs regenerated prepared-prompt snapshots and replay notes
- missing-receipt reports now preserve the caller company/source in the output instead of falling back to unknown

## Files changed materially
- `README.md`
- `docs/dev/vault-execution-receipts.md`
- `src/vaultCommands.ts`
- `src/vaultReceipts.ts`
- `src/vaultReplay.ts`
- `src/vaultTools.ts`
- `tests/vault-commands.test.mjs`
- `tests/vault-query-regression.test.mjs`
- `tests/vault-update.test.mjs`

## Validation run
```bash
npm run typecheck
node --test tests/vault-commands.test.mjs tests/vault-replay.test.mjs tests/vault-update.test.mjs tests/vault-query-regression.test.mjs
npm run check
PI_COMPANY=software pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p "Do not use bash or read. Call the custom tool named vault_replay exactly once with execution_id 0. If the tool call succeeds and returns text mentioning that execution_id must be a positive integer, reply with only SUCCESS. Otherwise reply with only FAILURE."
```

## Current truth after this session
- replay core is now operator-accessible through both interactive and headless surfaces
- non-visible receipts are hidden as missing on the replay surface
- receipt replay semantics remain unchanged; VRE-09 only exposed them deterministically

## Recommended next slice
Target **`VRE-10` — receipt/replay tests and operator docs**.

Good starting read order next session:
1. claimed AK task payload/body for `VRE-10`
2. `docs/dev/vault-execution-receipts.md`
3. this diary
4. `README.md`
5. `src/vaultReplay.ts`
6. `src/vaultCommands.ts`
7. `src/vaultTools.ts`
8. `tests/vault-commands.test.mjs`
9. `tests/vault-update.test.mjs`
10. `tests/vault-replay.test.mjs`
