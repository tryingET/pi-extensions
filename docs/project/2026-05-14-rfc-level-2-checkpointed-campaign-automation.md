---
summary: "RFC for level-2 checkpointed campaign automation across pi-autoresearch and pi-society-orchestrator."
read_when:
  - "Reviewing AK decision #44 for level-2 measured campaign automation."
  - "Designing campaign automation that prepares, binds, measures, exports, and reviews without hidden execution or promotion."
  - "Implementing pi-autoresearch or pi-society-orchestrator level-2 campaign commands after ADR acceptance."
type: "rfc"
status: "proposed"
date: "2026-05-14"
problem_intent: "docs/project/2026-05-14-level-2-campaign-automation-problem-intent.md"
evidence_note: "docs/project/2026-05-14-level-1-measured-campaign-closeout.md"
system4d:
  container: "Repo-scoped RFC for level-2 measured campaign automation."
  compass: "Authorize checkpointed automation of campaign glue while rejecting hidden execution, evidence writes, cleanup, promotion, and source-owner drift."
  engine: "Use level-1 evidence -> define levels -> compare options -> choose authorization envelope -> state gates, tests, rollout, and rollback."
  fog:
    risks:
      - "Calling checkpointed preparation autonomous execution."
      - "Automating proof-only campaigns instead of enforcing whole-matrix implementation pressure."
      - "Letting generated packets mutate AK/KES/Oracle/Prompt Vault/ROCS or release state."
---

# RFC — level-2 checkpointed campaign automation

## A. Status

Proposed RFC for AK decision `#44`.

This RFC supersedes the earlier misframed level-2 decision packet at `docs/project/2026-05-14-level-2-campaign-automation-decision-packet.md`. That packet mixed problem intent, RFC/design, and decision framing. This RFC restores the usual lifecycle shape:

```text
problem intent -> evidence note -> RFC/design -> review -> ADR -> implementation/validation plan
```

## B. Problem this RFC answers

The problem intent is recorded in:

- `docs/project/2026-05-14-level-2-campaign-automation-problem-intent.md`

Short form:

```text
Level-1 measured campaigns work, but too much manual glue lets the controller drift into baseline-only or proof-only work. We need automation that preserves real whole-matrix pressure without granting hidden execution or promotion authority.
```

## C. Evidence base

The evidence note is:

- `docs/project/2026-05-14-level-1-measured-campaign-closeout.md`

Closed level-1 campaigns:

| Campaign | Evidence | Metric result |
| --- | --- | --- |
| Root compatibility/release control-plane | evidence `#1969`; task `#2953` | `root_release_control_plane_blockers = 0` |
| Missing/stalled/late lane recovery | evidence `#1973`; task `#2954` | `missing_lane_recovery_blockers = 0` |
| Target 3 whole-matrix execution glue | evidence `#1991`, `#1995`; tasks `#2963`, `#2965` | `whole_matrix_execution_glue_blockers = 0` |

Important lesson: the operator had to force the third campaign away from proof-only drift and into real visible candidate fan-in. Level 2 must preserve that anti-narrowing pressure.

## D. What this RFC decides

This RFC decides whether `pi-autoresearch` and `pi-society-orchestrator` may own level-2 checkpointed campaign automation.

Level 2 means the packages may prepare and run structured campaign glue under explicit checkpoints:

- create or refresh a matrix plan from a target packet;
- prepare visible candidate launch packets;
- validate matrix completeness before launch;
- bind `PEER_ACK` / `PEER_FINAL` reports to candidate lanes;
- export candidate-result packets;
- compute blocker metrics;
- prepare `review_candidate_wave`, `review_matrix_campaign`, and `finalize_post_fanin` packets;
- require explicit controller tokens before dangerous actions.

## E. What this RFC does not decide

This RFC does not authorize:

- hidden peer launch;
- hidden benchmark/export/review;
- automatic AK task/evidence/decision/direction mutation;
- automatic KES, Oracle/DSPx, Prompt Vault, or ROCS writes;
- merge, cherry-pick, push, PR, release, cleanup, or promotion automation;
- treating peer/intercom messages as durable evidence;
- toolbox work while toolbox remains explicitly deferred.

## F. Options

### Option A — Stay level 1 only

Keep all campaign orchestration manual/controller-run. Use the level-1 playbook and Target 3 controller runbook, but do not authorize new orchestrator/autoresearch automation.

Pros:

- lowest authority risk;
- no new runtime surface;
- easy rollback.

Cons:

- repeats manual fan-in glue;
- leaves proof-only drift as a human vigilance problem;
- underuses the matrix/autoresearch substrate already proven in level 1.

### Option B — Level-2 checkpointed campaign automation

Authorize package-owned preparation, measurement, binding, export, and review-packet generation while keeping launch, evidence, finalizer, cleanup, merge, release, and promotion token-gated.

Pros:

- reduces manual glue;
- preserves visible control;
- directly answers the operator-forced lesson from Target 3;
- gives `pi-autoresearch` a concrete measurement/export role;
- gives `pi-society-orchestrator` a concrete matrix/fan-in choreography role.

Cons:

- creates a real runtime surface that must fail closed;
- requires careful operator UX so checkpointed packets are not mistaken for authority;
- requires tests for missing/duplicate lanes, token boundaries, and packet truth.

### Option C — Higher automation / hidden fan-out-fan-in

Authorize mostly autonomous campaign execution, including hidden peer launch or automatic finalizer/evidence behavior.

Pros:

- maximizes speed.

Cons:

- violates level-1 boundary lessons;
- risks source-owner drift;
- makes generated packets look like authority;
- is not supported by current evidence.

## G. Recommended decision

Adopt **Option B: level-2 checkpointed campaign automation**.

Option A is now too conservative: the level-1 arc proved enough manual substrate and exposed manual drift risk. Option C is too aggressive: the evidence does not authorize hidden execution or promotion.

Option B is the narrowest useful graduation: automate the glue that keeps matrix work honest, but keep all dangerous transitions explicit.

## H. Authorization envelope

| Owner | Authorized level-2 responsibility |
| --- | --- |
| `pi-society-orchestrator` | matrix plan structure, visible launch packet preparation, lane binding, review-packet choreography, finalizer-token request preparation |
| `pi-autoresearch` | metrics, campaign receipts, candidate-result packet export, blocker computation, dashboard/readiness summaries |
| Controller/operator | explicit launch tokens, owner review, AK evidence/task/decision/direction mutations, finalizer authorization, promotion decisions |

## I. Required gates

Before any implementation can claim level-2 conformance:

1. ADR accepts this authorization envelope.
2. Tests prove missing lane reports fail closed.
3. Tests prove duplicate lane reports fail closed or require explicit reconciliation.
4. Tests prove no peer launch occurs without explicit launch token.
5. Tests prove finalizer actions cannot run without `finalize_post_fanin` token.
6. Tests prove exported packets distinguish peer assertions from controller-verified facts.
7. Tests prove proof-only/baseline-only completion cannot close a real matrix target without an explicit downgrade or incomplete-matrix exception.
8. Rollback to level-1 runbooks is documented and tested at the command-packet level.

## J. Anti-narrowing requirement

Level 2 must include an anti-narrowing check.

A campaign cannot close as successful if it only proves baseline/doc readiness while avoiding the selected matrix implementation pressure. The substrate must require one of:

- real candidate lanes were launched, bound, measured, and reviewed;
- an explicit incomplete-matrix exception was recorded;
- the controller explicitly downgraded the target and recorded why.

Without one of those, the target-specific blocker metric remains non-zero.

## K. Rollout slices if accepted

1. **Design acceptance slice**: ADR + validation/rollout/rollback plan.
2. **Packet-only slice**: add prepared packet outputs without executing any new action.
3. **Binding/measurement slice**: add lane binding and blocker computation over existing candidate outputs.
4. **Review-prep slice**: generate review packets and finalizer-token requests.
5. **Operator UX slice**: make checkpoint states visible enough that packets cannot be mistaken for authority.

Each slice must preserve rollback to level-1 manual runbooks.

## L. Rollback

If level 2 creates confusion or authority drift:

- disable level-2 commands/entrypoints;
- continue using `docs/project/2026-05-14-target3-whole-matrix-execution-controller-runbook.md` and the level-1 playbook;
- preserve candidate-result exports as non-authoritative review inputs;
- record AK evidence only after controller verification.

## M. Proposed ADR outcome

```text
Accept Option B: level-2 checkpointed campaign automation, with explicit tokens for launch, evidence writes, finalizer action, cleanup, merge, release, and promotion; reject hidden execution/promotion automation.
```
