---
summary: "Session log for VRE-08 replay core and queue-truth cleanup in pi-vault-client."
read_when:
  - "Starting the next session after replay-core landed."
  - "You need the exact delta between receipt hardening and the upcoming replay surface slice."
system4d:
  container: "Repo-local diary capture for VRE-08 replay-core delivery."
  compass: "Preserve queue truth and replay-core implementation reality before the operator surface lands."
  engine: "State stale-queue cleanup -> state replay-core changes -> state validation -> state next slice."
  fog: "Main risk is forgetting that VRE-02 through VRE-08 are now already satisfied and reopening internal replay logic instead of adding the surface cleanly."
---

# 2026-03-12 — VRE-08 replay core and queue cleanup

## Queue truth repaired first
Fresh AK truth still showed `VRE-02` through `VRE-07` as pending even though the runtime already contained that work.
This session verified the landed implementation and completed the stale AK entries for:

- `VRE-02`
- `VRE-03`
- `VRE-04`
- `VRE-05`
- `VRE-06`
- `VRE-07`

Those completions were backed by fresh `npm run typecheck` / `npm run check` evidence and the already-landed runtime commit `b611286f350e20c3a8af7c71171e8a53766097f6`.

## What changed for VRE-08
Implemented replay core for local receipt replay by `execution_id`.

### New core behavior
- Replay now loads a local receipt by `execution_id`.
- Replay resolves current template state under the recorded company context.
- Replay regenerates prepared prompts for all current replay-safe input kinds:
  - `vault-selection`
  - `route-request`
  - `grounding-request`
- Replay compares regenerated prompt text and sha256 against the stored prepared baseline.
- Replay classifies:
  - `match`
  - `drift`
  - `unavailable`
- Replay reasons now include at minimum:
  - `template-missing`
  - `version-mismatch`
  - `render-mismatch`
  - `company-mismatch`
  - `missing-input-contract`

### Important implementation detail
Grounding replay does **not** rediscover frameworks opportunistically.
It reuses the stored `framework_resolution.selected_names` snapshot so replay stays faithful to the original receipt provenance.

## Files changed materially
- `src/vaultReplay.ts`
- `src/vaultRoute.ts`
- `src/vaultGrounding.ts`
- `src/vaultCommands.ts`
- `src/vaultTypes.ts`
- `tests/vault-replay.test.mjs`
- `tests/vault-commands.test.mjs`
- `README.md`
- `docs/dev/vault-execution-receipts.md`
- `docs/dev/plans/2026-03-12-vre-08-replay-core.md`
- `next_session_prompt.md`

## Validation run
Focused proof before the full package gate:

```bash
npm run typecheck
node --test tests/vault-replay.test.mjs
node --test tests/vault-commands.test.mjs
node --test tests/vault-grounding.test.mjs
npm run check
```

## Current truth after this session
- Replay core exists, but there is still **no operator-facing replay command/tool surface**.
- Route replay uses the same route-wrapper shape as the current `/route` execution paths.
- Grounding replay is pinned to stored framework selections rather than fresh discovery.
- Queue truth is materially better: `VRE-02` through `VRE-08` should no longer be treated as open implementation work.

## Recommended next slice
Target **`VRE-09` — replay command/tool surface**.

Good starting read order next session:
1. claimed AK task payload/body for `VRE-09`
2. `docs/dev/vault-execution-receipts.md`
3. this diary
4. `README.md`
5. `src/vaultReplay.ts`
6. `src/vaultRoute.ts`
7. `src/vaultGrounding.ts`
8. `src/vaultCommands.ts`
9. `src/vaultTools.ts`
10. `tests/vault-replay.test.mjs`

## Suggested first move next session
Expose the replay core through a deterministic operator surface without widening into analytics/dashboard work.
Likely shape:
- slash command for exact `execution_id`
- tool surface for headless replay by `execution_id`
- formatted replay report that preserves the current classification contract
