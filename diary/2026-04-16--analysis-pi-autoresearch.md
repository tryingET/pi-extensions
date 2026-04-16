---
summary: "Session diary for cloning and assessing upstream pi-autoresearch against the pi-extensions ecosystem."
read_when:
  - "Reviewing the raw session notes behind the pi-autoresearch integration recommendation."
  - "Looking for exact commands, inspected surfaces, and first-pass findings before the structured project note."
system4d:
  container: "Repo-root diary capture for a cross-repo architecture assessment."
  compass: "Preserve the raw evidence and reasoning behind the recommendation to re-envision rather than import wholesale."
  engine: "Clone upstream -> inspect prototype and local package seams -> validate bounded parts -> record recommendation."
  fog: "The main risk is losing the evidence trail and later re-arguing whether the recommendation came from real inspection or only intuition."
---

# Session diary — pi-autoresearch incorporation analysis

## Goal
Clone `https://github.com/davebcn87/pi-autoresearch` into the softwareco contrib lane and assess how to incorporate or re-envision it inside the `pi-extensions` ecosystem with AK, Prompt Vault, ROCS, and the current package boundaries.

## Repo / task context
- Working repo: `/home/tryinget/ai-society/softwareco/owned/pi-extensions`
- AK task: `#1359` — `Assess pi-autoresearch incorporation into pi-extensions ecosystem`
- Clone target: `/home/tryinget/ai-society/softwareco/contrib/pi-autoresearch`
- Upstream commit cloned: `5a29db0`

## What I inspected
Upstream files:
- `../../contrib/pi-autoresearch/README.md`
- `../../contrib/pi-autoresearch/package.json`
- `../../contrib/pi-autoresearch/extensions/pi-autoresearch/index.ts`
- `../../contrib/pi-autoresearch/skills/autoresearch-create/SKILL.md`
- `../../contrib/pi-autoresearch/skills/autoresearch-finalize/SKILL.md`
- `../../contrib/pi-autoresearch/skills/autoresearch-finalize/finalize.sh`
- `../../contrib/pi-autoresearch/tests/finalize_test.sh`

Current monorepo/ecosystem context:
- `packages/pi-vault-client/README.md`
- `packages/pi-ontology-workflows/README.md`
- `packages/pi-society-orchestrator/README.md`
- `packages/pi-autonomous-session-control/README.md`
- `packages/pi-interaction/README.md`
- `packages/pi-activity-strip/README.md`
- `packages/pi-context-overlay/README.md`
- `packages/pi-prompt-template-accelerator/README.md`
- `docs/project/vision.md`
- `docs/project/root-capabilities.md`

Tooling/context checks:
- `./scripts/rocs.sh --doctor`
- `ontology_inspect({ kind: "status", scope: "company" })`
- `vault_vocabulary()`
- `vault_query(...)`
- `vault_retrieve(["transcendent-iteration", "prompt-method-router"])`

## Validation run
Executed:
- `cd ../../contrib/pi-autoresearch && bash tests/finalize_test.sh`

Result:
- `18/18` finalize tests passed

## Key upstream findings
1. **Strong idea, weak drop-in fit**
   - The upstream package is a good operator prototype for autonomous benchmark/optimization loops.
   - It is not a good direct fit for our ecosystem boundaries as-is.

2. **Architecture is monolithic**
   - `extensions/pi-autoresearch/index.ts` is ~2.9k lines and mixes:
     - tool implementations
     - runtime state
     - widget/overlay rendering
     - browser export server
     - git automation
     - persistence
     - auto-resume/session control

3. **Good local mechanics worth preserving**
   - `METRIC name=value` parsing
   - append-only session receipts in `autoresearch.jsonl`
   - optional `autoresearch.checks.sh`
   - confidence score from benchmark noise floor
   - finalize flow for splitting kept changes into reviewable branches

4. **Current authority model conflicts with ours**
   - upstream authority is local files + git side effects
   - our authority stack wants:
     - AK for execution/task truth
     - Prompt Vault for prompt/control-plane truth
     - ROCS/ontology for governed semantics
     - package-owned seams for runtime ownership

5. **Direct git automation is too broad for our norms**
   - `git add -A`
   - broad revert/clean on discard/crash
   - branch rewriting during finalize
   - good prototype ergonomics, but too unsafe without AK/task-scope mediation

6. **Skills are directionally right, but not the right authority plane here**
   - upstream separates infra from skill docs
   - current `pi-extensions` monorepo packages do not currently ship `pi.skills` manifest entries
   - better fit here is Prompt Vault templates plus thin package-owned runtime/tool seams

7. **Potential code-quality drift already visible**
   - `extensions/pi-autoresearch/index.ts` references `runtime.pendingCompactResume = false`, but that field does not appear elsewhere in the file
   - upstream `package.json` has no build/check/test scripts beyond the standalone shell test file

## Re-envisioned ownership map
- **AK**
  - experiment campaign/task identity
  - scope boundaries
  - lifecycle/status
  - final kept-change follow-up tasks
- **Prompt Vault / pi-vault-client**
  - setup prompt
  - next-hypothesis prompt
  - finalize/grouping prompt
  - router deciding whether to continue, re-baseline, finalize, or stop
- **ROCS / pi-ontology-workflows**
  - concepts for experiment session / run / metric / hypothesis / benchmark script / evidence artifact
  - governed vocab for statuses and evidence semantics
- **pi-autonomous-session-control**
  - runtime loop lifecycle / resume / abort / bounded autonomy
- **pi-society-orchestrator**
  - optional higher-order campaign coordination across subagents or phases
- **pi-interaction**
  - picker/live-trigger affordances for setup and review
- **pi-activity-strip**
  - coarse live experiment telemetry across sessions
- **pi-context-overlay**
  - deep context/run-history inspection

## Preferred recommendation
Do **not** import upstream wholesale as a single package.

Instead:
1. treat the cloned repo as a pattern/prototype reference
2. design a new monorepo package around our boundaries
3. preserve the best local mechanics
4. move prompt policy into Prompt Vault
5. bind runtime execution to AK + ASC + ontology semantics

## Candidate package shape
Working name options:
- `packages/pi-autoresearch`
- `packages/pi-experiment-loop`
- `packages/pi-governed-experiment-loop`

Likely best semantic framing:
- keep `/autoresearch` as operator UX alias
- use a more truthful internal architecture description: governed experiment loop / benchmark campaign runtime

## Immediate next slices I would recommend
1. Create a concept note / RFC for the target seam and ownership map.
2. Add company-ontology concepts for experiment/session/run/metric/hypothesis/evidence.
3. Draft Prompt Vault templates for:
   - experiment setup
   - next-hypothesis selection
   - finalize grouping
   - stop/rebaseline router
4. Decide whether runtime ownership lands as:
   - a new package with ASC-supervised loop execution, or
   - an ASC-hosted experiment runtime seam with a thin `/autoresearch` adapter package.
5. Add a root compatibility-canary scenario once a first package exists.

## Outcome
Cloned upstream repo successfully and completed a bounded architecture analysis. A structured recommendation doc was written to `docs/project/pi-autoresearch-integration-analysis.md`.
