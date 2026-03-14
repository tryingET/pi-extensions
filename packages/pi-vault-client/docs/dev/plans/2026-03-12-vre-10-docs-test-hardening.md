---
summary: "Plan for VRE-10 in pi-vault-client: harden receipt/replay operator docs and focused reporting/visibility tests without changing replay semantics."
read_when:
  - "Executing VRE-10 from the receipts/replay backlog."
  - "Before widening receipt/replay work beyond already-landed runtime behavior."
system4d:
  container: "Focused package plan for receipt/replay docs and proof hardening."
  compass: "Document the current execution_id-keyed operator workflow truthfully and add proof around replay reporting and visibility boundaries without inventing new semantics."
  engine: "Capture acceptance criteria -> update operator docs -> add focused replay/report tests -> validate -> update handoff artifacts."
  fog: "Main risks are drifting docs away from the current runtime, weakening the non-visible-as-missing boundary, or widening into fresh replay feature work."
---

# Plan: VRE-10 receipt/replay docs and test hardening

## Scope
Complete the receipts/replay backlog by hardening operator-facing docs and focused tests around the already-landed receipt inspection and replay surfaces in `pi-vault-client`.

## Acceptance criteria
- README and `docs/dev/vault-execution-receipts.md` describe the current exact-`execution_id` workflow truthfully.
- Docs explain both interactive and headless replay surfaces:
  - `/vault-last-receipt`
  - `/vault-receipt <execution_id>`
  - `/vault-replay <execution_id>`
  - `vault_replay({ execution_id })`
- Docs state the current visibility/fail-closed behavior clearly:
  - explicit company context is required
  - non-visible receipts are treated as missing
  - replay remains keyed to an exact `execution_id`
- Focused tests prove operator-visible replay reporting for:
  - `match`
  - `drift`
  - `unavailable`
- Focused tests preserve the visibility boundary on the replay surface for interactive and headless use.
- `npm run typecheck` and `npm run check` pass.

## Non-goals
- no new replay statuses or reasons
- no new Prompt Vault schema work
- no analytics/dashboard work
- no transcript/model-output capture
- no replay-core redesign unless validation proves a regression

## Planned files
- `README.md`
- `docs/dev/vault-execution-receipts.md`
- `docs/dev/plans/2026-03-12-vre-10-docs-test-hardening.md`
- `diary/2026-03-12-vre-10-docs-tests.md`
- `NEXT_SESSION_PROMPT.md`
- `tests/vault-replay.test.mjs`
- `tests/vault-commands.test.mjs`
