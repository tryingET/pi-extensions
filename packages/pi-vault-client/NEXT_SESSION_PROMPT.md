---
summary: "Executable next-session launcher for pi-vault-client: reconstruct truth from commands, execute the next ready receipts/replay task, and escalate into transcendence mode only if the normal loop stops compounding."
read_when:
  - "Starting the next focused session in packages/pi-vault-client."
  - "Using @NEXT_SESSION_PROMPT.md as the launcher prompt instead of a passive handoff note."
system4d:
  container: "Command-first launcher for the next receipts/replay slice in pi-vault-client."
  compass: "Prefer regenerated truth over stale state, keep work task-local, and advance the queue one ready task at a time."
  engine: "Reconstruct truth -> choose ready task -> select vault framework -> execute -> validate -> review -> revalidate -> commit -> record evidence -> complete task."
  fog: "Main risks are trusting stale session state, stopping at summary instead of execution, or widening scope when the loop should either stay local or explicitly escalate."
---

# NEXT_SESSION_PROMPT.md

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

Advance the Vault Execution Receipts / Replay backlog for `pi-vault-client` by executing the **next ready VRE task** for this repo.

Current intended next slice: `VRE-01` (`docs/dev/vault-execution-receipts.md`), **unless fresh AK truth says otherwise**.

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

### 2. AK queue truth
From `~/ai-society/softwareco/owned/agent-kernel`:

```bash
cd ~/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2
./scripts/ak-v2.sh task release-expired
./scripts/ak-v2.sh task ready -F json
```

### 3. Interpret truth
Apply these rules strictly:
- If `[VRE-01]` is the next ready repo task, claim and execute it.
- If another `pi-vault-client` repo task is ready first, follow AK truth instead of this file's last-known intent.
- If no `pi-vault-client` task is ready, identify the blocker and stop.
- Do **not** trust previous session prose over fresh command output.

## EXECUTE THE READY TASK

### 1. Claim the task
Example for `VRE-01`:

```bash
cd ~/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2
./scripts/ak-v2.sh task claim 30 --agent pi-vault-worker --lease 3600
```

### 2. Read the task anchor and immediate inputs
If executing `VRE-01`, read at minimum:
1. `docs/dev/plans/vault-receipts-ak-backlog.md#vre-01`
2. `src/vaultDb.ts`
3. `src/vaultTypes.ts`
4. `README.md`
5. `docs/dev/status.md`

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

## AK EVIDENCE SHAPE

Suggested evidence types:
- `planning:task-spec`
- `review:deep`
- `review:nexus`
- `review:atomic-completion`
- `validation:typecheck`
- `validation:package`
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
- work must spill outside this package beyond clearly local docs/tests
- the ready task cannot be isolated cleanly for commit
- runtime/tooling needed for truthful execution is unavailable

## ROUTING RULE

- **receipts/replay backlog setup, receipt architecture, receipt runtime, replay runtime, vault execution provenance, queue-driving prompts**
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
7. leaves the queue in a more truthful state than it found it
