---
summary: "Verification record for FCOS-M41 task #667 covering packaged release-check proof plus one live Pi-host evidence_record smoke through the AK-native guarded repo bootstrap path."
read_when:
  - "You need the proof packet for the guarded repo bootstrap verification pass in pi-society-orchestrator."
  - "You are deciding whether task #667 is actually closed or only locally tested."
system4d:
  container: "Verification/evidence note for the guarded bootstrap concern."
  compass: "Prove the AK-native guarded bootstrap path through both deterministic package validation and one live Pi-host run."
  engine: "Run package checks -> run installed-package release smoke -> run live Pi-host evidence smoke -> capture durable references."
  fog: "The main risk is mistaking unit coverage for live host proof or claiming live proof without a session/log artifact."
---

# 2026-04-01 — Guarded bootstrap verification

## Scope

Close AK task `#667` by proving the `pi-society-orchestrator` consumer-side guarded bootstrap path with:

1. package-local validation
2. installed-package `release:check` proof
3. one live Pi-host smoke that exercised `evidence_record` from an unregistered canonical repo path and confirmed the write completed via `ak`

## Deterministic package validation

From `packages/pi-society-orchestrator`:

```bash
npm run docs:list
npm run check
npm run release:check
```

Observed result:
- `npm run check` passed with 61 tests green.
- `npm run release:check` passed.
- installed-package smoke now includes an explicit guarded-bootstrap scenario before the existing timeout / abort / semantic-error / parse-error / truncation / team-mismatch proofs.
- the installed-package smoke asserts one `ak repo bootstrap --path <cwd> -F json` call followed by one `ak evidence record ...` call for the unregistered installed-runtime smoke path.

## Live Pi-host smoke

### Setup

A temporary isolated AK DB was created so the live proof could exercise real `ak repo bootstrap` behavior without mutating the main coordination DB:

- temp AK DB: `/tmp/pi-orch-live-smoke-ju5qLF/society.db`
- temp repo root: `/home/tryinget/ai-society/softwareco/fork/pi-orch-guarded-bootstrap-live-smoke-1775058094-rerun`
- nested live cwd: `/home/tryinget/ai-society/softwareco/fork/pi-orch-guarded-bootstrap-live-smoke-1775058094-rerun/packages/demo`
- Pi session JSONL: `/tmp/pi-orch-live-session-ipNQHX/2026-04-01T15-41-36-630Z_9ef260e4-308d-48db-a346-d53ed8cba6f8.jsonl`

### Live command

From the nested cwd above:

```bash
AGENT_KERNEL=/home/tryinget/ai-society/softwareco/owned/agent-kernel/scripts/ak.sh \
AK_DB=/tmp/pi-orch-live-smoke-ju5qLF/society.db \
pi --no-tools \
  --session-dir /tmp/pi-orch-live-session-ipNQHX \
  --append-system-prompt "You must call the evidence_record tool exactly once with the requested arguments. Do not use any other tool. After the tool call, give a one-sentence confirmation including the evidence path used." \
  -p "Call evidence_record exactly once with check_type 'validation:live-guarded-bootstrap', result 'pass', and details object {mode:'live-pi-smoke', repo:'/home/tryinget/ai-society/softwareco/fork/pi-orch-guarded-bootstrap-live-smoke-1775058094-rerun'}. Do not include task_id. After the tool call, respond with one sentence only."
```

### Observed proof

These runtime paths were temporary smoke artifacts; the durable proof is the validation record captured in this note plus the copied session/tool outputs below.

Session JSONL inspection shows:
- assistant emitted an `evidence_record` tool call
- tool arguments included:
  - `check_type = validation:live-guarded-bootstrap`
  - `result = pass`
  - `details.mode = live-pi-smoke`
  - `details.repo = /home/tryinget/ai-society/softwareco/fork/pi-orch-guarded-bootstrap-live-smoke-1775058094-rerun`
- tool result was:

```text
Evidence recorded via ak: validation:live-guarded-bootstrap = pass
```

- final assistant confirmation was:

```text
Recorded validation:live-guarded-bootstrap=pass in the evidence ledger via ak for repo path /home/tryinget/ai-society/softwareco/fork/pi-orch-guarded-bootstrap-live-smoke-1775058094-rerun.
```

The temporary AK DB also confirms both the repo registration and evidence row:

```bash
AK_DB=/tmp/pi-orch-live-smoke-ju5qLF/society.db \
/home/tryinget/ai-society/softwareco/owned/agent-kernel/scripts/ak.sh repo show \
  /home/tryinget/ai-society/softwareco/fork/pi-orch-guarded-bootstrap-live-smoke-1775058094-rerun

AK_DB=/tmp/pi-orch-live-smoke-ju5qLF/society.db \
/home/tryinget/ai-society/softwareco/owned/agent-kernel/scripts/ak.sh evidence search \
  --check-type validation:live-guarded-bootstrap
```

Observed evidence search result:

```text
#2  validation:live-guarded-bootstrap pass task_id=- task_ref=- repo=- repo_scope=-
  checked_at: 2026-04-01T15:41:59.675759814+00:00
  checked_by: cli
  details: {"mode":"live-pi-smoke","repo":"/home/tryinget/ai-society/softwareco/fork/pi-orch-guarded-bootstrap-live-smoke-1775058094-rerun"}
```

## Verdict

Task `#667` has the required proof:
- consumer-side regression coverage exists
- packaged install/release smoke now covers the guarded bootstrap path deterministically
- one live Pi-host session exercised `evidence_record` from an unregistered canonical repo path and recorded evidence via `ak`

This closes the original verification gap that remained after task `#666`.
