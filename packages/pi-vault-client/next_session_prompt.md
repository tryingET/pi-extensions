---
summary: "Executable next-session launcher for pi-vault-client: reconstruct truth from commands, start from the post-VRE baseline, and execute the next ready AK task without reopening already-landed receipt/replay work unless validation proves regression."
read_when:
  - "Starting the next focused session in packages/pi-vault-client."
  - "Using @next_session_prompt.md as the launcher prompt instead of a passive handoff note."
system4d:
  container: "Command-first launcher for the next ready pi-vault-client task after the VRE backlog closure."
  compass: "Prefer regenerated truth over stale prose, keep work task-local, and treat the receipt/replay backlog as landed baseline rather than open implementation work."
  engine: "Reconstruct truth -> choose ready task -> select vault framework -> execute -> validate -> review -> revalidate -> commit -> record evidence -> complete task."
  fog: "Main risks are trusting stale queue/session state, reopening VRE-02..10 without fresh evidence, or widening a local package task into unrelated Prompt Vault or AK changes."
---

# next_session_prompt.md

## EXECUTION CONTRACT

Treat this file as **executable instructions**, not reference notes.

After reading this file:
1. Do **not** stop at summary.
2. Reconstruct current truth using the commands below.
3. Start the workflow immediately.
4. Continue until the selected task is completed and validated, or until you hit a real blocker.
5. If blocked, stop and report the exact blocker, rollback path, and next safe step.

## FRAMEWORK SELECTION RULE

Use Prompt Vault (`~/ai-society/core/prompt-vault`) like trigger folders.

1. Select the single best-matching template for the current task.
   - `vault_query(..., include_content:false)`
2. Retrieve that template's full content.
   - `vault_retrieve(..., include_content:true)`
3. Execute it as written.
4. If the template has an OUTPUT FORMAT, follow it exactly.
5. Do not reference unretrieved frameworks.
6. If vault is unavailable, continue best-effort and say so.

Use as many frameworks as necessary, and as few as possible.

Grounding line at end:
`grounding: template=<name>, vault_status=<ok|unavailable>`

## DURABLE OBJECTIVE

Advance `pi-vault-client` by executing the **next ready Agent Kernel task for this repo**.

There is **no pinned next slice in this file anymore**.
Fresh AK truth is authoritative.

## POST-VRE BASELINE

Treat the Vault Execution Receipts / Replay backlog as landed baseline, not open implementation work.

Already-landed runtime surface includes:
- receipt types/contracts
- local JSONL receipt sink + read helpers
- send-time execution binding via `executionId`
- receipt emission for `/vault`, live `/vault:`, `/route`, and grounding
- receipt inspection surfaces:
  - `/vault-last-receipt`
  - `/vault-receipt <execution_id>`
- replay core:
  - receipt load by exact `execution_id`
  - replay regeneration for `vault-selection`, `route-request`, and `grounding-request`
  - `match` / `drift` / `unavailable` classification
  - stored grounding framework-resolution reuse during replay
- replay operator surfaces:
  - `/vault-replay <execution_id>`
  - `vault_replay({ execution_id })`
- docs/test hardening for the exact-id replay workflow, replay reporting, and non-visible-as-missing behavior

Do **not** reopen `VRE-02` through `VRE-10` unless fresh validation proves a regression.
If AK still presents one of those tasks as ready, verify whether queue state is stale before re-implementing anything.

## RECONSTRUCT TRUTH

### 1. Package truth
From `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`:

```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run docs:list
npm run typecheck
npm run check
git status --short
```

### 2. Package context truth
Read at minimum:
1. `README.md`
2. `docs/dev/vault-execution-receipts.md`
3. `diary/2026-03-12-vre-10-docs-tests.md`
4. `diary/2026-03-12-vre-09-replay-surface.md`
5. `diary/2026-03-12-vre-08-replay-core.md`
6. `next_session_prompt.md`

If the ready task touches a different subsystem more directly, add the most relevant docs/source/tests for that subsystem before editing.

If the task touches `src/vaultDb.ts` or company/schema/mutation resolution, also read:
- `diary/2026-03-12-company-context-hardening.md`
- `diary/2026-03-12-vault-schema-seam.md`
- `diary/2026-03-12-vault-mutation-seam.md`
- `diary/2026-03-12-vault-feedback-seam.md`
- `tests/company-context.test.mjs`
- `tests/vault-schema.test.mjs`
- `tests/vault-mutations.test.mjs`
- `tests/vault-feedback.test.mjs`

If the ready task touches the active prompt-plane seam / continuation-contract wave, also read:
- `docs/project/2026-04-09-rfc-non-ui-prompt-plane-and-continuation-contract.md`
- `~/ai-society/softwareco/owned/pi-extensions/docs/project/2026-04-09-contract-first-wave-kes-loops-vault-seam.md`
- `~/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator/docs/adr/2026-03-11-control-plane-boundaries.md`

If continuing the bounded `src/vaultDb.ts` decomposition after the feedback seam, prefer separating execution logging helpers next rather than widening query behavior.

### 3. AK queue truth
From `~/ai-society/softwareco/owned/agent-kernel`:

```bash
cd ~/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2
./scripts/ak-v2.sh task release-expired
./scripts/ak-v2.sh task ready -F json
```

### 4. Interpret truth
Apply these rules strictly:
- If a `pi-vault-client` task is ready, follow AK truth and execute the highest-priority ready task for this repo.
- If no `pi-vault-client` task is ready, identify the blocker or empty queue state and stop.
- Do **not** trust previous session prose over fresh command output.
- Do **not** reopen completed VRE backlog work unless fresh tests/docs/runtime evidence show drift or regression.

## EXECUTE THE READY TASK

### 1. Claim the task
Example shape:

```bash
cd ~/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2
./scripts/ak-v2.sh task claim <task-id> --agent pi-vault-worker --lease 3600
```

### 2. Read the claimed AK task payload and immediate inputs
After claiming the task, retrieve the full task payload from AK using the supported verbose list command and filter to the claimed task id:

```bash
cd ~/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2
./scripts/ak-v2.sh task list -F json --verbose
```

Use the claimed task row as the canonical task payload.
If the current AK runtime cannot expose the claimed task's detailed payload truthfully, stop and report that blocker instead of reconstructing it from stale repo docs.

### 3. Run the task loop
For the selected task:
1. select the best Prompt Vault template
2. retrieve it
3. execute it as written
4. implement the smallest coherent task-complete slice
5. validate
6. deep-review
7. apply the single highest-leverage improvement
8. revalidate
9. commit only task-local files
10. record AK evidence
11. complete the task

## VALIDATION

Default validation commands:

```bash
npm run typecheck
npm run check
```

Add focused proof whenever the task changes a specific operator/runtime contract.
Examples:
- targeted `node --test ...` invocations for touched tests
- `npm run release:check` for packaging/release-surface changes
- headless `pi --no-extensions -e ... -p ...` smoke when command/tool behavior changes

## AK EVIDENCE SHAPE

Suggested evidence types:
- `planning:task-spec`
- `review:deep`
- `review:nexus`
- `review:atomic-completion`
- `validation:typecheck`
- `validation:package`
- `validation:headless-smoke`
- `commit:created`

Complete the claimed task only after validations pass and the change is isolated.

## TRANSCENDENCE ESCALATION RULE

Use **TRANSCENDENT ITERATION (v2)** only if the normal loop stops compounding.

### Trigger transcendence mode when any kill criterion becomes true
1. **Rewrite loop** — 3 rewrites without deleting assumptions
2. **Explanation burden** — the change needs a 20+ minute explanation
3. **Aesthetics over outcomes** — polishing structure instead of improving results
4. **No deletion** — adding without subtracting
5. **Compound failure** — each iteration makes the next one harder

### If triggered
Switch modes and redesign the workflow/problem itself:
1. **DIAGNOSE**
   - limiting assumption
   - 100x precondition
   - avoided ugliness
2. **FIRST 100x**
   - delete more than add
3. **SECOND 100x**
   - check whether the first pass made the second easier or harder
4. **DISSOLVE / REBUILD**
   - rebuild from first principles
5. **NAME DEBT**
   - write residual debt explicitly

Return to the normal execution loop only after the simpler workflow is clear.

## STOP CONDITIONS

Stop and report instead of improvising when:
- a privacy/persistence/policy decision is required
- a Prompt Vault schema change becomes necessary
- work must spill outside this package beyond clearly local docs/tests/runtime boundaries
- the ready task cannot be isolated cleanly for commit
- runtime/tooling needed for truthful execution is unavailable

## ROUTING RULE

- **vault client package behavior, receipt/replay docs/tests, command/tool surfaces, package-local validation, queue-driving prompts**
  - stay here in `pi-vault-client`
- **shared interaction package architecture / published package contract drift**
  - go to `../pi-interaction`
- **Prompt Vault schema/contracts/data changes**
  - go to `~/ai-society/core/prompt-vault`
- **AK CLI/runtime changes**
  - go to `~/ai-society/softwareco/owned/agent-kernel`
- **PTX behavior**
  - go to `../pi-prompt-template-accelerator`

## SUCCESS CONDITION

A successful session:
1. reconstructs truth from commands
2. executes the next ready repo task
3. keeps `npm run typecheck` green
4. keeps `npm run check` green
5. records truthful AK evidence
6. completes the task or stops with an exact blocker
7. leaves the queue, docs, and operator surface in a more truthful state than it found them
