---
summary: "Many-of-the-greats reevaluation of decision 116 task 4720, retaining the accepted task while deferring execution for a no-code review-value experiment."
read_when:
  - "Reevaluating or resuming task 4720 under AK decision 116."
  - "Deciding whether agent_vent cadence requires snapshot/migration/locking infrastructure before review value is demonstrated."
system4d:
  container: "Post-ADR cognitive reevaluation of the first execution slice."
  compass: "Preserve the accepted architecture while matching implementation cost to demonstrated product value."
  engine: "Stage strongest schools -> force confrontation -> choose contextual dominance -> retain scope but defer execution."
  fog: "Accepted architecture and technically rigorous plans can create momentum beyond the evidence."
---

# Many of the greats — decision 116 task reevaluation

Status: **decision-support analysis; not canonical reevaluation until recorded through AK**.

## QUESTION

Should AK task 4720 remain valid and execute now, or remain architecturally valid but be deferred until a no-code review-value experiment using existing `agent_vent` surfaces reduces the product uncertainty?

## MODE 1 — MANY OF THE GREATS

### School 1: Toyota/Deming empirical economy

- **Core claim:** Build only the next mechanism needed to expose product truth; everything else is inventory and untested assumption.
- **Premises:** The evidence contains six singleton groups, no candidate incidents, and no demonstrated review-to-owner value. The largest uncertainty is whether review itself is useful, not whether durable identity can survive future authoritative handoff.
- **Strongest case:** A pull-based advisory cadence can test whether operators actually review, dismiss, or act. RFC 8785 manifests, non-rebuildable identity baselines, global mutation locks, fsync recovery, and projection rebuilding solve future correctness problems before the product loop has earned them.
- **What it sees that others miss:** Correct infrastructure can still be waste when it protects a workflow nobody values.

### School 2: Gray/Lamport durable-state correctness

- **Core claim:** Once review, approval, and owner receipts bind to a group, identity and crash semantics are not optional; correctness must precede authority.
- **Premises:** Mutable recurrence keys, curation, duplicate ids, archive/restore, and multi-file writes can silently attach review or approval to the wrong facts.
- **Strongest case:** Retrofitting identity after records and approvals accumulate is harder and riskier than establishing canonical lineage first. A stale cadence can train operators to distrust the system before adoption begins.
- **What it sees that others miss:** "Local advisory" state can become de facto authority through repeated use even when documentation denies it.

### School 3: Saltzer/Schroeder least authority

- **Core claim:** No local command path, pointer, or derived state should gain authority it cannot prove.
- **Premises:** `set_review` is local disposition, Pi command-path markers are forgeable, and owner systems remain canonical.
- **Strongest case:** The accepted ADR correctly requires explicit mediation, trusted origin, separate receipts, and fail-closed effects. The first slice must not create a shadow human-review or owner-acceptance system.
- **What it sees that others miss:** Product convenience is the usual route by which advisory state quietly becomes authority.

### School 4: McIlroy/Pike local-first simplicity

- **Core claim:** Prefer a pure read projection over existing append-only facts; introduce new durable state only when irreducible.
- **Premises:** Current records and review events already contain enough data for a bounded current-state cadence projection. New services, ledgers, and synchronization layers add failure modes.
- **Strongest case:** One pure cadence module, explicit uncertainty labels, and existing command surfaces can produce a useful experiment. If freshness cannot be determined, say `freshness_unknown` and place the group back into attention rather than inventing durable identity now.
- **What it sees that others miss:** The cleanest recovery protocol is often having no new state to recover.

### School 5: Ashby/cybernetic closure

- **Core claim:** A feedback system is incomplete until action and outcome change the next decision.
- **Premises:** Capture volume is not the goal. The loop must observe review coverage, usefulness, burden, and follow-through.
- **Strongest case:** Neither a sophisticated snapshot substrate nor a cadence command proves value. The first execution slice must include a falsifiable review-value experiment and an explicit proceed/revise/stop rule.
- **What it sees that others miss:** Technical completion without measured behavioral response is an open loop.

## MODE 2 — CONFRONTATION

### Clash 1: Empirical economy vs durable-state correctness

- **Fundamental contradiction:** Whether correctness infrastructure should precede evidence that the protected workflow matters.
- **Incompatible assumptions:** Toyota/Deming treats future authoritative handoff as an unearned hypothesis; Gray/Lamport treats identity retrofitting as unacceptable latent debt.
- **What empirical economy explains better:** Six singleton groups, sparse review, and the risk of building a miniature transaction system around an unproven inbox.
- **What durable-state correctness explains better:** Why mutable keys and crash drift cannot support trustworthy approval or historical cohort claims.
- **Residual tension:** Advisory cadence can defer authoritative identity only if it makes no historical, human-review, or owner-effect claim.

### Clash 2: Local-first simplicity vs security rigor

- **Fundamental contradiction:** Whether a simple projection is safe enough when operators may over-read its meaning.
- **Incompatible assumptions:** Simplicity trusts explicit uncertainty language; security assumes repeated UI output will acquire authority regardless of disclaimers.
- **What simplicity explains better:** Existing `review`, `outcomes`, and `compare` surfaces can test operator value without adding another projection or command.
- **What security explains better:** Any new cadence status without the ADR's identity substrate could become a shadow freshness/decision surface.
- **Residual tension:** The evidence experiment should use existing local-disposition wording and operator-attested encounters, not add pre-ADR-equivalent cadence semantics.

### Clash 3: Technical substrate vs cybernetic value

- **Fundamental contradiction:** Whether implementation success is defined by invariants or by changed operator behavior.
- **Incompatible assumptions:** Engineering completion can be proven immediately; product value requires a cohort and time.
- **What substrate engineering explains better:** Deterministic tests, failure behavior, and release safety.
- **What cybernetics explains better:** Why none of those facts justify starting the accepted Phase 1 implementation until existing review behavior has produced a bounded value signal.
- **Residual tension:** Architecture validity and execution timing are separate decisions.

## MODE 3 — INTEGRATION OR DECISION

- **Chosen path:** Contextual Dominance
- **Result:** Toyota/Deming, McIlroy/Pike, and Ashby dominate execution timing: first run a no-code review-value experiment using the already-landed review surfaces. Gray/Lamport and Saltzer/Schroeder continue to dominate the accepted Phase 1 implementation contract: if implementation starts, it must retain the ADR's canonical identity, migration, lock, and fail-closed correctness. No stateless cadence substitute is authorized.
- **Why this path is justified:** It preserves the accepted ADR and task scope while refusing to confuse architectural validity with immediate priority. The existing task's AK scope, done contract, guardrails, and decision link are complete and remain valid; sparse product evidence justifies deferral, not architectural supersession.
- **What remains unresolved:** Whether at least ten operator-attested review encounters show enough usefulness to start task 4720; whether the accepted infrastructure cost remains proportional after that evidence; and whether a future host-origin capability will exist for later approval.

## PRACTICAL CONSEQUENCE

1. Reevaluate task 4720 as `still_valid` because it matches the accepted ADR and continuation artifacts.
2. Defer task 4720 until a fixed-window, no-code review-value experiment using existing `review`, `outcomes`, and `compare` surfaces completes.
3. Add no cadence, snapshot, migration, lock, outcome, handoff, startup, or automatic-capture code during the experiment.
4. Treat each explicitly started review as an operator-attested encounter, not a uniquely identified group or human-proof event.
5. Report exact denominators, repeats, unknowns, usefulness, and burden through a bounded aggregate evidence note.
6. Resume task 4720 only if the experiment meets its predeclared gate; otherwise leave it deferred and reopen implementation sequencing through AK.
