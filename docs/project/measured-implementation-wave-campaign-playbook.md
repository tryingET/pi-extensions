---
summary: "Playbook for using pi-autoresearch + pi-society-orchestrator as the measured substrate for real implementation waves."
read_when:
  - "You are choosing whether a repo change should run as a measured campaign instead of a single inline patch."
  - "You need the post-proof adoption posture for pi-autoresearch / pi-society-orchestrator campaigns."
  - "You are deciding whether to raise campaign automation beyond checkpointed plan/review choreography."
type: "playbook"
system4d:
  container: "Root monorepo playbook for measured implementation-wave adoption."
  compass: "Make campaign substrate the default for ambiguous/high-leverage implementation waves without moving runtime, evidence, or promotion authority into the campaign machinery."
  engine: "Select a real wave -> plan scenario x hypothesis cells -> launch visible candidate lanes -> measure with pi-autoresearch -> review with orchestrator -> project evidence/learning only through owner gates."
  fog:
    risks:
      - "Proof-era dogfood gets repeated forever instead of being adopted on real owner work."
      - "Matrix/candidate-wave convenience turns into hidden execution or promotion authority."
      - "Raw peer text or partial lane packets are mistaken for measured evidence."
---

# Measured implementation-wave campaign playbook

## Current posture

The proof-era line is closed in AK direction:

- `SF3` / `IW1` — matrix campaign substrate proof: done.
- `SF4` / `IW2` — bounded campaign endurance proof: done.
- `SF5` / `IW3` — measured campaign substrate adoption: active.

The phase change is:

```text
from: can the pi-autoresearch / pi-society-orchestrator seams work?
to:   use the campaign substrate as the normal route for ambiguous, risky, or multi-hypothesis implementation waves.
```

## Evidence harvested before adoption

Authority-side closeout has been recorded for the core proofs:

| Concern | AK/task evidence | Proof artifact / result |
|---|---|---|
| Bounded endurance | `task:2749`, evidence `autoresearch:campaign-endurance:bounded-proof` | `packages/pi-autoresearch/.autoresearch/campaign-endurance-proof-2026-05-14T06-42-36-352Z.json`; 30/30 iterations, `unresolved_campaign_endurance_blockers=0`, dashboard/export/resume/closeout present. |
| Managed candidate-wave fan-in | `task:2763` | `packages/pi-autoresearch/.autoresearch/managed-candidate-wave-fanin-2026-05-14T06-51-20-311Z/managed-candidate-wave-fanin-proof.json`; incomplete lane gates selection, complete fan-in routes owner review. |
| Matrix cockpit / runner | `task:2907`, evidence `#1905` | three matrix cells completed, selected lanes recorded, `evidence_handoff_blockers=0`, validation passed. |
| Integrated closeout / evidence / learning handoff | `task:2902`, evidence `#1882`, plus closeout proof under `packages/pi-autoresearch/.autoresearch/closeout-evidence-learning-*` | owner decision route remains `/autoresearch export -> /autoresearch review -> evidence_record`; KES learning activation remains owner-routed. |
| Real adoption campaigns already run | `tasks:2916`, `2919`, `2921`, `2924`, `2926`, `2930`, `2935` | pi-host canary, monorepo quality gate, matrix endurance/observability, metric-readiness, reliability, authority handoff, and self-hosting endurance campaigns all closed with blocker metrics reaching zero. |

Treat those artifacts as evidence/projection. Do not treat local `.autoresearch/` receipts as canonical authority without AK/evidence owner promotion.

## When to use this playbook

Use a measured implementation-wave campaign when at least two are true:

- there are multiple plausible implementation hypotheses;
- a first patch could be lucky or overclaimed;
- the work has an operator-facing quality/performance/reliability metric;
- owner review needs packet inventory and not just chat claims;
- a candidate peer or isolated worktree race would reduce risk;
- evidence/learning should survive beyond the Pi session.

Do **not** use it for a small deterministic fix with one obvious validation path.

## Owner split

| Concern | Owner |
|---|---|
| Campaign runtime, metrics, receipts, dashboards, candidate-result packets | `packages/pi-autoresearch` |
| Matrix/candidate-wave choreography, fan-in gate, owner-review summary, evidence projection handoff | `packages/pi-society-orchestrator` |
| Visible candidate launch and candidate worktrees | peer tooling / `candidate_peer_spawn` |
| Durable task, direction, evidence authority | AK / society authority surfaces |
| Learning materialization | owner-routed KES adapter / notes owner |
| Ontology, Prompt Vault, Oracle/DSPx writes | their owner surfaces only |

## Standard campaign route

```text
1. Anchor the wave in AK
   - exact task or active implementation wave
   - allowed/off-limits paths if mutation is expected

2. Define the campaign matrix
   - objective
   - scenario(s)
   - hypothesis family/families
   - primary metric per cell, direction, and target
   - correctness gates and boundary constraints

3. Plan candidate waves
   - orchestrator `plan_matrix_campaign` or `plan_candidate_wave`
   - explicit candidate packet paths under `.autoresearch/`
   - no benchmark/export/review calls before the required checkpoint if using the runner contract

4. Launch visible candidates
   - use `candidate_peer_spawn` or approved peer/worktree surface
   - peer output is communication only
   - controller verifies worktree, diff, lineage, and paths before measurement

5. Measure with pi-autoresearch
   - `autoresearch_candidate_bind`
   - `autoresearch_runtime_run`
   - `autoresearch_runtime_status({ action: "candidate_result_export" })`

6. Fan in with orchestrator
   - `review_candidate_wave` per cell
   - missing planned lanes block final selection unless owner replans
   - late packets require rerunning aggregate review

7. Review and close out
   - dashboard first: `/autoresearch export`
   - final lifecycle UI: `/autoresearch review`
   - matrix closeout prepares `evidence_record` only after owner review

8. Promote through owner surfaces
   - AK evidence only through exact `evidence_record` / `ak evidence record`
   - learning through `learning_export -> autoresearch_learning_kes_adapter(plan) -> owner review -> materialize`
```

## Minimum metrics

Every campaign should carry one lower-is-better blocker metric with target `0` for the campaign-control quality itself, for example:

- `implementation_wave_campaign_blockers`
- `manual_controller_glue_blockers`
- `matrix_cockpit_blockers`
- `evidence_handoff_blockers`
- `learning_activation_blockers`

Product/source metrics may be separate, but the campaign-control metric says whether the campaign was usable and lawful.

## Automation graduation gate

Do not raise automation from checkpointed plan/review choreography to supervised execution until all conditions hold:

1. at least one non-meta owner wave has completed through this route with AK evidence;
2. missing/stalled/late lane behavior remained explicit and blocked premature owner selection;
3. dashboard/export was useful before final review;
4. learning/evidence handoff was owner-routed and deduped;
5. an explicit ADR or AK decision accepts the new automation boundary;
6. rollback is clear: disable the automation and return to plan/review calls without losing receipt evidence.

Until then, the default is:

```text
plan/checkpoint/review yes; hidden execution/promote no.
```

## Next recommended owner wave

Use the next real implementation wave that is not merely about proving the campaign machinery. Good candidates are root compatibility/release control-plane work or another owner-selected package quality wave where multiple hypotheses compete against a measurable blocker metric.

The already-completed adoption examples (`tasks:2916`, `2919`, `2921`, `2924`, `2926`, `2930`, `2935`) should be treated as the seed corpus for the next automation-graduation decision packet, not as permission to skip the decision.
