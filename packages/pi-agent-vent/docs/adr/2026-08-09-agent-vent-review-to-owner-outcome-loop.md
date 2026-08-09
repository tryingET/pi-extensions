---
summary: "ADR accepting a staged agent_vent review-to-owner-outcome loop with snapshot freshness, verified approval, owner receipts, and denominator-explicit measurement."
read_when:
  - "Implementing agent_vent cadence, review identity, handoff approval, owner receipts, or outcome measurement."
  - "Deciding whether local vent state can authorize or prove owner-system effects."
system4d:
  container: "Accepted architecture for the local diagnostic review-to-owner-outcome loop."
  compass: "Make local diagnostic review useful without turning agent_vent into hidden authority."
  engine: "Canonical snapshot -> visible cadence -> verified approval -> owner-native receipt -> explicit outcome cohorts."
  fog: "Local command paths, pointers, and activity counts can be mistaken for human approval, canonical acceptance, or useful effects."
---

# ADR — Adopt the `agent_vent` review-to-owner-outcome operating loop

## Status

- status: accepted
- date: 2026-08-09
- owner: `packages/pi-agent-vent`
- canonical decision: AK decision `116`
- reviewed RFC: [review/handoff/outcome-loop design](../project/2026-08-08-agent-vent-review-handoff-outcome-loop-design.md)
- legal review closure: [current-track review memo](../project/2026-08-08-review-agent-vent-review-handoff-outcome-loop.md), outcome `ready_for_adr`
- evidence: [usage-loop evidence spike](../project/2026-08-08-agent-vent-usage-loop-evidence-spike.md)

## Executive summary

Adopt a staged operating loop that makes local vent review visible, binds review and handoff to canonical recurrence snapshots, requires host-verified or authenticated owner-surface approval for authoritative handoff, distinguishes local intent from owner-native receipts, and measures review value through explicit cohorts rather than capture or escalation volume.

The first implementation slice is limited to snapshot freshness and pull-based cadence. Automatic capture, startup nudges, owner-system writers, outcome promotion, and broad adapters remain outside that slice.

## Context

`pi-agent-vent` is installed and integrated with ASC/`self` and toolbox. It already owns local capture, recurrence projection, local review states, draft text, export, and retention. The evidence spike found that the explicit capture path works but the queue had five `new` groups, one `acknowledged` group, and no demonstrated review-to-owner outcome loop.

Current local state cannot truthfully establish:

- immutable reviewed-group identity after new records, curation, archive, or restore;
- human approval from a forgeable command-path source string;
- owner acceptance from a locally copied reference;
- usefulness or verified effect from workflow states such as `acknowledged` or `escalation_drafted`.

## Decision drivers

- preserve the explicit capture and authority membrane;
- make review cadence visible without hidden notifications or telemetry;
- prevent stale review/approval from covering a changed recurrence group;
- require trustworthy approval before owner mutation;
- preserve owner-system canonical truth and effect reconciliation;
- measure useful review and verified effects with explicit denominators and unknowns;
- keep the first implementation slice local, reversible, and testable.

## Decision

### 1. Canonical snapshot freshness

Introduce versioned, persisted local snapshot manifests using:

- stable lineage and occurrence identity;
- generation-specific eligibility;
- canonicalized, redacted review-relevant record content;
- RFC 8785 serialization and SHA-256 digests;
- explicit atomic/idempotent legacy initialization;
- archive/restore-surviving snapshot identity;
- derived `needs_rereview` whenever content, membership, or curation changes.

Recurrence keys remain display/lookup aliases, not durable approval identity.

### 2. Pull-based review cadence first

The first visible cadence is read-only and operator-invoked. It derives `clear`, `current`, `due`, or `overdue` from generation-specific time, critical severity, and queue-threshold due facts.

No session-start notification is enabled by this ADR. Any future startup nudge must be opt-in, rate-limited, privacy-minimized, and separately gated as a default-workflow change.

### 3. Separate disposition, intent, and verified decision

Existing `set_review` remains local disposition only. It does not prove human review.

Command-path observations remain unverified. A handoff adapter may rely only on:

- a non-spoofable Pi host-origin receipt verified through a runtime-owned capability; or
- approval performed on the authenticated owner surface.

If neither exists, handoff automation fails closed.

### 4. Separate local and owner receipts

The model must keep distinct:

- local handoff intent;
- unverified operator-attested owner reference;
- owner-verified receipt and disposition;
- local usefulness rating;
- owner-verified effect observation.

Only the owner-native contract may establish acceptance, rejection, duplicate, not-found, indeterminate effect, or verified outcome.

### 5. Shared mutation lock and crash-consistent projection

Snapshot-, disposition-, cadence-, retention-, and approval-affecting mutations share one local lock domain. The lock prevents concurrency races but is not itself a crash transaction.

Authoritative Phase 1 identity is split explicitly:

- initialization atomically creates an immutable legacy identity baseline mapping every pre-Phase-1 occurrence to stable occurrence/lineage identity;
- every new vent record stores its occurrence/lineage identity in the authoritative record itself;
- every new curation event stores the lineage relation needed to reproduce its projection;
- review and retention events remain authoritative for their existing local facts.

The legacy identity baseline is not a rebuildable cache: missing, conflicting, or corrupt baseline identity fails closed for owner recovery. Snapshot/cadence sidecars are rebuildable projections over that baseline plus authoritative vent/review/curation/retention events. They carry exact source hashes/high-water marks. A consumer must compare those markers before use: mismatch, partial write, or an interrupted multi-file mutation returns `projection_rebuild_required` and exposes no stale cadence/snapshot as current truth. Rebuild is an explicit preview/confirmation operation using atomic temporary-file, file-and-parent-directory fsync where supported, rename, and idempotent validation.

Failure injection must cover every write boundary for vent append, `set_review`, curation, due projection, archive, and restore. Approval in later phases must reload and recompute under the lock before appending intent. Indeterminate owner effects stop for owner-native reconciliation and are never mechanically retried.

### 6. Denominator-explicit measurement

Measure review coverage, freshness, local usefulness, burden, handoff approval, owner receipt coverage, owner disposition mix, follow-up coverage, and verified effects as separate cohorts.

Every metric exposes numerator, denominator, cohort window, trust level, and unknown count. No composite health/usefulness score is accepted. Missing follow-up remains unknown.

### Scope

In scope:

- the architecture and staged owner boundaries above;
- Phase 1 snapshot identity, migration, shared-lock safety, and pull-based cadence;
- later phases only after their explicit passport/task/owner gates.

Out of scope for Phase 1:

- automatic vent capture;
- startup nudges;
- direct AK/GitHub/incident/KES writers;
- owner adapter canaries;
- outcome promotion or telemetry;
- disposition of the current local queue.

## Ownership and authority

| Concern | Owner |
|---|---|
| Local records, snapshots, cadence, dispositions, intent caches, local ratings | `pi-agent-vent` |
| Non-spoofable operator-origin capability | Pi host/runtime owner |
| Discovery and activation | `pi-toolbox-discovery` |
| Session diagnostic candidates | ASC/`self` |
| Task/evidence/direction truth | AK |
| GitHub issue truth | target repository/GitHub |
| Incident truth | incident owner |
| Empirical analysis | Oracle/DSPx |
| Accepted learning | KES/AK owner workflow |

Local records, manifests, references, and metrics never replace those owner surfaces.

## Alternatives considered

### Automatic capture plus periodic review

Rejected. The evidence does not show explicit capture as the principal bottleneck, and automatic persistence changes consent/authority behavior.

### Treat slash-command submission as human proof

Rejected. A local source field is forgeable unless the Pi host supplies and verifies a non-spoofable origin capability.

### Direct owner-system writers inside `agent_vent`

Rejected for the initial loop. This would collapse credentials, network effects, schema coupling, and owner mutation into the local diagnostic package.

### Treat local workflow states as outcomes

Rejected. `acknowledged`, `dismissed`, and `escalation_drafted` are dispositions, not usefulness, owner acceptance, or verified effects.

### Enable startup reminders by default

Rejected for the first slice. Pull-based cadence must demonstrate value before changing default operator attention.

## Consequences

### Positive

- stale recurrence groups cannot silently inherit current review/approval;
- review cadence becomes visible without background telemetry;
- owner handoffs gain explicit identity, approval, and receipt seams;
- usefulness claims expose denominators, negative outcomes, and unknowns;
- automatic capture remains deferred.

### Costs

- snapshot identity and legacy initialization add local schema complexity;
- one shared lock broadens concurrency coordination;
- host-verified approval depends on a Pi runtime capability that must be demonstrated;
- owner adapters require separate owner contracts and canaries;
- current large package files should not absorb the new logic without decomposition.

### Risks and mitigations

- migration corruption -> preview/token/hash gate plus atomic create and fail-closed recovery;
- stale approval -> shared lock, reload, recompute, exact snapshot binding;
- forged approval -> trusted host verifier or authenticated owner-surface approval;
- pointer treated as receipt -> separate event types and language;
- Goodhart pressure -> no volume targets or composite score;
- reminder fatigue -> no startup nudge in Phase 1.

## Rollout

1. Implement only canonical snapshot manifests, explicit legacy initialization, shared-lock behavior, `needs_rereview`, and pull-based cadence.
2. Validate in isolated local stores and a fresh Pi session.
3. Measure whether cadence improves operator review before proposing approval/handoff events.
4. Require a new gated task and verified host/owner contract before Phase 2.
5. Require owner-specific decision/task scope before any adapter canary.

Rollback preserves local user data. Disable new cadence/snapshot consumers, retain manifests for inspection, and never auto-delete or rewrite legacy records. See the attached validation/rollout/rollback artifact for exact gates.

## Architecture fitness functions

- read-only cadence creates no files;
- source-hash/high-water mismatch fails closed with `projection_rebuild_required` rather than exposing stale projection state;
- legacy initialization is previewed, hash/token bound, atomic, and idempotent;
- duplicate/reused record ids cannot alias occurrences;
- content/membership/curation change produces a new generation;
- archive/restore preserves snapshot identity;
- deleting all rebuildable snapshot/cadence projections and rebuilding from the immutable baseline plus authoritative events preserves lineage, occurrence ids, generations, and snapshot digests;
- existing `set_review` never becomes human-proof state;
- unverified references never carry canonical owner dispositions;
- no owner effect is retried after `effect_indeterminate`;
- metrics show exact denominators and unknowns;
- Phase 1 performs no owner-system or startup-notification mutation.

## Supersession

- supersedes: none
- superseded by: none
