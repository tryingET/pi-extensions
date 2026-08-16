---
summary: "Fail-closed operator runbook for diagnosing and recovering repository-scoped ASC capacity without deleting live effect custody."
read_when:
  - "A dispatch reports shared ASC capacity is full."
  - "A helper, raw child, or parent Pi appears stranded after transport loss."
---

# ASC capacity recovery runbook

## Safety boundary

Shared capacity represents active or effect-indeterminate raw-child custody. A terminal assistant
message, websocket loss, old heartbeat, dead helper, or aged lock is not release authority.

Never:
- raise `maxConcurrent` to route around a holder; `.asc-subagent-capacity-limit.v1` immutably fixes the first configured limit for this repository session root, and a mismatch is an incident/configuration error rather than spare capacity
- delete `.asc-subagent-capacity-*` files, including the shared-limit record, while an exact effect owner may remain
- reclaim from JSONL, terminal text, sidecar age, or helper death alone
- treat observer/Ghostty state as execution settlement

## Inspect first

From the affected fresh Pi session:

```text
/subagent-status
/subagent-dashboard
/subagent-inspect <session-name>
```

`/subagent-status` reports process-local counts separately from repository-session-root shared
holders. Holder output is bounded and token-free. Record the dispatch/session identity, age, and
parent/helper/raw PID states before taking action.

The displayed PID/state projection is diagnostic only. Do not signal from it: the display omits
lease tokens/start-tick capabilities and cannot provide signal-time fencing against PID reuse.
ASC itself releases/reclaims post-spawn work only after recorded exact identities are stale and the
kernel reports that the managed raw process group no longer exists.
Helper start and stale takeover also acquire the same per-slot transition fence, so a parent death
inside custody publication cannot admit a replacement alongside newly started raw work.

The reclaim proof is currently Linux-specific (`/proc` start identity plus process-group signaling).
Unsupported platforms retain capacity fail-closed and require owner investigation rather than manual
lease deletion.

## Recovery order

1. **Live legitimate holder:** wait, or cancel the exact dispatch:
   ```text
   /subagent-cancel <dispatchId> operator-requested-recovery
   ```
2. **Old loaded parent:** let its active dispatch settle, then `/reload` or restart Pi so the parent
   uses the current helper/custody protocol.
3. **Dead helper with live raw group:** do not delete the lease and do not signal from the bounded
   status display. Allow supervisor/custody-pipe teardown to finish. If it does not, preserve the
   artifacts and escalate; ASC intentionally exposes no unfenced force-reclaim command.
4. **Dead helper and absent raw group:** retry one dispatch. Reservation performs automatic
   compare-and-delete reclaim from helper-written exact custody.
5. **Spawn-committed lease without custody:** keep it fail-closed. Current helpers fence stale
   takeover, revalidate the lease, and publish custody before the raw start gate; this shape normally
   indicates a legacy parent, storage failure, or helper death inside the handoff. Preserve artifacts
   and investigate.
6. **Malformed lease:** keep it fail-closed. Atomic current writers do not publish partial leases,
   so malformed effect-bearing data is evidence of corruption or an incompatible writer, not an
   age-reclaim candidate.

## Activation after an owner fix

```bash
pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-autonomous-session-control
```

Run that command only after the reviewed commit is present in the canonical owner checkout; record
`git rev-parse HEAD` first. Then reload or start a fresh Pi process. Installation without reload
does not replace an already loaded parent/helper graph.

## Closure drill

A recovery change is not operationally closed until all of these are observed:

1. package checks and spawned-helper tests pass
2. the exact package is installed and a fresh Pi process is used
3. a real dispatch publishes helper/raw custody and settles
4. `/subagent-status` reports no leaked shared holder after settlement
5. a follow-on dispatch acquires capacity and settles
6. rollback commits/package version and any residual platform limits are recorded

Rollback is commit-bound: revert the landed custody-hardening commit(s) in reverse order, reinstall
the canonical package path, start a fresh Pi process, and repeat the no-leaked-holder/follow-on
dispatch checks. Never roll back by deleting live lease/custody files.

These observations are runtime evidence only; AK remains task/evidence authority and passing local
checks do not authorize release or publication.
