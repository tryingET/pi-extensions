---
summary: "Decision packet for whether the measured implementation-wave campaign substrate can graduate beyond proof-era dogfood."
read_when:
  - "You are deciding whether pi-autoresearch / pi-society-orchestrator campaigns should become the default implementation-wave route."
  - "You are considering more automation for matrix/candidate-wave campaigns."
  - "You need the evidence corpus behind SF5/IW3 campaign-substrate adoption."
type: "decision-packet"
system4d:
  container: "Repo-scoped decision packet for campaign automation graduation in pi-extensions."
  compass: "Graduate the useful default-use substrate without authorizing hidden execution, promotion, or authority drift."
  engine: "Evidence corpus -> options -> recommendation -> gates -> rollback -> owner decision."
  fog:
    risks:
      - "A successful dogfood wave gets interpreted as permission for hidden peer launch, benchmark execution, or evidence writes."
      - "The stack keeps repeating proof campaigns instead of using the substrate on real implementation waves."
      - "Automation is raised before missing-lane, dashboard, evidence, and learning handoff gates are boring."
---

# Campaign automation graduation decision packet

## Decision question

Should `pi-autoresearch` + `pi-society-orchestrator` graduate from proof-era dogfood into the default measured implementation-wave substrate, and if so, how much automation is authorized now?

## Recommendation

Adopt **graduation level 1**:

```text
Default-use measured campaign substrate: yes.
Checkpointed command-packet automation: yes.
Hidden execution / promotion automation: no.
```

This means:

- real ambiguous or multi-hypothesis implementation waves should normally start from the measured campaign route;
- orchestrator may prepare matrix/candidate-wave plans, checkpoint contracts, cockpit summaries, exact controller command packets, and evidence/learning handoff calls;
- `pi-autoresearch` remains the runtime owner for measurement, receipts, dashboards, candidate-result packets, closeout, and learning/evidence packet export;
- visible peer launch, benchmark execution, packet export, review, evidence recording, KES materialization, worktree cleanup, merge, and promotion remain explicit operator/owner actions.

Do **not** adopt graduation level 2 yet:

```text
No hidden peer launch.
No whole-matrix auto-runner.
No automatic benchmark/export/review chain.
No automatic AK evidence/KES/Oracle write.
No automatic candidate keep/discard/merge/cleanup.
```

## Evidence corpus

### Core proof closeout

| Proof | Authority anchor | Result |
|---|---|---|
| Bounded campaign endurance | `task:2749`, evidence `#1958` | 30/30 iterations, dashboard/export/resume/closeout present, `unresolved_campaign_endurance_blockers=0`, no hidden authority mutation. |
| Matrix substrate | `task:2722` | Matrix plan/candidate-wave/cockpit/closeout follow-ons proved through later tasks while preserving owner seams. |
| Integrated supervised campaign | `task:2902`, evidence `#1882` | Three cells completed; selected lanes recorded; `evidence_handoff_blockers=0`; dashboard-first owner route before evidence. |
| Integrated supervised campaign wave 2 | `task:2907`, evidence `#1905` | Three cells completed; selected lanes recorded; implementation validated; `evidence_handoff_blockers=0`. |
| Adoption playbook | `task:2947`, evidence `#1961` | `docs/project/measured-implementation-wave-campaign-playbook.md` codifies the default route and automation gate. |

### Adoption seed campaigns

Closed tasks that show the substrate is already useful beyond the initial proof loop:

| Task | Campaign | Metric posture |
|---:|---|---|
| `2916` | pi-host compatibility canary expansion | blocker metric reached zero |
| `2919` | monorepo quality-gate throughput and drift | blocker metric reached zero |
| `2921` | matrix endurance and live observability | `unresolved_matrix_endurance_blockers`: baseline `3`, final `0` |
| `2924` | metric-readiness trust dashboard export | `metric_readiness_visibility_blockers`: baseline `1`, final `0` |
| `2926` | candidate-wave reliability | `candidate_wave_reliability_blockers`: baseline `1`, final `0` |
| `2930` | authority handoff dashboard | `authority_handoff_blockers`: baseline `3`, final `0` |
| `2935` | supervised self-hosting endurance | `unresolved_self_hosting_safety_blockers`: baseline `5`, final `0` |

## Decision options

### Option A — Stay proof-only

Keep campaigns as special dogfood demos and require bespoke operator judgment for each new use.

Pros:
- lowest automation risk;
- no new defaults.

Cons:
- repeats proof work;
- loses the value of the adoption corpus;
- leaves high-leverage implementation waves vulnerable to chat-local candidate comparison and overclaiming.

### Option B — Graduation level 1: default route + checkpointed command packets

Make measured campaigns the default for suitable implementation waves, while keeping all mutation/execution/promotion actions explicit.

Pros:
- uses the proven substrate on real work;
- preserves owner boundaries;
- gives operators one route for plan, measure, review, closeout, evidence, and learning;
- rollback is simple because automation is still plan/checkpoint/review.

Cons:
- still requires explicit controller/operator calls;
- campaign setup overhead is not worth it for small deterministic fixes;
- cockpit/command-packet UX must stay fresh with tool schemas.

### Option C — Graduation level 2: supervised execution runner

Authorize orchestrator to execute more of the chain after checkpoint, for example bind/measure/export/review across cells.

Pros:
- lower manual controller glue;
- closer to an autonomous campaign product.

Cons:
- raises authority and safety risk;
- missing-lane and late-packet behavior becomes easier to hide;
- failure recovery and rollback need stronger runtime contracts;
- would require a separate ADR/AK decision and likely additional tests/live-host proof.

## Proposed decision

Choose **Option B** now.

Decision text:

```text
Adopt checkpointed measured campaign substrate as the default route for ambiguous, multi-hypothesis, or high-leverage implementation waves in pi-extensions. The authorized automation level is plan/checkpoint/review plus exact controller command packets. Execution, peer launch, benchmark runs, packet export, evidence writes, KES materialization, worktree lifecycle, merge, and promotion remain explicit owner actions until a later decision raises the automation boundary.
```

## Graduation level 1 contract

Authorized:

- `plan_matrix_campaign` and `plan_candidate_wave` as default planning surfaces;
- matrix cockpit and operator-followup packets;
- checkpoint token gating before measurement/review call bundles are exposed;
- exact bind/measure/export/review command packets;
- candidate-wave and matrix review reports;
- exact `evidence_record` and KES adapter handoff call preparation after owner review;
- AK task/evidence closeout of the campaign result by the controller/owner.

Not authorized:

- hidden peer launch;
- hidden benchmark execution;
- hidden candidate-result export;
- hidden matrix/candidate review;
- automatic AK evidence, KES, Prompt Vault, ROCS, Oracle/DSPx, or issue-tracker mutation;
- automatic keep/discard/rewind, worktree cleanup, merge, branch deletion, or promotion;
- treating peer text, checkpoint tokens, or local `.autoresearch/` receipts as durable authority without owner projection.

## Gates before level 2

Before considering supervised execution automation, require all of:

1. at least two more real non-meta implementation waves closed through level 1 with AK evidence;
2. one failure/recovery campaign where a missing, stalled, or late lane is handled without premature selection;
3. live-host proof that dashboard/export remains useful during a longer campaign;
4. explicit rollback design for partially executed matrix cells;
5. deterministic tests for idempotency, overwrite gates, and no hidden owner-surface mutation;
6. ADR or AK decision accepting the widened automation boundary.

## Rollback

If level 1 creates confusion or operator misuse:

- stop using matrix/candidate-wave planning as a default;
- keep `pi-autoresearch` runtime receipts and candidate-result packets as local evidence projections;
- return to one-candidate dogfood playbook and explicit owner review;
- do not delete existing AK evidence; add corrective evidence explaining which claim was overbroad.

## Open follow-ups

1. Pick the next real non-meta implementation wave under `SF5/IW3`.
2. Keep the playbook current when tool schemas change.
3. Prepare a separate ADR only if level 2 supervised execution is proposed.
4. Decide whether Prompt Vault should own a reusable procedure template for level-1 measured implementation waves after the route is stable.
