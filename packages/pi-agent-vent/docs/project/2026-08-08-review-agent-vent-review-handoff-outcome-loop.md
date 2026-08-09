---
summary: "Current-track adversarial review memo for the proposed agent_vent review, handoff, and outcome loop."
read_when:
  - "Evaluating ADR readiness for the agent_vent review/handoff/outcome-loop RFC."
  - "Attaching the current-track review attempt to the governing AK decision."
type: "review"
system4d:
  container: "Immutable current-track review attempt for the proposed agent_vent operating loop."
  compass: "Challenge approval, identity, receipt, freshness, and measurement claims before ADR."
  engine: "Review exact RFC digest -> require revision until blockers close -> emit explicit outcome."
  fog: "A READY review can be mistaken for accepted architecture or implemented behavior."
---

# Review memo — `agent_vent` review, handoff, and outcome loop

Review track: `current_track`

Reviewed artifact:

- path: `packages/pi-agent-vent/docs/project/2026-08-08-agent-vent-review-handoff-outcome-loop-design.md`
- SHA-256: `774968dc48492c887a180b956f3a3cd58ed7bcc24bb4e4de0e710b302f0af5f8`

Review method: independent adversarial governance/product review against the current `pi-agent-vent` store, extension, review, draft, retention, ASC/toolbox boundary, and AK decision-lifecycle contracts.

## Review history

### Attempt 1 — not ready

The first packet review found eight substantive defects:

1. a Pi command-path marker was incorrectly treated as proof of operator presence;
2. snapshot identity did not cover canonical record content, stable lineage, duplicate ids, or retention survival;
3. unverified references could carry accepted/verified owner-effect language;
4. approval validation had a time-of-check/time-of-use race;
5. LLM local disposition and operator decision projections lacked precedence;
6. metric denominators and burden/follow-up rules were not computable;
7. rollout gates did not consistently require live AK passport legality;
8. cadence precedence and generation-specific eligibility were ambiguous.

### Attempt 2 — not ready

After revision, four gaps remained:

1. existing `set_review`/local-disposition writes were outside the proposed shared lock;
2. legacy identity materialization lacked an atomic/idempotent migration contract;
3. queue/time/critical due denominators lacked durable `effectiveDueAt` semantics;
4. host approval was an enum rather than a runtime-verified, replay-safe origin receipt.

### Attempt 3 — ready

The reviewed artifact now resolves those blockers by requiring:

- command-path observations to remain unverified unless Pi host supplies a non-spoofable origin capability;
- RFC 8785 + SHA-256 canonical snapshots with stable lineage, occurrence identity, generation-specific eligibility, and archive/restore survival;
- explicit atomic legacy initialization;
- one shared lock across vent, local-disposition, curation, snapshot/due, review, retention, and approval mutations;
- structured owner identities;
- separate local intent, unverified reference, verified owner receipt, local rating, and owner-verified effect contracts;
- persisted time/critical/queue due semantics and exact cohort denominators;
- explicit AK decision/passport gates for durable snapshot, approval, handoff, outcome, startup, and owner-adapter contracts.

Independent final verdict: **READY**.

## Residual risks and obligations

- Pi does not yet prove in this packet that the required non-spoofable host-origin verifier exists. Implementation must fail closed or use authenticated owner-surface approval until the runtime owner contract is demonstrated.
- The snapshot/legacy/shared-lock design is proposed, not implemented or live-tested.
- No owner adapter has been selected or authorized.
- Provisional pilot thresholds require AK acceptance or revision before becoming graduation gates.
- The current five `new` local groups remain undispositioned and outside this review mutation.

## Review outcome

`ready_for_adr`

## Legal next move

Attach the problem brief, evidence note, RFC, and this immutable review memo to the governing AK decision. Advance only to the runtime state allowed by the decision passport. Record an ADR only after the decision outcome is explicitly accepted; implementation remains blocked until the ADR plus required implementation and validation/rollout/rollback artifacts exist.
