---
summary: "RFC for lossless, disposition-bound candidate-peer lifecycle management after the 2026-07-13 registry census."
read_when:
  - "Changing candidate peer registry, review, archive, or cleanup behavior."
  - "Designing fan-in and terminal disposition for candidate worktrees."
type: "rfc"
status: "proposed"
system4d:
  container: "Candidate-peer lifecycle control in pi-little-helpers and pi-society-orchestrator."
  compass: "Every candidate receives owner review and a terminal disposition without silent promotion or data loss."
  engine: "inventory -> review -> disposition -> integration proof when accepted -> lossless archive -> exact cleanup -> terminal receipt."
  fog: "Registry metadata is operational state, not AK evidence or promotion authority."
---

# RFC: Candidate peer lifecycle v2

## Problem

The 2026-07-13 census found 302 registry records representing 225 physical worktrees and approximately 142 GB. Review classified 22 candidates for scoped acceptance, 10 as rejected/superseded, 30 for preservation, 93 as archive-and-clean, three as process-blocked, and 67 already missing.

This is a lifecycle-model failure:

- reused worktrees create several cleanup owners for one physical resource;
- registry v1 stores launch state but no review disposition or terminal state;
- cleanup archives omit untracked file bytes and can therefore destroy the only copy of candidate work;
- ignored files have no explicit preserve/discard decision;
- process termination happened before archive capture;
- cleanup accepts an unbound `integrationCloseoutStatus: successful` assertion;
- `repoRoot` can point at a transient linked worktree or `/tmp` checkout;
- no inventory/pressure gate forces fan-in before more candidates are spawned.

The complete reviewed census is in [candidate-peer-lifecycle-reconciliation.md](2026-07-13-candidate-peer-lifecycle-reconciliation.md).

## Decision requested

Adopt one resource-level lifecycle for candidate worktrees while retaining peer-run attempts as communication lineage.

### Resource identity

A candidate resource is identified on the current machine by the canonical real path of `git rev-parse --git-common-dir`, the canonical real worktree path, branch, and initial base commit. Multiple `peerRunId` attempts may bind to one resource but may not independently own cleanup.

The lifecycle record also stores the repository's initial/root commit and normalized configured remotes as relocation evidence. Relocation never silently changes identity: an owner must explicitly reconcile a moved clone before cleanup. The durable owner checkout must resolve outside the generated candidate-worktree root and remain in the same Git common directory. A linked candidate worktree or temporary checkout must not become the owner root.

### States

```text
open -> final_reported -> review_pending

review_pending -> deferred -> review_pending
review_pending -> reconciled_missing       (terminal; no archive/cleanup)
review_pending -> accepted | rejected | superseded
accepted | rejected | superseded -> archive_verified
archive_verified -> cleanup_authorized -> cleaned
```

No transition implies promotion, merge, AK evidence, publication, or deletion.

### Review binding

A disposition binds:

- candidate resource id;
- every peer-run alias;
- repository identity and owner root;
- branch, base, reviewed HEAD;
- tracked-status/diff digest;
- untracked and ignored path manifests;
- reviewer/operator identity and timestamp;
- rationale and validation references;
- for `accepted`, the intended target branch and later exact integration proof.

Any drift returns the resource to `review_pending`.

### Archive contract

Archive publication is atomic and complete only when a verified manifest and completion marker exist. It contains:

- every registry alias and lifecycle record;
- branch bundle and HEAD/base metadata;
- tracked/staged binary diffs;
- untracked file bytes with a NUL-safe path manifest;
- ignored path inventory plus either archived bytes or explicit path-level discard authorization;
- hashes for every archive object;
- before/after capture checks proving the worktree did not drift.

Generated or ignored does not automatically mean disposable.

### Cleanup gate

Cleanup requires:

1. a cleanup-eligible review disposition: `accepted`, `rejected`, or `superseded`;
2. a fresh match to the review-bound repository, branch, HEAD, and status digest;
3. a verified complete archive;
4. all peer-run aliases included under the one resource;
5. no live editor/process lease;
6. for accepted work, exact integration proof against the named target;
7. an explicit cleanup authorization separate from promotion.

Process termination, when requested, occurs only after archive verification. Cleanup remains exact and idempotent. Missing worktrees produce a `reconciled_missing` receipt rather than remaining indefinitely open.

### Inventory and pressure control

Expose a read-only inventory grouped by physical candidate resource, showing age, size, aliases, activity, dirtiness, unique/equivalent patches, archive state, disposition, and blockers.

New candidate creation warns at a configurable unresolved-resource threshold and fails closed at a higher owner-set storage/age threshold unless the operator explicitly acknowledges the existing backlog. This is pressure control, not automatic deletion.

## Immediate P0 guard

AK task 3927 may land the following noncontroversial safety correction before the full v2 decision is accepted:

- temporarily block every destructive `candidate_peer_cleanup` execution and retain dry-run inventory only;
- generate prospective new-record archive packets that preserve untracked bytes;
- inventory ignored paths and fail closed rather than discarding them;
- use owner-only archive permissions;
- compare tracked state, HEAD, untracked/ignored manifests, and untracked content digests before and after capture;
- verify hashes, branch bundle, and compressed archive before an atomic completion marker;
- report reused worktree aliases in dry-run inventory.

The global destructive hold also protects historical v1 sidecars whose serialized cleanup packets remain unsafe. This guard reduces loss risk but does not itself complete lifecycle v2 or authorize execution.

## Rejected alternatives

- **Automatic merge or acceptance:** peer output is not owner authority.
- **Automatic deletion after `PEER_FINAL`:** final report is communication, not disposition or integration proof.
- **Keep v1 and add a cron cleanup:** age does not establish disposability.
- **Archive only Git diffs/bundles:** this already lost untracked candidate files.
- **Treat ignored paths as reconstructable by definition:** runtime evidence and experiment outputs may be ignored but unique.
- **One registry record per peer run remains one cleanup owner:** reuse makes this unsafe and non-idempotent.

## Rollout

1. Land and dogfood the P0 loss guard.
2. Add resource-level schema and read-only inventory migration over existing sidecars.
3. Record reviewed dispositions from the census without cleaning.
4. Integrate accepted candidates in owner repositories one scoped tip at a time.
5. Archive and clean small, refreshed repository cohorts.
6. Add spawn pressure control only after inventory and terminal receipts are reliable.

## Acceptance tests

- An untracked file with spaces or control-safe unusual characters is recoverable byte-for-byte from the archive.
- An ignored file blocks cleanup absent explicit archive/discard disposition.
- Archive drift leaves no complete archive and performs no destructive action.
- Archive happens before any process termination.
- Reused worktree aliases cannot independently trigger cleanup.
- A stale HEAD/status digest blocks cleanup.
- Accepted cleanup fails without exact integration proof.
- Rejected/superseded cleanup still requires explicit disposition and verified archive.
- Missing resources become terminally reconciled with recoverability/loss recorded.
- Inventory groups 302 historical records into 225 physical resources deterministically.
- No path performs merge, push, PR, AK mutation, publication, or promotion implicitly.
