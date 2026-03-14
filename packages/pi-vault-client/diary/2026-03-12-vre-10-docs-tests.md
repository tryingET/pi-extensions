---
summary: "Session log for VRE-10 receipt/replay docs and test hardening in pi-vault-client."
read_when:
  - "Starting work after the receipts/replay backlog closure."
  - "You need the exact docs/tests delta that completed VRE-10."
system4d:
  container: "Repo-local diary capture for the final receipts/replay hardening slice."
  compass: "Document the current exact-id operator workflow truthfully and add proof without widening replay semantics."
  engine: "Read queue truth -> harden operator docs -> add focused replay reporting/visibility tests -> validate -> update handoff."
  fog: "Main risk is saying the replay surface does more than it actually does, or weakening the non-visible-as-missing boundary while chasing coverage."
---

# 2026-03-12 — VRE-10 receipt/replay docs and tests

## What changed
Completed the final planned receipts/replay slice by tightening operator docs and adding focused proof around the already-landed replay surface.

### Operator docs
- `README.md` now has a dedicated **Receipt and replay operator workflow** section.
- README live-validation docs now include a headless replay-boundary smoke keyed to an exact `execution_id`.
- `docs/dev/vault-execution-receipts.md` now documents the current exact-id workflow explicitly:
  - obtain an `execution_id`
  - inspect with `/vault-receipt <execution_id>`
  - replay with `/vault-replay <execution_id>` or `vault_replay({ execution_id })`
- docs now state the current visibility/fail-closed truth clearly:
  - explicit company context is required
  - non-visible receipts are treated as missing
  - interactive slash commands warn and stop
  - the headless tool surface returns `unavailable` / `receipt-missing`

### Focused proof added
- `tests/vault-replay.test.mjs`
  - added operator-facing replay-report coverage for a controlled `drift` case, including recorded/current version details in the formatted report
  - added missing-receipt report coverage proving current company/source are preserved without template leakage
- `tests/vault-commands.test.mjs`
  - added interactive replay proof that non-visible receipts are treated as missing in the current company context

## Validation run
```bash
npm run docs:list
node --test tests/vault-replay.test.mjs tests/vault-commands.test.mjs tests/vault-update.test.mjs tests/vault-query-regression.test.mjs
npm run typecheck
npm run check
npm run release:check
PI_COMPANY=software pi --no-extensions -e /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client -p "Do not use bash or read. Call the custom tool named vault_replay exactly once with execution_id 999999. If the tool call succeeds and returns text mentioning both 'status: unavailable' and 'receipt-missing', reply with only SUCCESS. Otherwise reply with only FAILURE."
```

## Maintain review
Reviewed `tests/vault-replay.test.mjs` as the most central touched file.
Decision: **keep as-is for now**.
Reason: the new report-format and missing-receipt assertions stay adjacent to the existing replay-core scenarios, so the file is still coherent and the new coverage does not justify a helper/refactor split yet.

## Current truth after this session
- VRE-10 is complete.
- The receipts/replay backlog for `pi-vault-client` is now closed through docs/tests.
- The operator workflow is explicitly documented around exact `execution_id` usage.
- Replay coverage now proves:
  - `match`
  - `drift`
  - `unavailable`
  - non-visible-as-missing behavior on interactive and headless surfaces
- `NEXT_SESSION_PROMPT.md` now points future sessions at fresh AK truth instead of another pinned VRE slice.

## Recommended next slice
Do **not** assume another receipts/replay task exists.
Start from fresh AK queue truth and execute the next ready `pi-vault-client` task only if one exists.
