---
summary: "Adopt resource-level, lossless, disposition-bound candidate-peer lifecycle v2 while permanently quarantining v1 destructive cleanup packets."
read_when:
  - "Implementing or operating candidate-peer review, archive, cleanup, or admission controls."
  - "Changing candidate_peer_spawn or candidate_peer_cleanup lifecycle semantics."
type: "adr"
status: "accepted"
system4d:
  container: "Candidate-peer lifecycle architecture in pi-extensions."
  compass: "No candidate work is promoted or discarded without explicit owner disposition and recovery evidence."
  engine: "resource identity and lock -> review snapshot -> disposition -> exact integration proof -> restoration-verified archive -> separate cleanup authorization -> terminal receipt."
  fog: "The emergency destructive hold remains until v2 canaries prove the implementation; ADR acceptance is not cleanup authorization."
---

# ADR: Resource-level candidate-peer lifecycle v2

## Status

Accepted for architecture and implementation planning under AK decision 59.

The emergency `candidate_peer_cleanup` destructive hold remains active. Historical v1 serialized cleanup packets are permanently non-executable.

## Context

The 2026-07-13 census found 302 peer registry records representing 225 physical worktrees and approximately 142 GB. One-by-one review found:

- 22 candidates suitable for scoped integration;
- 10 rejected or superseded candidates;
- 30 resources requiring preservation/owner review;
- 93 archive-and-clean resources;
- three process-blocked resources;
- 67 already-missing resources requiring reconciliation.

Registry v1 could assign several cleanup owners to one reused worktree, carried no mandatory disposition or terminal state, trusted an unbound successful-closeout assertion, and archived Git diffs/bundles without untracked file bytes. Verified historical candidate loss occurred.

Evidence and reviews:

- [One-by-one reconciliation](../project/2026-07-13-candidate-peer-lifecycle-reconciliation.md)
- [RFC](../project/2026-07-13-candidate-peer-lifecycle-rfc.md)
- [Initial review and P0 approval](../project/2026-07-13-candidate-peer-lifecycle-review.md)
- [Final architecture rereview](../project/2026-07-13-candidate-peer-lifecycle-rereview.md)

## Decision

Adopt the complete normative contract in the RFC.

Key decisions:

1. One immutable candidate resource and generation owns a physical worktree; peer-run ids are attempt aliases only.
2. Spawn, review, archive, cleanup, and reconciliation use resource locks and compare-and-swap versions.
3. Owner disposition binds exact tracked, staged, untracked, ignored, symlink, nested-repository, and relevant LFS state.
4. Acceptance identifies an exact selected commit/content scope and requires integration proof against an immutable target commit OID.
5. Promotion/integration and cleanup authorization remain separate owner actions.
6. Archives are owner-only, atomic, hash-verified, and restoration-tested; ignored/generated material is never presumed disposable.
7. Partial effects are receipted and never replayed. Drift routes through fresh review/archive or exact remaining-effect reauthorization/waiver.
8. Missing resources receive explicit recoverability/loss reconciliation rather than disappearing from the registry.
9. Terminal states release active admission pressure exactly once while retaining historical accounting.
10. `pi-little-helpers` owns operational enforcement; target owners own disposition/integration; orchestrator transports typed handoffs; AK remains task/decision/evidence authority.
11. V1 execution remains permanently quarantined. Only individually migrated and proven v2 resources can ever become cleanup-eligible.

## Consequences

Positive:

- candidate work cannot be silently discarded;
- reused worktrees become one lifecycle resource rather than many cleanup owners;
- accepted candidates must prove exact integration before cleanup;
- review and cleanup become retryable, drift-sensitive, and auditable;
- inventory/admission pressure prevents indefinite invisible accumulation.

Costs:

- resource-level state, locks, manifests, restoration checks, and migration tooling are substantial;
- production cleanup remains disabled until synthetic and owner canaries pass;
- historical records require explicit grouping and reconciliation;
- owner review remains necessary and cannot be replaced by peer reports or patch heuristics.

## Rollout and rollback

Follow the RFC phases: permanent v1 quarantine, deterministic inventory migration, lifecycle canaries, archive/restoration canaries, owner fixtures, then small refreshed production cohorts. Admission warnings precede hard thresholds.

Abort on identity ambiguity, lock/CAS failure, drift escape, restoration mismatch, permission leakage, authorization mismatch, partial-effect receipt failure, or owner-boundary violation.

Rollback disables v2 execution/admission blocking but never reenables v1 packets, deletes lifecycle records, removes archives, or pretends already-completed effects did not occur.

## Non-authorizations

This ADR does not authorize any current candidate merge, promotion, deletion, process termination, branch removal, AK evidence write, publication, or release of the emergency hold.
