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
| Uses `/autoresearch review` as primary owner UI | Conforms | Matrix cell `ownerUiCommand` and implementation substrate set `/autoresearch review`. |
| First exact cell call as next implementation action | Conforms | `implementationWaveSubstrate.nextExactCalls` contains the first cell's `planCandidateWaveCall`. |
| Plan-only / no hidden execution | Conforms | Runtime planner returns data only; extension renders and returns details only. No peer spawn, benchmark, packet export, AK/KES/evidence write, merge, promotion, or worktree lifecycle action is invoked. |
| README/current truth documents boundary | Conforms | README describes `plan_matrix_campaign` as plan-only and owner-boundary-preserving. |

## Validation commands

Run from repo root:

```bash
npm --prefix packages/pi-society-orchestrator run check
node ~/ai-society/core/agent-scripts/scripts/docs-list.mjs --docs . --strict --require-system4d-path docs/adr/ --require-system4d-path docs/decisions/
```

## Result

Status: **conforms for first-slice dogfood**.

The implementation satisfies the ADR for a plan-only matrix choreography surface.
The next process step is not broader implementation; it is dogfooding the first matrix cell through the emitted `plan_candidate_wave` / candidate-result packet / `review_candidate_wave` / `/autoresearch review` path under AK task `#2722` and AK direction `SF3 -> IW1`.
