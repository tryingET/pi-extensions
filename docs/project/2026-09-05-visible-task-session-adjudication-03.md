---
summary: "Decision151 many-of-the-greats adjudication after real local owner input: bounded AK custody rather than manual freeze, sealed local SDK host, same-Codex limits and positive writer enrollment."
read_when:
  - "Understanding the root-cause and second/third-order reasoning behind RFC03's changed contracts."
type: "decision_support"
task_id: 5451
---

# Visible task sessions — adjudication03

## QUESTION

What must replace the unresolved coordination/enforcement assumptions so the selected local task worker has an owner-supported, testable architecture—without inventing upstream approval, delegated identity or operational proof?

This continues the original [adjudication02](2026-09-05-visible-task-session-adjudication-02.md), not a repeated review. Prompt Vault `many-of-the-greats` was retrieved and dispatch-checked `text_ok`. The schools are reasoning positions, not quotations or independent owner votes. Actual local technical dispositions come from operator-delegated tasks5462/5463/5464, recorded separately. They authorize proposed-contract judgments, not ADR acceptance or live changes.

## MODE 1 — MANY OF THE GREATS

### School 1: Linearizability and capability lifetime

- Core claim: a cross-call guarantee requires an actual serialization interval whose lifetime reaches the claimed boundary.
- Premises: task, companion, dependency and decision facts have separate writers; lock release and message delivery can fail independently; time continues during a lock.
- Strongest case: read/claim/read under separate locks cannot exclude a companion update. A broker reply cannot stop a delayed host after the broker dies. Bind the actual canonical lock to the sealed host's terminal admission state, with explicit failure custody.
- What it sees that others miss: nominal reads may trigger maintenance, and a shared descriptor does not prevent an erroneous explicit unlock. A concurrency promise must cover allowed-call effects and failure lifetimes, not just happy-path ordering.

### School 2: End-to-end ownership and minimum sufficient mechanism

- Core claim: place each guarantee at the narrowest owner that can actually enforce it; reuse the SDK and task claim without recreating their institutions.
- Premises: first use is one trusted local account, fresh pending tasks and a deliberately constrained visible interface. Upstream stock-TUI parity and authenticated delegation are not required.
- Strongest case: a sealed local SDK host can keep execution handles private and mediate its own ingress. AK can own a closed interval without becoming a terminal service. Neither a universal daemon nor an upstream-host approval dependency is needed for that local allocation.
- What it sees that others miss: calling an integration gap “upstream authority required” can create a fictional blocking dependency. Conversely, labeling an optional extension as a host does not confer control of all execution paths.

### School 3: Resilience engineering and operational custody

- Core claim: an exclusion mechanism is only as complete as the population that participates in it, and its failure state must remain recoverable.
- Premises: legacy scripts, editors, controllers, candidate worktrees, automation and external effects coexist; unknown effects cannot safely expire.
- Strongest case: positively establish a bounded writer domain and account for prior work before enrollment. Preserve inspection during failure and withdrawal. Refuse unknown custody rather than prove absence from an empty new registry.
- What it sees that others miss: safe orphan retention shifts risk into indefinite blockage and encourages bypass. Automatic recovery jobs can become competing writers; disabling them creates a backlog elsewhere.

### School 4: Semantic fidelity and user-value preservation

- Core claim: a safe system that quietly changes the requested provider, account, objective or usable workflow solves the wrong problem.
- Premises: the operator wants an explicitly selected Astra/Codex task, not whichever API is easiest to intercept; serialization, compression, auth refresh and retries have distinct effect paths.
- Strongest case: preserve the native subscription/model/account, guard the actual send and disclose unsupported transport/auth behavior. A Codex SSE restriction can retain need fit; silently substituting commercial API billing cannot.
- What it sees that others miss: passing an onPayload hook is not guarding WebSocket sends or OAuth refresh. Credential lifetime, no compaction and no retries materially change task usefulness even when every denial is correct.

## MODE 2 — CONFRONTATION

### Clash 1: Separate native calls vs actual custody

- Fundamental contradiction: separate per-command locks cannot supply no-concurrent-writer startup admission.
- Incompatible assumptions: “ordinary gate unchanged” and “one exclusion interval through local admission” cannot both be true for the inspected implementation.
- Stronger explanation: lifetime-based serialization explains companion drift, broker death and recovery races. Minimal-call reuse explains low cost, but leaves those cases unresolved.
- Decision: reject the unspecified manual freeze. Select new AK-owned closed startup/recovery interval semantics while preserving native asserted-local claimability. This adds real owner work; it does not pretend current commands suffice.

### Clash 2: Stock Pi flexibility vs exclusive supported host

- Fundamental contradiction: arbitrary extensions, commands, session switching and raw SDK handles cannot remain available while a small wrapper claims exclusive admission.
- Incompatible assumptions: unchanged stock InteractiveMode and the selected no-bypass profile cannot coexist without a different host contract.
- Stronger explanation: the sealed local SDK composition supplies an explicit controllable boundary; upstream modification is unnecessary for that bounded interface.
- Residual tension: missing capabilities and context/credential limits may make some tasks unsuitable. Those tasks must be refused or motivate a later accepted expansion, not silently rerouted to ordinary Pi.

### Clash 3: Global safety language vs bounded custody

- Fundamental contradiction: local reservation indexes do not control unmodified writers or prove unknown prior effects absent.
- Incompatible assumptions: deferred legacy replacement and unrestricted concurrent legacy use cannot support enrolled-domain exclusion.
- Decision: retain migration deferral only for translation/replacement, not minimum enrollment/support-withdrawal controls. Use positive existing-domain custody. AK authority-writer custody remains separate from common-Git workspace custody.
- Residual tension: common dependencies and DB-wide recovery can make a supposedly small enrollment affect unrelated work. The cost must be explicit and measured.

### Clash 4: Provider feasibility witness vs intended subscription

- Fundamental contradiction: a guardable OpenAI API path does not establish guardability of the intended Codex OAuth/WS path.
- Decision: treat the former only as a witness. Select the source-feasible same-Codex SSE/no-refresh/no-retry composition with actual-fetch and compressed-body validation. Unsupported WS/refresh is disclosed, not substituted or claimed covered.
- Residual tension: a short remaining credential lifetime can prevent a useful run. Separate account-owner refresh before a new lawful attempt is allowed by its own authority; automatic refresh is not smuggled into bootstrap.

## MODE 3 — INTEGRATION OR DECISION

- Chosen path: **Contextual Dominance**.
- Result: retain B identity assurance; require actual AK-owned interval custody for startup consistency; use the sealed local SDK host for run-origin enforcement; enroll a closed cooperative writer domain; preserve exact Codex identity with explicitly limited transport/auth support.
- Why justified: actual delegated owner source investigations identified both a false obstacle (upstream approval for a local SDK composition) and a real missing mechanism (multi-call authority custody/no-maintenance mode). Removing the former does not excuse the latter.
- What remains unresolved: implementation and actual deployment eligibility. The proposal is not the current runtime. Exact installed identities, writer/trigger custody and fault/canary evidence remain required before affected use. A fresh exact-candidate review still determines ADR readiness.

## Root causes and level-2 consequences

| Root cause / correction | First-order result | Second/third-order effect | Required counterpressure |
|---|---|---|---|
| Owner roles were unspecified; explicit local delegation now exists | Concrete accept/reject/condition inputs instead of generic review repetition | Role assignment can become approval theater if evidence/conditions are omitted | Bind each source-owner task, RFC hash, source generation and exact conditions; no majority-vote synthesis |
| Per-call locking was mistaken for an interval | New owner-local T0–T2 protocol | A stalled holder can deny unrelated AK access | No remote work/maintenance inside interval; out-of-band inspector; holder-failure drills and contention measurement |
| Nominal read was assumed effect-free | Closed no-maintenance baseline mode | More admission refusals on brownfield state | Explicit repair-required refusal and separate maintenance route; never opportunistic repair disguised as launch |
| Lease recovery was treated independently of worker effects | Protected-attempt stop-and-dispose discipline | Suspended DB-wide recovery accumulates unrelated expired tasks and bypass pressure | Named trigger custodian/reinstatement condition, backlog and recovery-effort visibility; no hidden global freeze |
| Optional host hooks confused with exclusive execution | Sealed local SDK composition | Reduced interface and task-length limits can push users outside supported paths | Plan exposes omissions and budgets; evaluate representative task usefulness, not merely successful denial |
| One payload hook confused with all network effects | Same-Codex guarded SSE plus read-only auth | Credential expiry can stop otherwise valid work; no retry hurts resilience | Explicit lifetime/refresh-threshold bound; never alternate account/provider or implicit refresh; future expansion needs accepted coverage |
| Migration deferral confused with coexistence permission | Non-deferred enrollment/support withdrawal | Common-Git custody reduces parallel throughput and can strand a monorepo | Positive roster, independent-domain work only, compatible inspector and explicit unresolved-state escalation |

No empirical performance, recovery-time or fleet-reliability result is claimed. These are mechanism-grounded predictions to challenge in post-ADR validation. The need for new implementation is disclosed rather than converted into pre-ADR code momentum.

## Answers to the open questions

1. **Who coordinates authority writers?** The AK-owned startup/recovery interval serializes all participating canonical DB calls during T0–T2; positive enrollment accounts for bypass/trigger routes. After unlock, affected writers follow stop-and-dispose-before-change, including bulk recovery restrictions. Current per-command gate does not implement this.
2. **What stops supported task turns?** A sealed local SDK host with private execution handles, frozen resource/provider profile, one-shot local admission, bound CLOSED and downstream actual-send/tool assertions. It is neither stock Pi parity nor hostile same-UID containment.
3. **What permits recovery?** Correlated host future-dispatch closure and effect disposition first; then owner-only exact-tuple read/unclaim/readback under a new recovery interval. Drift/uncertainty stays blocked. T1, ACK, lease or task status alone is insufficient.
4. **How is workspace overlap controlled?** Independent task and common-Git/overlap domains plus positive lane/candidate/controller/external writer custody. An empty namespace is not enrollment evidence. No caller can narrow keys or force unlock.
5. **What survives withdrawal?** Compatible read-only inspection and unresolved history, while new supported admissions and legacy fallback remain disabled for the domain. Claim/effect recovery and trigger reinstatement remain separately owned.

## PRACTICAL CONSEQUENCE

Incorporate the actual conditional owner choices in RFC03, explicitly replacing the manual-freeze premise and ambiguous upstream-host wording. Verify the supplied owner transcriptions, preserve all earlier candidates/reviews, bind the changed candidate and its conditions, then use one fresh current-track review. No unchanged cycle, owner-vote simulation, ADR acceptance or runtime action follows from this adjudication.
