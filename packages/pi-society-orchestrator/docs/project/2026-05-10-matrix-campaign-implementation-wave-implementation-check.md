---
summary: "Implementation conformance check for plan_matrix_campaign against ADR 2026-05-10."
read_when:
  - "Before claiming the matrix-campaign implementation-wave substrate is accepted or ready for dogfood."
  - "When checking whether the implementation conforms to the accepted matrix-campaign ADR."
type: "validation"
system4d:
  container: "Package-local ADR conformance check for plan_matrix_campaign."
  compass: "Verify implementation follows the accepted plan-only matrix choreography decision before dogfood continues."
  engine: "Map ADR requirements to code/tests/docs -> identify gaps -> record validation commands and result."
  fog: "The main uncertainty is future behavior, not current conformance: later slices could still pressure this plan-only surface toward hidden execution."
---

# Implementation check — matrix campaigns as implementation-wave substrate

## Checked against

ADR: [`../adr/2026-05-10-matrix-campaign-implementation-wave-substrate.md`](../adr/2026-05-10-matrix-campaign-implementation-wave-substrate.md)

Implementation commit under review:

- `fb454303 feat(orchestrator): plan matrix autoresearch campaigns`

Follow-up conformance hardening in this check:

- added explicit regression coverage that `candidatePacketDirectory` rejects path escapes outside `.autoresearch/`.
- added a campaign peer-runner handoff contract that exposes `candidate_peer_spawn -> candidate worktree -> autoresearch_candidate_bind -> autoresearch_runtime_run -> candidate_result_export -> review_candidate_wave` and classifies controller-inline implementation as a process violation for campaign-style implementation work.
- hardened `review_candidate_wave` selection so packets are non-selectable unless candidate metadata proves candidate-runner lineage (`source: candidate_peer_spawn`, distinct worktree, branch, base ref, and changed files; peer/runner ids are propagated when present).
- added a manifest/checkpoint runner contract (`prepare_matrix_campaign_runner` / `checkpoint_matrix_campaign_runner`) that exposes only visible `candidate_peer_spawn` launch calls before controller checkpoint confirmation and withholds benchmark/export/review calls until the exact checkpoint token is supplied.

## Conformance matrix

| ADR requirement | Implementation status | Evidence |
|---|---|---|
| Exact `taskId` + `cwd` anchoring | Conforms | `plan_matrix_campaign` uses the existing `autoresearch_live_supervision` identity validation path. |
| Non-empty objective | Conforms | Extension rejects empty `objective` before calling the runner; runtime planner also rejects empty objective. |
| At least one scenario and hypothesis | Conforms | `planAutoresearchMatrixCampaign` fails closed when `scenarios` or `hypotheses` normalize to empty arrays. |
| Candidate count per cell bounded 1–6 | Conforms | `resolveMatrixCellCandidateCount` delegates to the candidate-wave count resolver. |
| Deterministic cell ids | Conforms | Runtime emits `cell-XX-YY` ids from scenario/hypothesis indices. |
| Packet paths under `.autoresearch/matrix-campaign/<cell>/` | Conforms | Matrix planner generates `.autoresearch/matrix-campaign/<cell-id>/candidate-XX.candidate-result.json`. |
| Custom candidate-wave packet dir cannot escape `.autoresearch/` | Conforms after check hardening | Added test rejects `candidatePacketDirectory: "../outside"`; runtime rejects absolute/path-escape dirs. |
| Emits exact `plan_candidate_wave` calls per cell | Conforms | Matrix cell `planCandidateWaveCall` uses `autoresearch_live_supervision({ action: "plan_candidate_wave", ... })`. |
| Emits exact `review_candidate_wave` calls per cell | Conforms | Matrix cell `reviewCandidateWaveCall` uses `autoresearch_live_supervision({ action: "review_candidate_wave", ... })`. |
| Campaign peer-runner handoff explicit | Conforms after check hardening | Matrix and candidate-wave management packets include the handoff contract: `candidate_peer_spawn`, candidate worktree, bind, run, export, review. |
| Controller-inline implementation rejected | Conforms after check hardening | Reports, boundaries, review flow, candidate constraints, and dogfood contract classify controller-inline campaign implementation as `process_violation`. |
| Review selection requires candidate-runner lineage | Conforms after check hardening | `review_candidate_wave` now makes manual/controller-inline packets non-selectable even when their metric/check/status would otherwise win; positive `candidate_peer_spawn` packets remain selectable. |
| `pi-autoresearch` stays below-seam | Conforms after check hardening | The handoff contract says peer spawning is `forbidden_below_seam`; candidate measurement remains `pi-autoresearch` owned. |
| Uses dashboard first, decision workbench last | Conforms | Matrix owner route now surfaces `/autoresearch export` as the primary run-history/metrics UI, `/autoresearch overlay` as the live TUI fallback, and keeps matrix cell `ownerUiCommand` / implementation substrate `/autoresearch review` as the final decision UI only. |
| First exact cell call as next implementation action | Conforms | `implementationWaveSubstrate.nextExactCalls` contains the first cell's `planCandidateWaveCall`. |
| Plan-only / no hidden execution | Conforms | Runtime planner returns data only; extension renders and returns details only. No peer spawn, benchmark, packet export, AK/KES/evidence write, merge, promotion, or worktree lifecycle action is invoked. |
| Checkpointed runner phase gates | Conforms after runner-contract hardening | `prepare_matrix_campaign_runner` returns `autoresearch.matrix_campaign_runner_contract.v1` with exact `taskId` + `cwd` manifest identity, candidate-peer launch calls, and zero benchmark/export/review calls; `checkpoint_matrix_campaign_runner` returns zero calls until the exact `checkpointConfirmation` token is supplied. |
| README/current truth documents boundary | Conforms | README describes `plan_matrix_campaign` and the checkpointed runner contract as owner-boundary-preserving. |

## Validation commands

Run from repo root:

```bash
npm --prefix packages/pi-society-orchestrator run check
node packages/pi-society-orchestrator/scripts/dogfood-campaign-peer-runner-handoff-contract.mjs
node packages/pi-society-orchestrator/scripts/dogfood-matrix-candidate-wave-management-contract.mjs
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict --require-system4d-path docs/adr/ --require-system4d-path docs/decisions/
```

## Result

Status: **conforms for first-slice dogfood**.

The implementation satisfies the ADR for a plan-only matrix choreography surface, plus a safer checkpointed runner contract for operators who want a single manifest-shaped launch surface without broad auto-execution.
The next process step is not controller-inline implementation; it is dogfooding the first matrix cell through either the emitted `plan_candidate_wave` path or the checkpointed runner manifest: visible `candidate_peer_spawn` / candidate worktree / explicit controller checkpoint / candidate-result packet / `/autoresearch export` dashboard / `review_candidate_wave` / `/autoresearch review` final-decision path under the owning AK task and direction node.
