---
summary: "Runtime contract and verification for bounded ASC rewind keepalive retention."
read_when:
  - "Changing refs/pi-rewind/store retention, runtime scheduling, or retention configuration."
  - "Debugging ASC rewind retention status or compare-and-swap failures."
type: "reference"
status: "implemented"
---

# Bounded rewind-store retention runtime

## Contract

`refs/pi-rewind/store` remains ASC's Git reachability implementation ref. It is not semantic session authority and is not deleted by retention.

At each retention run ASC derives references from the current Pi session ledger and repository-local active-session leases:

- every valid turn/op binding, including historical op `current` and `undo` fields, is an ordinary retention candidate using its ledger-entry timestamp;
- only the current runtime's reconstructed current and undo snapshots receive those privileged roles;
- every active session atomically publishes a lease commit under `refs/pi-rewind/active-sessions/*`; that commit directly parents its reconstructed current/undo snapshots and the shared-ref database makes it visible from every linked worktree;
- full SHA-1 commits supplied through `PI_ASC_REWIND_PINNED_COMMITS` are always pinned;
- ordinary candidates are filtered by age and then newest-first count;
- duplicate commit identities collapse to one live snapshot.

Defaults are intentionally bounded:

```text
PI_ASC_REWIND_MAX_SNAPSHOTS=128
PI_ASC_REWIND_MAX_AGE_DAYS=30
```

Both values accept non-negative safe integers, so `0` is a valid policy. Invalid explicit configuration fails closed during runtime registration. `PI_ASC_REWIND_PINNED_COMMITS` accepts comma-separated full lowercase 40-hex SHA-1 object ids. A missing pinned/current/undo object makes the rewrite fail before the ref update; the existing store ref remains unchanged.

## Scheduling and observability

Retention publishes/refreshes the active-session lease and runs after:

1. session reconstruction (including fork-pending reconstruction);
2. turn-start and turn-end snapshot changes;
3. full agent settlement after the turn ledger entry is finalized;
4. compaction alias recording;
5. fork/tree restore state changes and completed tree navigation bookkeeping.

Active-session refs are keyed by a hash of session and process identity. A clean session shutdown deletes only its own unchanged lease ref with expected-OID CAS; collection similarly retires a valid lease whose owning process is no longer alive. Malformed owner refs are retained rather than destructively guessed. Each lease ref independently keeps its session's current/undo parents reachable even while the aggregate store is contended.

Each active-ref publication or retirement also advances `refs/pi-rewind/active-sessions-epoch` in the same Git ref transaction. Each non-empty store rewrite creates a fresh keepalive chain whose snapshot parents are exactly the planned live set, then its `git update-ref --stdin` transaction verifies the collected epoch and every active-session ref head while applying the store update against the previously observed store OID. The epoch catches added or removed sessions as well as changed known leases. Any lease-set or store drift aborts the whole transaction; runtime retention recollects and retries up to three times rather than allowing a stale lease plan to overwrite newer active-session protection. A failed run records `failed` runtime status and emits a warning; it does not block ordinary Pi interaction or claim success. Concurrently created but unreferenced commit objects may remain for normal Git maintenance, but this runtime never prunes objects.

An empty live plan returns `preserved-empty`: the existing ref and all of its reachable history remain unchanged. This is deliberately conservative because an empty current-session plan is not proof that recovery history may be discarded.

`/asc-rewind-status` and the compact status line expose:

- `rewritten`, `preserved-empty`, `failed`, or `never`;
- last run time;
- live, pinned, and retained ordinary snapshot counts;
- active-session count and resulting store head;
- configured count/age policy;
- the last failure message, when present.

## Verification

Focused tests prove:

- historical op current/undo snapshots remain ordinary while only reconstructed current/undo and explicit pins survive zero-count pruning;
- stale and over-count ordinary snapshots plus the previous keepalive chain disappear, reducing the reachable commit count;
- two active sessions in linked worktrees share active-session refs and preserve the first session's current/undo while the second rewrites a non-empty live set;
- a deterministic stale-lease interleaving fails active-ref verification before it can replace a newer aggregate store;
- the empty plan preserves the exact old ref;
- concurrent updates on both existing and absent store refs win while stale rewrites fail expected-old-OID/zero-OID CAS;
- invalid configuration fails closed;
- runtime settlement actually rewrites the store under injected zero ordinary retention;
- status labels deduplicated ordinary commits as snapshots, reports active-session count, and retains the observed store head on failure.

Rollback is source-only: revert the runtime wiring and keepalive rewrite additions. Do not delete or reset `refs/pi-rewind/store`, bulk-delete active-session or epoch refs, or prune Git objects as part of rollback.
