---
summary: "Session log for receipt hardening after deep adversarial review of pi-vault-client."
read_when:
  - "Starting the next session on receipts/replay in pi-vault-client."
  - "You need the most recent implementation delta beyond README.md and docs/dev/vault-execution-receipts.md."
system4d:
  container: "Repo-local diary capture for the receipt hardening session."
  compass: "Preserve exact implementation truth so the next session starts from reality instead of memory."
  engine: "State what changed -> state what was verified -> state what remains open -> point at the next slice."
  fog: "Main risk is re-litigating already-fixed receipt identity bugs or forgetting the remaining architectural gap."
---

# 2026-03-12 — Receipt hardening after deep review

## What changed
Implemented and verified the highest-leverage hardening pass for local execution receipts.

### Completed backlog-equivalent work now present in runtime
- VRE-02 style receipt types/contracts are live in `src/vaultTypes.ts`
- VRE-03 style local JSONL sink/read helpers are live in `src/vaultReceipts.ts`
- VRE-04 style execution binding is live: `logExecution()` returns execution metadata including `executionId`
- VRE-05 style primary-surface receipt emission is live for:
  - `/vault`
  - live `/vault:`
- VRE-06 style secondary-surface receipt emission is live for:
  - `/route`
  - grounding / `next-10-expert-suggestions`
- VRE-07 style inspection commands are live:
  - `/vault-last-receipt`
  - `/vault-receipt <execution_id>`

### Hardening done in this session
- Replaced raw prepared-prompt text matching with an opaque hidden execution marker
  - marker is attached to prepared text on vault execution surfaces
  - marker is stripped back out in the `context` hook before the LLM sees user messages
- Receipt finalization now binds by execution token rather than coincidental prompt-text equality
- Receipt snapshots now record `edited_after_prepare`
- Receipt readers now ignore malformed JSONL lines instead of crashing
- Receipt inspection commands are company-scoped and fail closed outside visibility
- `vault_rate()` now cross-checks receipt template identity/version against the real execution row
- `vault_executions` no longer forces receipt-backed rows to display `success=true`; receipt-only rows now show `unknown` until DB truth is available

## Files changed materially
- `src/vaultTypes.ts`
- `src/vaultReceipts.ts`
- `src/vaultCommands.ts`
- `src/vaultPicker.ts`
- `src/vaultDb.ts`
- `src/vaultTools.ts`
- `README.md`
- `docs/dev/vault-execution-receipts.md`
- tests:
  - `tests/vault-receipts.test.mjs`
  - `tests/vault-commands.test.mjs`
  - `tests/vault-dolt-integration.test.mjs`
  - `tests/vault-query-regression.test.mjs`

## Verification run
From package root:

```bash
npm run docs:list
npm test
```

Latest result at handoff:
- `npm test` passed
- `99/99` tests passing
- prepack/tarball path also passed via package check

## Important current truth
- Opening a template in the editor does **not** log an execution by itself.
- Execution rows are written only when the prepared prompt is sent as a real user message.
- Correlation now depends on an opaque marker, not raw prompt equality.
- The marker is intentionally invisible-to-LLM via stripping in the `context` hook.
- Receipt inspection is local + company-scoped, not globally open.

## Still open / not solved
- Replay is still not implemented.
- DB execution rows still log `success=true` at dispatch time rather than post-run outcome truth.
- Receipt storage is still local JSONL under a user-global path; it is not yet session-partitioned.
- Prompt history in Prompt Vault is still mutable in-place; the client layer is more historical than the DB layer.
- `prompt_eval` still uses placeholder scoring and needs a real judging path.

## Recommended next slice
Target **VRE-08 — replay core and drift classification** unless fresh AK truth says otherwise.

Best starting read order:
1. claimed AK task payload/body for `VRE-08`
2. `docs/dev/vault-execution-receipts.md`
3. `README.md`
4. `src/vaultTypes.ts`
5. `src/vaultReceipts.ts`
6. `src/vaultDb.ts`
7. `src/vaultCommands.ts`
8. `tests/vault-receipts.test.mjs`
9. `tests/vault-dolt-integration.test.mjs`

## Suggested first move next session
Do fresh truth reconstruction, then implement deterministic replay by `execution_id` with statuses:
- `match`
- `drift`
- `unavailable`

Minimum drift reasons to keep explicit:
- `template-missing`
- `version-mismatch`
- `render-mismatch`
- `company-mismatch`
- `missing-input-contract`
