---
summary: "Current-track rereview accepting candidate-peer lifecycle v2 as ready for ADR while keeping implementation and cleanup disabled."
read_when:
  - "Closing review for AK decision 59."
  - "Checking architecture readiness separately from implementation readiness."
type: "review"
status: "ready_for_adr"
---

# Candidate peer lifecycle v2 rereview — 2026-07-13

## Governed outcome

`ready_for_adr`

The final architecture rereview found the resource-level, lossless, disposition-bound lifecycle suitable for ADR recording. This outcome does not approve implementation, migration, production cleanup, or release of the emergency destructive hold.

## Review progression

The first review required:

- immutable resource/generation identity rather than path/branch identity;
- resource locks, compare-and-swap versioning, lease recovery, and alias grouping;
- byte/type/mode/path binding for tracked, staged, untracked, ignored, symlink, nested-repo, and LFS state;
- exact target-commit integration proof and separate immutable cleanup authorization;
- complete transitions for forced review, drift, missing resources, partial cleanup, retries, and terminal receipts;
- owner-only restoration-verified archives;
- source-owner allocation;
- atomic admission/pressure controls and phased migration/rollback.

The revised RFC supplied those contracts. Two subsequent narrow gates required and verified:

1. partial cleanup followed by expiry/revocation/drift preserves completed-effect receipts, never replays effects, uses fresh review/proof/archive while a worktree remains, and permits exact reauthorization or explicit retained-resource terminal closure after removal;
2. `cleaned`, `closed_with_retained_effects`, and `reconciled_missing` release active pressure reservations exactly once while preserving historical accounting.

The final gate also confirmed:

- process-first drift requires fresh review/proof/archive or explicit retained-worktree closure;
- post-removal continuation requires the unchanged verified archive and exact surviving refs;
- “owner-signed” means an authenticated local-owner receipt, with cryptographic signing optional by owner policy;
- revocation is append-only and digest-bound, not mutable authorization state.

## Boundaries

Architecture readiness is not implementation readiness. The following remain prohibited until post-ADR implementation, canaries, and owner proof succeed:

- execution of historical v1 cleanup packets;
- production candidate deletion or process termination;
- automatic candidate acceptance, integration, merge, promotion, publication, or AK mutation;
- release of the global destructive-cleanup hold for any unmigrated resource.
