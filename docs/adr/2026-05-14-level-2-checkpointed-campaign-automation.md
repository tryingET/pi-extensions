---
summary: "ADR accepting level-2 checkpointed campaign automation: automate campaign glue and packet preparation while preserving explicit tokens for launch, evidence, finalizer, cleanup, merge, release, and promotion."
status: accepted
read_when:
  - "Implementing pi-autoresearch or pi-society-orchestrator campaign automation beyond level 1."
  - "Deciding whether a campaign helper may launch peers, export packets, write evidence, clean worktrees, or promote results."
  - "Reviewing the boundary between checkpointed campaign automation and hidden execution."
type: "adr"
decision: "AK decision #44"
system4d:
  container: "Repo-scoped ADR for level-2 checkpointed campaign automation in pi-extensions."
  compass: "Authorize automation of campaign glue while keeping dangerous transitions explicit and owner-gated."
  engine: "Problem intent + level-1 evidence + RFC + review -> accepted Option B -> implementation gates and rollback boundaries."
  fog:
    risks:
      - "Candidate-result export is mistaken for a durable evidence write."
      - "Checkpointed preparation is widened into hidden peer launch or hidden finalization."
      - "Anti-narrowing checks are omitted and campaigns regress to proof-only work."
---

# ADR — Level-2 checkpointed campaign automation

## Status

Accepted.

Canonical AK decision: `decision:44` — "Adopt level-2 checkpointed campaign automation substrate through usual problem-intent/RFC workflow".

Supporting artifacts:

- Problem intent: [`../project/2026-05-14-level-2-campaign-automation-problem-intent.md`](../project/2026-05-14-level-2-campaign-automation-problem-intent.md)
- Evidence note: [`../project/2026-05-14-level-1-measured-campaign-closeout.md`](../project/2026-05-14-level-1-measured-campaign-closeout.md)
- RFC: [`../project/2026-05-14-rfc-level-2-checkpointed-campaign-automation.md`](../project/2026-05-14-rfc-level-2-checkpointed-campaign-automation.md)
- Review memo: [`../project/2026-05-14-review-level-2-checkpointed-campaign-automation-rfc.md`](../project/2026-05-14-review-level-2-checkpointed-campaign-automation-rfc.md)
- Level-1 ADR: [`2026-05-14-campaign-automation-graduation-level-1.md`](2026-05-14-campaign-automation-graduation-level-1.md)

## Decision

Adopt **Option B: level-2 checkpointed campaign automation**.

`pi-autoresearch` and `pi-society-orchestrator` may automate campaign glue and packet preparation under explicit checkpoints. They may not perform hidden execution, evidence writes, cleanup, merge, release, or promotion.

Short form:

```text
Automate preparation, binding, measurement, export packets, and review packets.
Do not automate launch, evidence writes, finalizer actions, cleanup, merge, release, or promotion without explicit owner tokens.
```

## Authorized level-2 responsibilities

| Owner | Authorized now |
| --- | --- |
| `pi-society-orchestrator` | Matrix plan structure, visible launch packet preparation, lane binding, candidate-wave/matrix review choreography, finalizer-token request preparation. |
| `pi-autoresearch` | Metrics, receipts, candidate-result packet export, blocker computation, dashboard/readiness summaries. |
| Controller/operator | Explicit launch tokens, owner review, AK mutations, finalizer authorization, cleanup, merge, release, and promotion decisions. |

## Explicitly not authorized

This ADR does not authorize:

- hidden peer launch;
- hidden benchmark execution;
- hidden candidate-result export;
- hidden candidate-wave or matrix review;
- automatic AK task/evidence/decision/direction mutation;
- automatic KES, Oracle/DSPx, Prompt Vault, or ROCS writes;
- automatic keep/discard/rewind, worktree cleanup, branch deletion, merge, push, PR, release, or promotion;
- treating peer text, checkpoint tokens, or local `.autoresearch/` receipts as durable authority without owner projection;
- toolbox work while toolbox remains explicitly deferred.

## Token requirements

Level-2 helpers must fail closed unless the required token is present for the relevant boundary:

| Boundary | Required token |
| --- | --- |
| visible peer launch | `launch_visible_candidate_lanes` token naming target, matrix cells/lanes, parent session, cwd, files-in-scope, off-limits, and DoD |
| post-fan-in finalizer action | `finalize_post_fanin` token naming candidate-result packet, review result, metric posture, and permitted finalizer scope |
| AK evidence/task/decision/direction write | `ak_owner_write` token naming exact AK operation and evidence source |
| KES/Oracle/DSPx/Prompt Vault/ROCS write | owner-surface token from that owner, not from campaign automation |
| cleanup / branch deletion / worktree removal | `candidate_cleanup` token naming exact worktrees/branches after archival/review |
| merge / cherry-pick / push / PR / release / promotion | explicit owner promotion token naming exact repository paths and rollback |

Preparing a token request is allowed. Consuming a token is allowed only in the exact command surface designed for that boundary. Inferring a token from chat text, peer reports, or a checkpoint label is not allowed.

## Export terminology

This ADR uses `export` in the checkpointed packet sense:

```text
candidate-result packet export = non-authoritative review input
```

It is not an AK evidence write, KES write, Oracle/DSPx write, Prompt Vault write, ROCS write, release artifact, or promotion claim. Durable authority requires a separate owner-approved write.

## Anti-narrowing requirement

Level-2 automation must preserve whole-matrix implementation pressure.

A campaign cannot close as successful if it only proves baseline/doc readiness while avoiding the selected matrix implementation pressure. It must record one of:

- real candidate lanes were launched, bound, measured, and reviewed;
- an explicit incomplete-matrix exception was recorded;
- the controller explicitly downgraded the target and recorded why.

Without one of those, the target-specific blocker metric remains non-zero.

## Missing and duplicate lane behavior

- Missing lane reports are blockers unless an explicit incomplete-matrix exception is recorded.
- Duplicate lane reports fail closed by default.
- Duplicate reconciliation requires explicit controller action naming the accepted report and rejected duplicate(s).
- `PEER_ACK` / `PEER_FINAL` binding is protocol correlation only; it does not make peer text durable evidence.

## Rationale

The level-1 adoption arc proved enough to move beyond fully manual glue:

- root compatibility/release control-plane campaign closed with zero blockers;
- missing/stalled/late lane recovery closed with zero blockers;
- Target 3 visible whole-matrix fan-in closed with zero execution-glue blockers and a canonical controller runbook.

The Target 3 wave also exposed a human-process risk: the operator had to push the controller away from proof-only drift and back toward real matrix work. Level 2 should automate the glue that keeps matrix pressure visible and measured, not the dangerous owner decisions.

## Consequences

Positive:

- campaign fan-in can become less manual;
- matrix completeness and anti-narrowing become testable;
- `pi-autoresearch` and `pi-society-orchestrator` get clearer owner responsibilities;
- generated packets are easier to review and compare.

Costs:

- more command surfaces and tests are required;
- token UX must be precise enough to avoid accidental authority drift;
- rollback to level-1 runbooks must remain available.

## Implementation gates

No implementation may claim conformance until it includes tests or equivalent checks for:

1. missing lane reports fail closed;
2. duplicate lane reports fail closed or require explicit reconciliation;
3. no peer launch without `launch_visible_candidate_lanes` token;
4. no finalizer action without `finalize_post_fanin` token;
5. exported packets distinguish peer assertions from controller-verified facts;
6. proof-only/baseline-only completion cannot close a real matrix target without downgrade or incomplete-matrix exception;
7. cleanup/branch deletion requires explicit `candidate_cleanup` token;
8. rollback to level-1 runbooks remains documented.

## Rollback

If level 2 causes confusion or authority drift:

1. disable level-2 commands/entrypoints;
2. continue using the level-1 playbook and Target 3 controller runbook;
3. preserve candidate-result exports as non-authoritative review inputs;
4. record AK evidence only after controller verification;
5. open a corrective decision if the authorization envelope itself needs to narrow.
