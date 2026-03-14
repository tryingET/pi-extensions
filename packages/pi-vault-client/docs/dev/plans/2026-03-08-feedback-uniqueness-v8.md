---
summary: "Plan for closing the execution-bound feedback uniqueness gap via Prompt Vault schema v8 and client compatibility updates."
read_when:
  - "Implementing the remaining execution-feedback correctness item from pi-vault-client NEXT_SESSION_PROMPT.md"
system4d:
  container: "Cross-repo closeout plan spanning Prompt Vault schema and pi-vault-client compatibility."
  compass: "Land schema-level feedback uniqueness without reopening solved client-runtime ambiguity."
  engine: "Plan schema change -> align client expectation -> validate both repos."
  fog: "Main risks are schema/version drift and duplicate feedback semantics diverging across repos."
---

# Plan: feedback uniqueness via Prompt Vault schema v8

## Scope
Close the last correctness gap called out in `NEXT_SESSION_PROMPT.md` by enforcing **one feedback row per execution** at the Prompt Vault schema layer, then align `pi-vault-client` with the new schema version.

## Acceptance criteria
- Prompt Vault schema adds a DB-enforced uniqueness guarantee on `feedback.execution_id`.
- Prompt Vault migration path advances schema version from `7` to `8`.
- Prompt Vault CLI feedback path fails clearly on duplicate feedback attempts.
- Prompt Vault docs/tests reflect the new schema truth.
- `pi-vault-client` updates its schema expectation from `7` to `8` and keeps feedback semantics unchanged (`execution_id`-bound).
- `npm run check` passes in `packages/pi-vault-client`.
- Prompt Vault validation relevant to the schema change passes.

## Risks
- Schema migration could fail if any existing DB contains duplicate feedback rows.
- Prompt Vault/client docs could drift if version references are not updated together.
- Prompt Vault repo already has unrelated working-tree changes, so edits must stay tightly scoped.

## Planned files
### Prompt Vault
- `schema/schema.sql`
- `migrations/008_add_feedback_execution_uniqueness.sql`
- `scripts/pv-rate`
- `tests/pv-v2-facets.bats`
- `tests/pv-feedback.bats`
- `prompt-vault/docs/dev/status.md`
- `docs/dev/vault-client-relocation-interface.md`
- `docs/dev/vault-client-company-visibility-boundary.md`
- `next_session_prompt.md`

### pi-vault-client
- `README.md`
- `src/vaultTypes.ts`
- `src/vaultCommands.ts`
- `src/vaultTools.ts`
- `tests/vault-query-regression.test.mjs`
- `NEXT_SESSION_PROMPT.md`
