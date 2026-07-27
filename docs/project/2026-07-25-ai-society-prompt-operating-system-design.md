---
summary: "Design packet for the SF7/IW8 adaptive-portfolio Prompt Vault-to-Pi execution path."
read_when:
  - "Implementing or reviewing AK tasks 4163–4168."
  - "Changing the AI Society prompt operating-system owner split, adaptive-portfolio semantics, or promotion gates."
type: "design-packet"
status: "assessed"
date: "2026-07-25"
system4d:
  container: "SF7/IW8 design and owner-handoff contract."
  compass: "Make diverse prompt-assisted reasoning measurable and executable without letting prompts, modes, shortcuts, or orchestration absorb owner authority."
  engine: "Design gate -> governed Vault artifacts -> exact Pi binding -> measured proving ground -> separate mode and shortcut decisions -> convergence audit."
  fog: "The main risks are duplicated prompt bodies, fixed fanout disguised as diversity, transcript-only evidence, and coordination surfaces being mistaken for execution authority."
---

# AI Society prompt operating system — adaptive-portfolio design

## Status and scope

This packet is the design result for AK task `4162`, strategic frame `SF7`, and implementation wave `IW8`.
It is source-owned prose. Agent Kernel owns the packet identity, typed links, direction, tasks, decisions, evidence, and lifecycle.

The predecessor gate has passed:

- `SF6/IW7` is terminal;
- AK task `4263` is done with closed reconciliation v4 and evidence `5482`, `5489`, `5490`, `5491`, `5494`, and `5498`;
- independent review `dispatch-1785167413355` accepted that closeout;
- deferral `183` on task `4162` is resolved;
- `SF7/IW8` is active;
- `ak direction check` is green after the transition.

This task authorizes this document and AK packet/link/readback evidence only. It does **not** authorize Prompt Vault mutation, Pi runtime implementation, model spend, mode promotion, provisioning changes, Espanso apply, publication, KES promotion, FCOS closure, or `SF7/IW8` closeout.

## Design question

How should AI Society combine strong independent reasoning approaches, adaptive evidence allocation, adversarial closure, and convenient operator entrypoints while preserving one authoritative owner for every prompt, runtime action, task/evidence fact, semantic contract, and machine projection?

## Decision

Adopt a split-plane prompt operating system with two new governed Prompt Vault artifacts and no new authority layer:

1. **`adaptive-portfolio-plan`** — a text-safe, one-shot structured procedure that produces a bounded portfolio plan and mechanism-level approach-family registry. It cannot execute, dispatch, mutate, or claim evidence.
2. **`adaptive-portfolio-execute`** — a one-shot workflow procedure quarantined behind fail-closed dispatch until task `4164` supplies an exact immutable Pi executor binding. It supervises the portfolio protocol but does not absorb child execution, experiment, AK, or promotion authority.

Reuse existing templates instead of copying them:

- `many-of-the-greats` for strong incompatible schools and explicit adjudication;
- `deep-review` for final adversarial review;
- `goal-convergence-audit` for target-versus-busyness closure checks;
- `prompt-reality-convergence` for repeated real-surface prompt/runtime correction;
- `pi-autoresearch-setup`, `pi-autoresearch-next-hypothesis`, and `pi-autoresearch-finalize` for bounded measured campaign decisions;
- existing Layer-12 and execution-memory procedures for artifact routing, not as the adaptive runtime.

The new artifacts add only the missing cross-cutting mechanism: a durable approach-family registry, evidence-driven allocation, duplicate suppression, blocker/reopen semantics, budget/saturation gates, adversarial winner audit, and truthful non-success outcomes.

Do not create a Prompt Vault router in this wave. Runtime state transitions belong to the bound supervisor, and current router vocabulary does not truthfully describe active experiment-state routing.

## Desired operator outcome

A fresh operator can provide a bounded objective and receive:

```text
objective + scope + authority envelope
-> reviewable adaptive portfolio plan
-> explicit consent/budget gate
-> bound supervised execution
-> mechanism-distinct evidence and blockers
-> adversarial closure
-> AK-ready evidence packet
-> separate promotion decisions
```

The operator can always tell:

- what is proposed versus running;
- which owner is acting;
- which budget remains;
- which families are distinct, duplicative, blocked, reopened, or exhausted;
- what evidence supports each claim;
- whether the normative workflow outcome is `supported`, `partially_supported`, `not_supported`, `blocked`, or `no_solution_found`;
- what exact owner action is legal next.

## Authority and artifact map

| Surface | Sole responsibility | Must not become |
|---|---|---|
| Workspace/repo `AGENTS.md` | Stable policy, routing, safety, source-owner boundaries | A reusable prompt library or volatile workflow state |
| Prompt Vault | Canonical reusable procedure text, versions, visibility, classification, dispatch posture | Task state, runtime state, evidence acceptance, or package implementation |
| `pi-vault-client` | Visibility-aware retrieval, preparation, aggregate identity authorization, fail-closed dispatch | A workflow runtime or prompt-content fork |
| `pi-society-orchestrator` | Cross-owner workflow registration, supervision, state transition, checkpoint/resume, closure packet | Child execution runtime, experiment truth, or AK authority |
| `pi-autonomous-session-control` | Child execution, prompt-envelope provenance, failure taxonomy, session/runtime receipts | Portfolio policy, task truth, or promotion authority |
| `pi-autoresearch` | Measured campaign runtime, metric contracts, candidates, budgets, receipts, empirical posture | Generic workflow routing or direct durable promotion |
| `pi-evalset-lab` | Fixed-task-set comparisons and reproducible reports | Authorization from a passing evaluation |
| `pi-modes` | Session-local prompt posture and composition observability | Procedure storage, dispatch, autonomy, or mutation permission |
| Agent Kernel | Direction, packet identity/links, decisions, tasks, dependencies, evidence, reconciliation, lifecycle | Prompt bodies or runtime microstate |
| FCOS control board | Layer-5 coordination identity, blocker/handoff visibility, closeout meaning | Claimable execution or copied AK/source-owner state |
| Provisioning/Chezmoi | Reproducible Espanso projection, preview/apply/rollback/drift | Prompt or execution authority |
| Espanso | Short visible operator entrypoints | Reusable prompt prose, hidden execution, or consent bypass |
| ROCS/ontology owners | Governed semantic vocabulary when stable reusable semantics need it | Ad-hoc task state or prompt text |
| KES | Explicitly promoted learning after evidence and closeout | Automatic transcript or campaign-log promotion |
| DSPx/Oracle | Later empirical analysis across sufficient traces | Present execution or acceptance authority |

### Artifact placement

| Artifact | Canonical location |
|---|---|
| Stable policy and owner routing | applicable `AGENTS.md` / canonical owner docs |
| `adaptive-portfolio-plan` and `adaptive-portfolio-execute` bodies | Prompt Vault |
| Executor bindings and runtime schemas | owning Pi packages |
| Session posture | `pi-modes` definitions/state, without workflow body |
| Task, decision, packet, and evidence truth | Agent Kernel |
| Cross-repo coordination status | FCOS item `ai-society-prompt-operating-system-d2e` |
| Shortcut manifest and generated YAML | provisioning/Chezmoi owner |
| Raw/local run receipts | owning Pi runtime under its bounded artifact contract |
| Accepted learning | KES owner surface after explicit promotion |

No full procedure body may be copied into `AGENTS.md`, `SYSTEM.md`, `.pi/prompts`, a mode, or Espanso.

## Prompt Vault overlap and delta audit

| Existing artifact | Reuse | What it already owns | Missing adaptive-portfolio semantics |
|---|---|---|---|
| `meta-orchestration` | Phase-selection reference only | Chooses the next reasoning phase and preserves phase boundaries | No mechanism registry, execution budget, evidence allocation, or portfolio closure |
| `many-of-the-greats` | Direct text-safe baseline and optional planning input | Strong schools, confrontation, synthesis/contextual dominance/preference | No persistent family registry, budget, execution, evidence allocation, blocker/reopen, or closure receipt |
| `deep-review` | Mandatory final apparent-winner audit | Multi-lens adversarial review and rollback analysis | No portfolio lifecycle or adaptive allocation |
| `goal-convergence-audit` | Closeout check | Target-state convergence versus local busyness | No execution state or family-level evidence ledger |
| `prompt-reality-convergence` | Real-surface repair method where prompt/runtime mismatch is diagnosed | Three-loop prompt/runtime convergence | Not suitable before a runtime exists and not a portfolio supervisor |
| `transcendent-iteration` | Separate escalation only | Acting debt-dissolution loop with mandatory mutation | Too broad and mutation-oriented for default portfolio analysis; must not be embedded |
| `pi-autoresearch-setup` | Measured-campaign setup seam | Objective, metric, scope, baseline, first experiment rules | No multi-family portfolio or cross-owner workflow |
| `pi-autoresearch-next-hypothesis` | Family-local next measured move | One evidence-based next hypothesis | Intentionally emits one move, not a portfolio |
| `pi-autoresearch-finalize` | Kept-run finalization seam | Reviewable grouping and explicit approval | No pre-finalization family allocation |
| `layer12-040-direction-to-execution-ak-native` | AK-native D2E routing reference | Routes broad reasoning into bounded packet/decision/direction/task/evidence/handoff outcomes | Not runtime state or adaptive search policy |
| `repo-direction-to-execution` | Repo-local D2E routing reference | Routes repo truth through AK-native SF/IW/packet/task surfaces | Not a portfolio supervisor or evidence allocator |
| `execution-memory-transfer` | Post-design execution-memory handoff | Converts converged artifacts into runtime-addressable AK execution memory | Does not execute or choose adaptive families |
| `execution-chain-overview` | Front-door artifact-state reference | Selects the earliest lawful analysis-to-execution entry point | Does not own portfolio state, budgets, or receipts |

### Why both new artifacts are required

A plan-only artifact is useful before an executable binding exists and is safe for ordinary retrieval/interpretation. A workflow artifact is necessary because launch authorization, bounded concurrency, receipts, checkpoints, allocation, and terminal closure cannot be made truthful by prose interpretation alone.

The split prevents two failures:

- classifying executable behavior as harmless text;
- forcing every planning use through a runtime when a reviewable plan is sufficient.

### Classification contract

| Name | Artifact kind | Control mode | Formalization | Initial posture |
|---|---|---|---|---|
| `adaptive-portfolio-plan` | `procedure` | `one_shot` | `structured` | Text-safe; no execution or mutation verbs interpreted as authority |
| `adaptive-portfolio-execute` | `procedure` | `one_shot` | `workflow` | Quarantined until exact task-4164 executor binding passes dispatch checks |

Task `4163` must audit canonical vocabulary before insertion and may adjust governed metadata only when it preserves this semantic split. It must not silently add more templates.

## Adaptive-portfolio semantic contract

### Inputs

The planning and execution contracts consume an explicit envelope:

```json
{
  "objective": "bounded outcome",
  "repo_or_surface": "owner scope",
  "authority_refs": [],
  "files_in_scope": [],
  "off_limits": [],
  "hard_constraints": [],
  "budget": {
    "max_model_calls": null,
    "max_iterations": null,
    "max_wall_clock_minutes": null,
    "max_spend": {
      "amount": "10.00",
      "currency": "USD",
      "usage_source": "provider_usage_receipt"
    },
    "max_parallel_lanes": null
  },
  "approved_plan_digest": null,
  "launch_consent_receipt_ref": null,
  "evidence_requirements": [],
  "stop_rules": [],
  "promotion_non_authorizations": []
}
```

Execution requires at least one finite **total-work** bound: model calls, iterations, wall-clock minutes, or spend. `max_parallel_lanes` is concurrency control and never satisfies the total-work requirement. `max_spend` is either `null` or an object whose positive decimal-string `amount` uses an ISO-4217 `currency` and whose `usage_source` identifies the owner receipt used for incremental enforcement. If that source cannot provide trustworthy currency-matched usage before the next allocation, spend cannot satisfy the total-work gate; another finite total-work bound is required and the run fails closed before exceeding the last verified allowance.

The approved plan uses schema `adaptive-portfolio-plan.v1`. Its digest input is the complete plan object containing objective, repo/surface, authority refs, scope/off-limits, constraints, normalized family registry, budget, evidence requirements, stop rules, and non-authorizations, while excluding `approved_plan_digest`, consent refs, receipts, timestamps, and other runtime-mutable fields. Arrays preserve reviewed order; unordered registry maps use schema-defined keys. The object is serialized as RFC 8785 JSON Canonicalization Scheme UTF-8 bytes and hashed with SHA-256. The external identity is lowercase `sha256:<64-hex>`. Tasks `4163` and `4164` must publish and validate the same schema/fixture vectors before binding.

The executor ignores caller assertions of consent. Every launch requires an operator-issued, host-correlatable consent receipt resolved through the owning runtime. The receipt binds the exact `adaptive-portfolio-plan.v1` digest, repo/scope, provider/model allowlist, maximum consumable call/token/spend/time budget, expiry, and single-use or idempotency key. External/model-spend execution requires a receipt that explicitly permits that spend. Missing, expired, consumed, mismatched, or unverifiable scope, authority, plan digest, total-work budget, pricing/usage source, currency, or consent yields `blocked` before child launch; it never triggers a best-effort run.

### Approach-family registry

Diversity is measured by mechanism, not role labels, prose variation, model count, or agent count.
Each family record contains:

```json
{
  "family_id": "stable-kebab-id",
  "mechanism": "causal mechanism or decision theory",
  "hypothesis": "falsifiable claim",
  "premises": [],
  "distinguishing_prediction": "observation separating this family from others",
  "falsifier": "observation that retires or blocks it",
  "target_surfaces": [],
  "owner": "runtime or source-owner lane",
  "estimated_cost": {},
  "state": "proposed",
  "evidence_refs": [],
  "duplicate_of": null,
  "merged_into_family_id": null,
  "blocked_reason": null,
  "reopen_trigger": null
}
```

The registry must establish more than one mechanism-distinct family before claiming portfolio diversity. `single_family_only` is a pre-execution posture flag, not a terminal outcome. It blocks adaptive-portfolio execution under this workflow; the one family may be routed separately as a non-portfolio baseline, which cannot claim adaptive-portfolio success.

Duplicate families are merged before launch. A family is duplicate when it shares the same causal mechanism, distinguishing prediction, falsifier, and target surface despite different wording or agent personas.

### Family lifecycle

```text
proposed
-> admitted | duplicate | blocked
admitted
-> active | blocked
active
-> promising | exhausted | blocked | adversarial_hold
promising
-> active | exhausted | blocked | adversarial_hold
exhausted
-> reopened | adversarial_hold
blocked
-> reopened | adversarial_hold
adversarial_hold
-> active | closed_supported | closed_unsupported | closed_blocked
```

`duplicate` is a non-evaluative terminal disposition and must carry `duplicate_of` or `merged_into_family_id`. Every evaluated family reaches `closed_supported`, `closed_unsupported`, or `closed_blocked` only through `adversarial_hold`; no apparent winner or falsified family bypasses closure review. A falsifier moves a family to `adversarial_hold` with a proposed unsupported disposition, not directly to a terminal state.

Reopen is legal only when a recorded trigger occurs, such as new owner authority, new evidence, corrected measurement, changed constraint, or a new distinguishing prediction. Rephrasing the same hypothesis is not novelty and cannot reopen a family.

### Adaptive allocation

The supervisor allocates the next bounded unit of work using evidence gain, not aesthetics:

1. merge semantic duplicates, move falsified families to `adversarial_hold`, and block unauthorized or budget-infeasible families;
2. reserve enough early budget to test admitted mechanism-distinct families without requiring one agent per family;
3. prefer the family with the highest expected marginal evidence gain per declared cost;
4. discount repeated findings, unsupported claims, stale baselines, and evidence already covered by another family;
5. preserve a bounded adversarial allocation for the current apparent winner;
6. stop allocating when the global budget, family budget, saturation rule, or authority boundary is reached.

Allocation decisions emit receipts containing the candidate families, scores or categorical rationale, selected family, consumed budget, and rejected alternatives. Runtime implementation may choose a deterministic scoring model or an explicit ordered policy, but it must be testable and must not infer quality from output length.

### Blocker and novelty rules

A blocker record contains owner, blocked operation, reason, evidence, next legal move, and reopen trigger. Blocked work cannot be silently reassigned to another owner.

A finding is novel only when it adds at least one of:

- a new supported mechanism;
- a new falsifier or contradiction;
- a new owner-relevant blocker;
- a new causal reproduction or measurement;
- a new decision-changing tradeoff.

Longer prose, a new persona, or rediscovery of an existing finding is duplicate effort.

### Saturation and stop rules

The manifest defines the exact thresholds. The workflow stops when any hard stop fires:

- budget exhausted;
- operator cancellation;
- authority or scope violation;
- no admitted lawful family remains;
- required evidence surface is unavailable;
- baseline/metric invalidation requires rebaseline;
- configured saturation window adds no decision-changing evidence;
- closure criteria are met.

A stop is not automatically success.

### Normative workflow outcomes

The workflow has exactly one terminal outcome enum:

- `supported` — every mandatory objective claim is positively supported and adversarial closure passes;
- `partially_supported` — a decision-useful subset is positively supported, residual claims and consequences are explicit, and closure passes;
- `not_supported` — completed evidence positively falsifies the objective, or adversarial closure establishes every admitted family as `closed_unsupported`; mere absence of support is insufficient;
- `blocked` — missing authority, consent, scope, runtime, required evidence, operator continuation, or valid baseline prevents lawful adjudication;
- `no_solution_found` — the lawful budget or saturation threshold is reached inconclusively, with no positive support, no positive falsification, and no external blocker.

Outcome derivation uses this precedence: `blocked` when lawful adjudication is incomplete; otherwise `supported`; otherwise `partially_supported`; otherwise `not_supported` only with positive falsification or all-family unsupported closure; otherwise `no_solution_found`. Family terminal states map into that workflow outcome; they are not alternative workflow outcomes. `single_family_only`, `rebaseline_required`, budget exhaustion, cancellation, and saturation are stop reasons or posture flags. Cancellation before a complete closure review derives `blocked`. The closure packet deterministically derives the outcome from mandatory-claim coverage, final family states, blockers, and stop reason.

### Adversarial closure

Before `closed_supported`, an independent reviewer must attack:

- the apparent winner's causal claim;
- at least one discarded or blocked family;
- evidence provenance and missing cells;
- duplicate-effort accounting;
- budget and stop-rule compliance;
- authority and promotion boundaries;
- the possibility that `not_supported`, `blocked`, or `no_solution_found` is the correct result.

Closure output contains:

- terminal classification;
- supported, unsupported, blocked, and unresolved claims;
- complete family registry and final states;
- evidence and receipt refs;
- budget/usage accounting or explicit lower-bound labels;
- adversarial findings and their dispositions;
- owner handoffs;
- non-authorizations;
- exact next legal move.

No transcript, peer message, prompt output, mode, or local campaign receipt becomes AK evidence until the authorized evidence owner records and reads it back.

## Execution binding

### Aggregate identity

`adaptive-portfolio-execute` may run only when all of these match an authorized binding:

- template name and immutable entity/version identity;
- owner and visibility posture;
- workflow ID and executor binding version;
- required procedure dependencies;
- input/output schema versions;
- package/runtime lineage;
- canonical approved-plan digest;
- operator-issued launch consent receipt resolved from the owning runtime;
- receipt-bound scope, provider/model allowlist, finite consumable budget, expiry, and idempotency key;
- authorization/preflight receipt.

Missing, duplicate, drifted, unbound, or visibility-incompatible identity fails before child launch.

### Runtime owner split

```text
pi-vault-client
  prepare + authorize exact Vault aggregate
        |
        v
pi-society-orchestrator
  validate manifest + supervise portfolio state + checkpoint + close
        |
        +--> ASC: execute bounded child work and return provenance receipts
        |
        +--> pi-autoresearch: run measured campaigns when the family requires experiments
        |
        +--> source-owner read/review lanes: produce proposals or evidence packets only
        v
AK evidence owner
  explicitly record accepted evidence and lifecycle result
```

The orchestrator stores only workflow-local state and resumable receipts. It does not create a second task database. Checkpoint/resume must be idempotent: a completed allocation or child receipt cannot be charged or applied twice.

### Operator visibility

Status must expose:

- workflow/run ID and exact binding identity;
- current phase and family states;
- active child/campaign owner;
- consumed and remaining budgets;
- duplicate, blocked, reopened, and exhausted counts;
- evidence completeness and lower-bound labels;
- next legal move and stop reason;
- whether any durable owner action remains unperformed.

Communication surfaces such as visible peers and intercom are transport only. Durable progress lives in runtime receipts and accepted owner evidence.

## Direction-to-execution transitions

```text
SF7/IW8 active
-> 4162 design + lifecycle gate
-> 4163 Prompt Vault owner artifacts
-> 4164 exact Pi workflow binding
-> 4165 fixed and real proving ground
-> [4166 mode decision || 4167 governed Espanso projection]
-> 4168 convergence audit
-> explicit SF7/IW8 lifecycle gate or named next wave
-> FCOS coordination readback/close only after owner-native evidence
```

No step may infer the next lifecycle transition from file presence or task count.

## Fixed execution leaves

### Task 4163 — Prompt Vault artifacts

**Owner:** `/home/tryinget/ai-society/core/prompt-vault`

**Consumes:** this assessed design packet and exact overlap/delta audit.

**Produces:** versioned `adaptive-portfolio-plan` and quarantined `adaptive-portfolio-execute` entities; canonical retrieval and dispatch-posture readback; fresh-context handoff for `4164`.

**Acceptance:** owner `./verify.sh`; exact query/retrieve; text-safe versus workflow posture proof; independent prompt-governance/anti-duplication review.

**Evidence classes:** `prompt_vault_entity_versions`, `dispatch_posture`, `owner_validation`, `independent_review`.

**Non-authorization:** no Pi binding, execution, mode, task evidence, or publication beyond Prompt Vault owner semantics.

### Task 4164 — Pi runtime binding

**Owner packages:** `pi-vault-client`, `pi-society-orchestrator`, `pi-autonomous-session-control`, and `pi-autoresearch` only where their declared seams apply.

**Consumes:** exact task-4163 identities and dispatch posture.

**Produces:** immutable binding; bounded supervisor; registry/lifecycle/allocation/checkpoint/closure implementation; correlatable receipts and operator status.

**Acceptance:** focused state/budget/resume/fail-closed tests; every touched package's complete checks and release/compatibility gates; isolated installed live bound invocation; unbound/drifted rejection; independent runtime review.

**Evidence classes:** `unit_integration_tests`, `installed_runtime_proof`, `dispatch_receipt`, `independent_review`.

**Non-authorization:** no Prompt Vault mutation, external spend without consent, AK acceptance, mode promotion, or second execution runtime.

### Task 4165 — proving ground

**Owner packages:** `pi-evalset-lab`, `pi-autoresearch`, and `pi-society-orchestrator` as applicable.

**Required cases:** local code defect; cross-package architecture issue; authority-boundary problem; high-uncertainty research task; correct `blocked/not_supported` outcome.

**Baselines:** normal society-integrator reasoning; `many-of-the-greats` or equivalent text-safe reasoning; fixed fanout; adaptive workflow.

**Measures:** mechanism diversity; duplicate effort; blocker precision; unsupported completion claims; evidence quality; useful findings per cost; operator intervention; correct stopping.

**Acceptance:** complete fixed manifest; exact model/runtime identities and budgets; no missing/duplicate attempts; usage accounting or lower-bound labels; adversarial audit of an apparent success and blocked case; checked-in owner proving-ground report. The report must also freeze the cases, metrics, and explicit-invocation baseline that task `4166` will reuse for a paired candidate-mode decision.

**Evidence classes:** `eval_matrix`, `runtime_receipts`, `cost_usage`, `adversarial_audit`.

**Non-authorization:** passing results do not promote modes, shortcuts, learning, or production use.

### Task 4166 — mode decision

**Owner:** `pi-modes`.

**Decision:** from task-4165 evidence, choose either no mode or a concise `append` posture. A mode is justified only when persistent posture adds measured value beyond explicit task-local Vault invocation.

Before promotion, task `4166` may materialize a non-live candidate definition in its isolated owner lane and must run a paired comparison on the task-4165 frozen cases: explicit Vault invocation with no mode versus the same invocation with the candidate append mode. The model/runtime, input, workflow binding, and budgets remain identical. Predeclared gates require zero authority or prompt-duplication violations, no regression in blocker precision or correct stopping, bounded prompt overhead, and a decision-useful improvement beyond measured noise in at least one operator metric such as intervention count or contract adherence. Failure or inconclusive evidence means no promotion.

**If promoted:** preserve host prompt, AGENTS, skills, date, and cwd; contain no workflow body; disclose exact composition; install, reload, and verify a real turn.

**Acceptance/evidence:** paired candidate-mode evaluation, promotion/no-promotion decision, full package/release validation, exact preview, authority review, and live runtime proof only for a shipped change.

**Rollback:** `/mode off` or remove/disable the optional mode without affecting Vault or workflow binding.

### Task 4167 — Espanso projection

**Owner:** `/home/tryinget/ai-society/softwareco/infra/provisioning` and its resolved Chezmoi/dotfiles surface.

**Consumes:** task-4165 evidence and exact Vault/Pi target identities.

**Produces:** machine-readable entrypoint manifest; governed disposition of `:pv`, `:fb`, `:rp`, `:ak`, `:mg`, and related triggers; generated YAML preview/apply/rollback/drift path.

**Acceptance/evidence:** owner resolution, provisioning validation, target/posture validation, generated-config validation, previewed managed diff, and rollback instructions.

**Non-authorization:** no reusable prompt bodies, direct `~/.config/espanso` mutation as completion, hidden execution, dispatch bypass, or implicit consent.

### Task 4168 — convergence closeout

**Owner:** pi-extensions root documentation plus AK/owner readbacks.

**Consumes:** tasks `4162–4167`, Prompt Vault versions, runtime receipts, proving-ground matrix, mode decision, provisioning result, close-checks, and FCOS coordination posture.

**Produces:** `docs/project/2026-07-25-ai-society-prompt-operating-system-closeout.md`; verdict `converged`, `partially_converged`, `blocked`, or named next wave; exact but unapplied lifecycle gate.

**Acceptance/evidence:** task close-checks; direction/packet/decision checks; strict docs; independent goal-convergence audit; owner-handoff status.

**Non-authorization:** the audit cannot itself close `SF7/IW8`, FCOS, publication, or learning promotion.

## Acceptance scenarios

### Scenario: text-safe planning

```gherkin
Given adaptive-portfolio-plan is visible to the caller
When it is retrieved and interpreted without an execution binding
Then it may produce only a reviewable plan and family registry
And it must not launch, mutate, record evidence, or imply authorization
```

### Scenario: missing executable binding

```gherkin
Given adaptive-portfolio-execute exists in Prompt Vault
And no exact authorized executor binding exists
When any Pi ingress attempts execution
Then dispatch fails before child launch
And the result identifies the missing or drifted aggregate identity
```

### Scenario: semantic duplicates

```gherkin
Given two proposed families use different personas or wording
But share mechanism, distinguishing prediction, falsifier, and target
When the registry is validated
Then one is marked duplicate or they are merged
And duplicate output cannot count as diversity or novel evidence
```

### Scenario: truthful blocked outcome

```gherkin
Given a family requires unavailable owner authority or evidence
When the portfolio reaches that boundary
Then it records owner, reason, evidence, next legal move, and reopen trigger
And it does not claim completion or silently route around the owner
```

### Scenario: adaptive allocation

```gherkin
Given multiple admitted mechanism-distinct families and a finite budget
When one family yields repeated covered findings and another has an untested distinguishing prediction
Then the next allocation changes based on marginal evidence gain
And the receipt records why alternatives were not selected
```

### Scenario: adversarial success audit

```gherkin
Given one family appears to satisfy the objective
When closure is requested
Then an independent reviewer attacks the causal claim, evidence, discarded routes, budget, and authority boundary
And closed_supported is unavailable until findings are resolved or explicitly block closure
```

### Scenario: no mode promotion

```gherkin
Given task 4165 does not show durable benefit from persistent posture
When task 4166 decides promotion
Then it records no-promotion
And Vault and explicit task-local invocation remain sufficient
```

### Scenario: shortcut safety

```gherkin
Given an Espanso trigger targets a workflow-grade template
When generated configuration is validated
Then the expansion identifies the exact Pi/Vault command and dispatch check
And cannot contain the workflow body or bypass consent
```

## Validation plan

Task `4162` closes only after:

1. `ak direction check --repo /home/tryinget/ai-society/softwareco/owned/pi-extensions --machine` passes;
2. this document is committed on the verified clean integration baseline;
3. an AK `design` packet identity is registered with typed links and `ak packet check` passes;
4. strict docs validation passes;
5. an independent architecture and authority-boundary reviewer confirms every later task is executable from fresh context;
6. evidence classes `design_packet`, `packet_identity`, `direction_readback`, and `independent_review` are recorded and read back.

## Packet identity and typed links

Register with all required fields:

```bash
ak packet register --repo /home/tryinget/ai-society/softwareco/owned/pi-extensions \
  --key ai-society-prompt-operating-system-v1 \
  --kind design \
  --state assessed \
  --source-ref docs/project/2026-07-25-ai-society-prompt-operating-system-design.md \
  --title 'AI Society prompt operating system — adaptive-portfolio design' \
  --summary 'Assessed SF7/IW8 owner-split design for text-safe adaptive planning, fail-closed workflow execution, measured proving, and separate promotion gates.'
```

Create one link per exact target using `ak packet link --repo <repo> --kind <kind> --target <target> --authority-mode <mode> ai-society-prompt-operating-system-v1`:

| Kind | Exact target | Authority mode | Meaning |
|---|---|---|---|
| `strategic_frame` | `SF7` | `canonical` | Active strategic frame |
| `implementation_wave` | `IW8` | `canonical` | Active implementation wave |
| `task` | `task:4162` | `canonical` | Design/lifecycle execution authority |
| `task` | `task:4163` | `reference_only` | Prompt Vault owner leaf |
| `task` | `task:4164` | `reference_only` | Runtime binding leaf |
| `task` | `task:4165` | `reference_only` | Proving-ground leaf |
| `task` | `task:4166` | `reference_only` | Mode-decision leaf |
| `task` | `task:4167` | `reference_only` | Provisioning/Espanso leaf |
| `task` | `task:4168` | `reference_only` | Convergence-closeout leaf |
| `decision` | `decision:44` | `reference_only` | Checkpointed campaign-automation context |
| `decision` | `decision:56` | `reference_only` | Fail-closed Vault dispatch context |
| `packet` | `pi-vault-fail-closed-dispatch-v1` | `reference_only` | Existing binding design precedent |
| `prompt_vault` | `meta-orchestration` | `reference_only` | Existing phase-navigation procedure |
| `prompt_vault` | `many-of-the-greats` | `reference_only` | Text-safe diversity baseline |
| `prompt_vault` | `deep-review` | `reference_only` | Adversarial closure procedure |
| `prompt_vault` | `goal-convergence-audit` | `reference_only` | Convergence closeout procedure |
| `prompt_vault` | `prompt-reality-convergence` | `reference_only` | Real-surface convergence procedure |
| `prompt_vault` | `pi-autoresearch-setup` | `reference_only` | Measured setup procedure |
| `prompt_vault` | `pi-autoresearch-next-hypothesis` | `reference_only` | Family-local next-move procedure |
| `prompt_vault` | `pi-autoresearch-finalize` | `reference_only` | Measured finalization procedure |
| `prompt_vault` | `layer12-040-direction-to-execution-ak-native` | `reference_only` | AK-native D2E procedure |
| `prompt_vault` | `repo-direction-to-execution` | `reference_only` | Repo D2E procedure |
| `prompt_vault` | `execution-memory-transfer` | `reference_only` | Execution-memory handoff procedure |
| `prompt_vault` | `execution-chain-overview` | `reference_only` | Earliest-entry procedure |
| `prompt_vault` | `adaptive-portfolio-plan` | `reference_only` | Proposed text-safe owner artifact |
| `prompt_vault` | `adaptive-portfolio-execute` | `reference_only` | Proposed quarantined workflow artifact |
| `fcos` | `ai-society-prompt-operating-system-d2e` | `projection_only` | Layer-5 coordination identity only |
| `source_owner` | `softwareco/infra/provisioning` | `reference_only` | Espanso/Chezmoi owner handoff |

Task `4162` must use these exact rows and verify the canonical accepted link kinds with `ak packet check`; it may not group targets or replace them with placeholders.

## Rollout

1. **Design gate:** complete task `4162`; no runtime effect.
2. **Vault seed:** task `4163` inserts/version-controls the two selected artifacts and proves posture. Workflow stays quarantined.
3. **Binding dark launch:** task `4164` lands disabled/exact-binding behavior, focused tests, and isolated installed proof. Existing workflows remain intact.
4. **Proving ground:** task `4165` runs fixed and real cells within explicit consent and budgets.
5. **Separate projections:** tasks `4166` and `4167` independently decide mode and shortcut consequences from evidence.
6. **Convergence:** task `4168` audits owner-native facts and proposes the explicit lifecycle transition.

Promotion requires evidence at each owner boundary. There is no wave-wide "enable everything" switch.

## Rollback

| Layer | Rollback |
|---|---|
| Design | Revert/supersede this doc and packet identity; no runtime effect |
| Prompt Vault plan | Revert entity version through Vault owner tooling |
| Prompt Vault workflow | Quarantine/disable the exact version; text-safe plan may remain |
| Pi binding | Remove/disable workflow registration and binding while preserving existing dispatch enforcement |
| Runtime campaign | Stop at checkpoint; retain bounded receipts; do not promote |
| Mode | `/mode off` or remove optional definition |
| Espanso | Revert through provisioning/Chezmoi preview/apply owner path |
| AK/FCOS | Record lifecycle/evidence corrections through their owners; never hand-edit projections |

Rollback does not erase evidence or history. It restores execution posture and records the disposition.

## Explicit non-goals and non-authorizations

- no universal prompt body in repo docs;
- no second task, evidence, subagent, experiment, Vault, or promotion runtime;
- no fixed number of agents as a proxy for epistemic diversity;
- no unbounded persistence, wall-clock promise, or automatic "continue until solved";
- no assumption that a solution exists;
- no silent owner-boundary bypass;
- no automatic AK, KES, ontology, FCOS, publication, mode, or shortcut promotion;
- no direct active Espanso configuration mutation;
- no model spend without explicit consent;
- no success claim from longer output, task count, passing local tests, or transcript presence.

## Fresh-context handoff

A fresh task `4163` session must:

1. read this packet and task `4163`'s current AK contract;
2. query/retrieve the exact existing Vault templates named in the overlap audit;
3. confirm `adaptive-portfolio-plan` and `adaptive-portfolio-execute` do not already exist or reconcile them explicitly if they now do;
4. preserve the two-artifact split and avoid adding a router;
5. use Prompt Vault owner tooling in an isolated clean owner lane;
6. leave exact entity versions, dispatch posture, validation, independent review, and a task-4164 handoff in AK evidence.

Stop and record a blocker rather than changing the artifact split, weakening workflow quarantine, widening visibility, inventing router vocabulary, or mutating Pi runtime from task `4163`.
