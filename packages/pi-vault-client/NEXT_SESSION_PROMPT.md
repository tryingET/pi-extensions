---
summary: "The AK-backed receipts/replay setup slice now exists in-repo, and the next truthful step is to make AK task 29 truthful if needed, then execute VRE-01 and author the Vault Execution Receipt architecture note."
read_when:
  - "Starting the next focused session in packages/pi-vault-client."
  - "Deciding whether the next slice is remaining VRE-00 state-sync or the VRE-01 architecture note."
system4d:
  container: "Canonical handoff after the VRE-00 backlog/prompt setup slice."
  compass: "Preserve the repaired runtime/package state, keep AK as the canonical queue, and advance one backlog item at a time with validate -> deep-review -> nexus -> atomic-completion -> revalidate -> commit."
  engine: "Reacquire repo truth -> sync AK task 29 if needed -> claim VRE-01 -> author architecture note -> validate -> review -> commit -> record AK evidence -> advance queue."
  fog: "Main risks are resuming from stale VRE-00 setup work, sweeping unrelated monorepo dirt into a commit, or forgetting that this package uses the central agent-kernel wrapper rather than a package-local helper."
---

# Next session prompt for `pi-vault-client`

## One-line handoff

`pi-vault-client` now has the durable AK-backed receipts/replay backlog doc plus reusable supervisor/worker prompts in-repo. The next implementation slice is `VRE-01`: author `docs/dev/vault-execution-receipts.md`. Current known blocker: `./scripts/ak-v2.sh task complete 29` presently fails with `query returned more than one row`, so AK task `29` must be repaired/truthfully closed before task `30` can become ready.

## Current package truth

### Runtime/package truth
- Prompt Vault contract target remains **schema v9 only**.
- `npm run typecheck` is green.
- `npm run check` is green.
- Pi-visible reads are centralized around:
  - `status = 'active'`
  - `export_to_pi = true`
  - visibility-company filtering
- Visibility-sensitive reads fail closed without explicit company context on:
  - tool surfaces
  - slash-command execution surfaces
  - grounding paths
- Governed ontology/visibility contracts refresh in-process when their backing files change.
- `prompt_eval create_variant` fails closed on persistence failure.
- Package-local `tsconfig.json` exists, so typecheck no longer silently skips.

### AK/tasking truth
- Canonical backlog spec:
  - `docs/dev/plans/vault-receipts-ak-backlog.md`
- Reusable prompts:
  - `prompts/task-worker-loop.md`
  - `prompts/task-supervisor-loop.md`
- Worker loop explicitly requires:
  - implement
  - validate
  - deep-review
  - nexus implementation
  - atomic-completion
  - revalidate
  - commit
- Canonical AK wrapper remains **central**, not package-local:
  - env: `/home/tryinget/ai-society/softwareco/owned/agent-kernel/.ak-env-v2`
  - wrapper: `/home/tryinget/ai-society/softwareco/owned/agent-kernel/scripts/ak-v2.sh`
- This package still does **not** carry a local `.ak-env-v2` or `scripts/ak-v2.sh` helper.
- Seeded AK task IDs for this project:
  - `29` → `VRE-00`
  - `30` → `VRE-01`
  - `31` → `VRE-02`
  - `32` → `VRE-03`
  - `33` → `VRE-04`
  - `34` → `VRE-05`
  - `35` → `VRE-06`
  - `36` → `VRE-07`
  - `37` → `VRE-08`
  - `38` → `VRE-09`
  - `39` → `VRE-10`
- After truthful closeout of task `29`, the next ready task should be:
  - `30` (`VRE-01`)

### Prompt/testing truth
- Worker prompt was tested via real `pi -p` dry runs.
- Supervisor prompt was tested via real `pi -p` dry runs.
- Sentinel output contract exists to tolerate startup noise:
  - worker: `BEGIN_WORKER_RESULT_JSON ... END_WORKER_RESULT_JSON`
  - supervisor: `BEGIN_SUPERVISOR_RESULT_JSON ... END_SUPERVISOR_RESULT_JSON`
- Supervisor prompt references supported AK commands only:
  - `task ready -F json`
  - `task claim <id> --agent <agent> --lease 3600`
  - `evidence record ...`
  - `task complete ...`
  - `task fail ...`
  - `task release-expired`

### Working-tree truth
- The monorepo still has unrelated dirty state in sibling packages.
- This package may also contain dirty files unrelated to `VRE-00`/`VRE-01` from recent runtime hardening work.
- Do **not** sweep sibling-package or unrelated package changes into a receipts/replay commit.
- Use selective staging only.

## Verified evidence

### Package validation
From `~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client`:

```bash
npm run docs:list
npm run typecheck
npm run check
```

Observed: passed.

### AK queue evidence
From `~/ai-society/softwareco/owned/agent-kernel`:

```bash
source ./.ak-env-v2
./scripts/ak-v2.sh task release-expired
./scripts/ak-v2.sh task ready -F json
```

Observed during setup closeout:
- task `29` (`VRE-00`) was the ready repo task
- the repo/task registration is live in AK
- after repo commit + evidence recording, `./scripts/ak-v2.sh task complete 29` failed with:
  - `Database error: engine error: query returned more than one row`
- because of that AK-side failure, task `29` remains claimed and task `30` is not yet ready

### Prompt dry-run evidence
Observed from real `pi -p` tests:
- worker dry run for `VRE-01` returned a valid `done` payload
- worker dry run for `VRE-04` returned a valid `done` payload
- supervisor dry run correctly identified `VRE-00` as the next ready repo task during setup

## What is **not** the current problem here

Do **not** resume from these stale assumptions unless new evidence forces it:
- the package still lacks a receipts/replay backlog or queue-driving prompts
- AK is unavailable for this repo
- the worker loop still stops before atomic-completion
- package typecheck still skips
- the next truthful step is more setup/docs churn instead of the receipt architecture note
- phase 1 already requires a Prompt Vault schema migration

## Single best next step

Repair AK truth for task `29`, then advance to `VRE-01`.

That means:
1. diagnose/fix the AK-side failure on `task complete 29`
2. close task `29` truthfully in AK
3. confirm task `30` becomes ready
4. claim task `30`
5. author `docs/dev/vault-execution-receipts.md`
6. validate
7. deep-review
8. apply the single highest-leverage nexus improvement
9. run atomic-completion closeout
10. revalidate, commit, record evidence, and complete task `30`

## Concrete objective for the next slice

Create the architecture note at:
- `docs/dev/vault-execution-receipts.md`

It should define:
- receipt purpose
- receipt schema v1
- sink abstraction
- privacy boundary
- replay contract
- rollout phases
- open decisions
- why phase 1 avoids a Prompt Vault schema migration

## Suggested kickoff

### 1. Reacquire package truth
```bash
cd ~/ai-society/softwareco/owned/pi-extensions/packages/pi-vault-client
npm run docs:list
npm run typecheck
npm run check
git status --short
```

### 2. Reacquire AK queue truth
```bash
cd ~/ai-society/softwareco/owned/agent-kernel
source ./.ak-env-v2
./scripts/ak-v2.sh task release-expired
./scripts/ak-v2.sh task ready -F json
```

### 3. If task `29` is not truthfully closed yet, reconcile it before new work
Typical closeout shape:
```bash
./scripts/ak-v2.sh evidence record --task 29 --check-type review:deep --result pass --details '{"summary":"VRE-00 review complete"}'
./scripts/ak-v2.sh evidence record --task 29 --check-type review:nexus --result pass --details '{"summary":"VRE-00 nexus applied"}'
./scripts/ak-v2.sh evidence record --task 29 --check-type review:atomic-completion --result pass --details '{"summary":"VRE-00 atomic completion complete"}'
./scripts/ak-v2.sh evidence record --task 29 --check-type validation:typecheck --result pass --details '{"command":"npm run typecheck"}'
./scripts/ak-v2.sh evidence record --task 29 --check-type validation:package --result pass --details '{"command":"npm run check"}'
./scripts/ak-v2.sh task complete 29 --result '{"summary":"VRE-00 complete"}'
```

### 4. Claim `VRE-01`
```bash
./scripts/ak-v2.sh task claim 30 --agent pi-vault-worker --lease 3600
```

### 5. Read the architecture inputs before drafting
- `docs/dev/plans/vault-receipts-ak-backlog.md#vre-01`
- `src/vaultDb.ts`
- `src/vaultTypes.ts`
- `NEXT_SESSION_PROMPT.md`

## Repo routing rule
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

## Read first next time
1. `AGENTS.md`
2. `README.md`
3. `docs/dev/status.md`
4. `docs/dev/plans/vault-receipts-ak-backlog.md`
5. `NEXT_SESSION_PROMPT.md`
6. `src/vaultDb.ts`
7. `src/vaultTypes.ts`

## Files most relevant right now
- `docs/dev/plans/vault-receipts-ak-backlog.md`
- `docs/dev/vault-execution-receipts.md`
- `NEXT_SESSION_PROMPT.md`
- `src/vaultDb.ts`
- `src/vaultTypes.ts`
- `tests/vault-dolt-integration.test.mjs`

## Success condition for the next slice

### Preferred success
1. `VRE-01` lands as a task-local commit
2. `docs/dev/vault-execution-receipts.md` clearly defines the v1 architecture boundary
3. AK evidence is recorded for review, nexus, atomic-completion, and validation
4. task `30` is completed truthfully
5. `npm run typecheck` stays green
6. `npm run check` stays green

### Acceptable fallback success
1. a concrete architecture blocker is identified
2. the blocker is written down without widening scope into implementation
3. unrelated dirty state is not swept into a commit
4. AK queue state is kept truthful
