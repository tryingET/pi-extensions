---
summary: "Decision151 revision reasoning: many-of-the-greats adjudication, root causes, second-order consequences and concrete answers under operator-selected trusted-local first use."
read_when:
  - "Reviewing why Decision151 selects non-delegating local task workers without weakening mandatory startup or recovery."
  - "Challenging second-order effects of conservative exclusion, constrained startup and legacy withdrawal."
type: "decision_support"
task_id: 5451
---

# Visible task sessions — adjudication 02

## QUESTION

How can a trusted local operator start an exact fresh task visibly from different harnesses, without mistaking launch for authority, optional hooks for enforcement, or silence for permission to retry?

This is proposal-stage reasoning under task5451, not owner ratification or ADR acceptance. The operator explicitly selected **fresh, unclaimed tasks on a trusted single-user workstation; refuse parent-held task transfer** in the scope interview. That resolves the use-case ambiguity; it does not approve new AK/Pi contracts. Deferral270 was released and task5451 claimed through the approved AK gate. The original [RFC](2026-09-05-visible-task-session-authority-startup-rfc.md) and [attempt624 review](2026-09-05-visible-task-session-rfc-review-01.md) remain immutable.

Prompt provenance: Prompt Vault `many-of-the-greats`, retrieved and dispatch-checked `text_ok`; registry `a5920542375bf4e3c6f09b22c081b8cff29cad5f73da592ad43c9cde8ad57917`. The schools below are arguments, not quotations, simulated endorsements or independent owner votes. “Level 2” means examining incentives, adaptation, feedback and delayed consequences of the first-order design choice—not merely adding another feature or another approval layer.

## MODE 1 — MANY OF THE GREATS

### School 1: Least authority and complete mediation

- Core claim: a security boundary exists only where every relevant execution path must cross an enforcing reference monitor.
- Premises: callers can omit handlers, handlers can fail, alternate paths exist, and permissions must bind the actual operation rather than its label.
- Strongest case: a perfect check on an optional route is no protection against the unchecked route. Admission must be denied by default at the host execution boundary, after effective inputs are known. Failure of admission infrastructure must not become implicit permission.
- What it sees that others miss: a prompt hash can preserve the wrong thing; admitting original text does not admit a transformed objective. Local actor labels do not authenticate delegation. Preventing model execution does not prevent trusted extensions from reading files.

### School 2: End-to-end design and contextual minimalism

- Core claim: build the guarantee the real participants need, at its actual owner; do not purchase an identity platform to solve a discovery failure.
- Premises: the first deployment is one cooperative local account; AK already atomically claims pending tasks; no existing claimant needs transfer in the selected use case.
- Strongest case: authenticated delegation adds credentials, revocation, migration and support obligations while solving an excluded case. A small shared transport plus an honest local claim adapter has fewer states to misunderstand and fewer owners to coordinate.
- What it sees that others miss: assurance inflation is itself a failure mode. A stronger-sounding contract can prevent useful delivery indefinitely and drive operators back to unsafe scratch scripts.

### School 3: Distributed systems and durable uncertainty

- Core claim: independent owners cannot be made atomic by arranging their calls sequentially. A missing reply leaves knowledge incomplete, not effects absent.
- Premises: persistence, process creation, claim, message release and external task effects have different failure boundaries. A dead controller can leave a living worker or already-committed remote effects.
- Strongest case: write durable intent before dispatch; preserve unresolved generations; choose explicit reconciliation over automatic retry. Task ownership and operational exclusion answer different questions and must both hold.
- What it sees that others miss: idempotent request IDs do not prevent two different IDs from launching the same work. A valid new lease cannot fence an old process. Different tasks can conflict in one checkout even when both claims are legal.

### School 4: Resilience engineering and human supervisory control

- Core claim: a refusal is safe only if people can understand and recover from it without circumventing the system.
- Premises: humans face deadlines, stale evidence and partial visibility; an opaque permanent block invites bypasses. Automation changes operator behavior and workload.
- Strongest case: make denied, unavailable and indeterminate outcomes distinct; expose exact attempt identity, affected workspace, owner route and missing evidence. Recovery is a supported contract, not a cleanup script hidden behind a red status.
- What it sees that others miss: high safety margins can concentrate risk into manual recovery. Conservative serialization moves contention rather than eliminating it; withdrawal that disables inspection destroys the information needed to recover safely.

## MODE 2 — CONFRONTATION

### Clash 1: Complete mediation vs contextual minimalism

- Fundamental contradiction: whether untrusted requester impersonation belongs inside this first release's threat model.
- Incompatible assumptions: authenticated delegated actors cannot be promised while accepting self-asserted local identity as equivalent.
- What mediation explains better: why optional input hooks and launch-local tokens cannot supply the claimed enforcement.
- What minimalism explains better: why parent-to-child delegation is unnecessary for an operator-selected fresh unclaimed task.
- Residual tension: hostile same-UID code remains outside the supported trust model. This is an explicit exclusion, not an implementation defect patched with an extra nonce. Complete mediation still governs the supported host task-turn path.

### Clash 2: Durable uncertainty vs frictionless recovery

- Fundamental contradiction: automatic retry under ambiguous effects cannot simultaneously guarantee no duplicate worker.
- Incompatible assumptions: “probably stopped” and “proved safe to overlap” cannot be interchangeable.
- What durable uncertainty explains better: delayed workers, response loss and cross-generation duplicates.
- What supervisory control explains better: why a system with no usable reconciliation route will be bypassed.
- Residual tension: evidence may never become sufficient. The correct result can remain blocked. The design must identify an owner escalation path, but cannot manufacture quiescence to meet an availability target.

### Clash 3: Fine-grained throughput vs conservative shared-state exclusion

- Fundamental contradiction: disjoint task IDs or nominal path scopes do not imply independent effects on Git metadata, generated files, dependencies or external systems.
- Incompatible assumptions: whole-checkout safety cannot rely solely on a per-task lock.
- What conservative exclusion explains better: accidental overlap and shared Git state under cooperative callers.
- What throughput optimization explains better: lost parallelism and pressure to split tasks merely to evade contention.
- Residual tension: finer concurrency needs evidence-backed conflict semantics. It is a later decision, not a v1 hidden override. Separate candidate workspaces still require their existing lifecycle owner; this RFC does not create them.

## MODE 3 — INTEGRATION OR DECISION

- Chosen path: **Contextual Dominance**.
- Result: choose trusted-local non-delegating workers for the selected first use; retain complete mediation for supported host task-turn admission, durable exclusion under uncertain effects and explicit owner-driven recovery. Do not implement delegated identity or automatic lease-based recovery.
- Why this path is justified: the operator selected a case current asserted-local claimability can address, while source inspection shows startup and effect coordination are independently unsolved. Reducing the identity claim does not reduce either startup safety or crash obligations.
- What remains unresolved: source-owner acceptance of the proposed admission, host enforcement and recovery contracts. No amount of conceptual agreement changes installed Pi or AK behavior. Stronger delegated/remote use remains a separate future decision, not a runtime switch on this profile.

## Root-cause analysis

| Symptom | Causal mechanism | Architectural correction | What would falsify the correction |
|---|---|---|---|
| Scratch script despite existing launcher | Resource presence was confused with cross-harness retrieval and correct session-kind selection | One transport, explicit capability identity and independently testable discovery projection | Cold agents still copy shell recipes or choose fork/scout for fresh-task use |
| Authentication gate cannot be satisfied | Design imported delegation semantics without establishing a transfer use case | Explicit B scope and requirement applicability delta; keep asserted-local honest | A required first-use scenario needs an already-claimed task transferred |
| Awaited hook called fail-closed | Synchronization was confused with mandatory veto; errors and alternate entrypoints continue elsewhere | Host-owned denial-by-default boundary for supported task execution | Missing adapter or command/secondary-turn path reaches model/tool execution |
| Lease rollover creates duplicate risk | Temporal task claim was confused with process/effect fencing | Reservation persists independently across generations until reconciled | Old unresolved attempt and new attempt both dispatch under distinct IDs |
| Tests pass while real CLI changes transport | Dependency injection presence is also a hidden behavior selector | Separate production ports from explicitly test-only controls | Production exec injection still bypasses handshake/placement policy |
| Rollback reopens unsafe launcher | Entry-point removal was confused with withdrawal of all equivalent supported paths | Disable new admission, preserve inspection, refuse legacy fallback | Removing new CLI reactivates direct spawn for the same task/workspace |

Evidence is bounded: discovery documents one concrete retrieval failure; decision inputs document pinned source limitations. These are credible mechanisms, not measured fleet incidence or proof that a proposed fix works.

## Level-2 and multi-order effects

| Choice | First-order benefit | Second-order adaptation / delayed risk | Countermeasure and falsifiable signal |
|---|---|---|---|
| B, no delegation | Avoid new identity infrastructure | Users may release parent claims just to feed the launcher; that conceals transfer and old effects | Refuse unclaim/claim automation; detect retained unresolved attempt history; recovery transcript must not recommend release-to-relaunch |
| Mandatory constrained task profile | Denial is explicit; ambient turn initiators excluded | Missing familiar extensions may tempt manual profile edits; silent context loss changes task quality | Plan shows exact resources, omissions and instruction provenance; profile drift refuses; representative task evaluation must include capability sufficiency |
| Conservative workspace exclusion | Prevent same-checkout overlap | Long-running/stuck task monopolizes workspace; task splitting or alternate profiles become bypass incentives | Explain the exact blocking attempt and recovery owner; no age-based unlock; measure blocked duration and unsafe workaround attempts before any concurrency relaxation |
| Durable history | Crash recovery retains evidence | Accumulated state becomes a privacy and compatibility burden | Private bounded payload capture, diagnostic digests only, inspected retention policy; unsupported schema disables launch but preserves read access |
| Denial on AK unavailability | No admission without current owner facts | AK availability becomes launch availability; mass retries create contention | No automatic launch retry; bounded read/watch with explicit unavailable status; record denial latency independently of task execution latency |
| Stop new admission on withdrawal | Prevent new unsafe work | Operators may assume running tasks also stopped; upgrade can strand history | Distinct admission-disabled and worker-effect status; independent version-compatible inspection; withdrawal drill checks unresolved records survive |
| Discoverable skill/CLI | Less reinvention | Authority may be inferred from a polished command or skill recommendation | Plan labels authority and effect facts separately; cold tests include foreign claimant and indeterminate result, not just successful launch |
| Frozen task envelope | Prevent objective substitution | Excessive context freezing may omit needed project instructions; broad transforms can reintroduce substitution | Bind raw objective separately from ordered instruction/context resources; reject unclassified transforms; validate intended task understanding as well as hash equality |
| Native claim with cooperative startup ordering | Avoid enabling a new task-composition API | Manual coordination can become the dominant startup cost; a checkbox can degenerate into ritual while automatic writers continue | Require owner-defined evidence covering authority writers; refuse when not established; do not market snapshot detection as atomic prevention |
| No first-use compaction/summarization | Removes unreviewed model/context transformation routes | Long tasks stop on context overflow; users may restart in an ordinary session and abandon the protected path | Report task-length/profile limits during plan; test representative context budgets and refusal recovery; expand only with reviewed lineage-preserving compaction semantics |

No metrics above have been measured for the proposed feature. Post-ADR validation must register samples/oracles and record adverse cases, not retrofit a success threshold after seeing results. These consequences justify bounded v1 restrictions; they do not authorize universal supervision, global learning or a new scheduler.

## Answers to the five open questions

1. **Which use case needs transfer?** None in the selected first use. A parent-held task is refused. A later requirement for transfer needs an accepted delegation/revocation contract rather than a release-and-reclaim convenience path.
2. **What stops every supported task turn?** A required Pi host-owned task-session admission boundary, not an optional extension event. It admits one objective, rejects secondary queue/context ingress and checks local run lineage at provider/tool dispatch. This is startup admission and run-origin confinement, not continuous AK revalidation or fencing. The revised RFC specifies denial states and the constrained profile; present installed hooks do not supply that guarantee.
3. **Who recovers after claim succeeds but release fails?** The AK task owner disposes the claim, using host/transport evidence bound to the exact attempt. Little-helpers retains exclusion until that disposition establishes safe recovery. Neither owner alone manufactures facts owned by the other; no automatic unclaim or relaunch.
4. **How are different tasks sharing a checkout arbitrated?** Conservative whole-workspace conflict admission independent of task identity, plus same-task exclusion across workspace aliases. v1 refuses unknown external overlap and candidate-class requests rather than nesting unreviewed candidate locks.
5. **Is legacy replacement included?** Not in the first feature allocation. First activation still requires a lane-owner coexistence disposition excluding unsafe direct-spawn use in the enrolled workspace. A later adapter migration must explicitly translate or refuse every legacy option; absence of the new CLI never selects the old transport.

## PRACTICAL CONSEQUENCE

Produce a distinct revised RFC with selected proposal semantics, a seven-finding disposition map, explicit owner-blocked rows and exact-hash verification. Include small behavioral examples and a deployment/discovery table. Seek fresh independent challenge only after the revised candidate is frozen; treat another owner-blocked verdict as information, not a reason to invent acceptance. No runtime implementation, package activation, policy rewrite or ADR is part of this reasoning artifact.
