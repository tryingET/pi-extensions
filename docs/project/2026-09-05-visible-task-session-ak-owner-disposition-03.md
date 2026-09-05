---
summary: "Operator-delegated AK task5462 disposition: accept local B; reject manual freeze; condition startup/recovery on an AK-owned closed interval with actual host custody and no-maintenance admission."
read_when:
  - "Reconciling AUTH-01/02 and AK-side EXCL-01 before Decision151 ADR."
type: "owner_disposition"
task_id: 5451
owner_task_id: 5462
---

# Decision151 — local AK disposition

## Authority, identity and transcription limit

Controller-persisted structured transcription of the task5462 source-owner result, communication `680633be-98c7-4947-8516-3350dc98dd19`, peer `scoutpeer-mtoy26tp-74f1c1d2`, session `01a073a6-a6ea-777a-82ca-af372e68c639`. It preserves the operative choices/conditions below; it is not a new independent reviewer vote. The original response also supplied detailed investigation chronology. Source-owner verification of this transcription is requested separately.

The operator's interview returned the answered value **“Authorize these bounded local owner-disposition tasks”** before timing out. Task5462's contract/guardrails and evidence8383 record that delegation. The controller holds the task; the assigned source investigator performed no AK/DB commands, writes, tests, process probes, installs or provider calls. Delegation authorizes local proposed-contract accept/reject/condition, not ADR acceptance, upstream approval, existing policy changes or implemented behavior. The controller records subsequent canonical evidence from the AK owner cwd; this file is the human-readable supplied input.

Reviewed RFC02 SHA-256: `a97c4acc15dcedeb17596882419f2c8a920918d394428e0b1912f419dee7cb14`. Current AK checkout HEAD observed at start/end: `0b5f16fed9750f5299c0c18b8fe3789d71161ed3`. Native behavior was inspected at approved Git pin `cdeef5bfedcb1b19ee18921008f876ecd05eb8ca`, not executed from checkout.

## Actual local dispositions

- **AUTH-01 — ACCEPT (AK side):** B fits fresh pending, explicit-scope ordinary non-FCOS tasks on a cooperative single-user workstation. Actor identity is asserted-local. Reject parent-held transfer, automatic release/reclaim, default-off begin activation, delegated authentication, baseline CAS and continuous revocation claims. Pi integration owns its own fit decision.
- **AUTH-02 — CONDITIONAL for the future contract; REJECT the unspecified manual freeze/current per-command gate as its realization.** Select the AK-owned bounded startup/recovery interval below. Its owner gate/access-mode change is absent today and requires separately authorized implementation after the architecture stages. Until implemented/proved, executable B is unavailable. This is a substantive local selection, not a request for another generic owner vote.
- **AK-side EXCL-01 — CONDITIONAL ACCEPT:** independent task OR workspace exclusion and retained uncertainty are correct. Host future-dispatch closure, effect disposition and AK claim disposition remain distinct. Authority/recovery writers, including DB-wide release-expired, must participate in protected-attempt custody; lane/common-Git custody does not establish that participation.

## Why the old assumption fails

The current gate takes the canonical DB flock and execs **one** approved invocation; it has no multi-call interval, host-lifetime custody or recovery interval. Separate show/claim/show calls release custody between commands. Externally taking the same lock then calling the ordinary gate deadlocks/times out; direct binary/alternate policy/skip-lock workarounds violate current policy. Fencing the policy also blocks the intended child. Known-session chat ACKs do not establish a closed writer population or account for queued/restarting triggers.

Source-relevant writer families:

| Family | Pinned source / effect |
|---|---|
| Task lifecycle/scope/dependency lists | `tasks.rs` claim6898–7057; claim entry8117–8137; scope7584–7690; complete8280ff; fail8634ff; unclaim8718ff; add dependencies8980ff. Scope may change while claimed; changing a dependency's lifecycle need not bump the target version. |
| Companion contracts | Done-contract6630ff, guardrails6696ff; checks959–968/1048–1056 forbid terminal, not claimed/running tasks. Their own versioned rows change independently. |
| Deferrals and time | Explicit expiry7197ff, defer7287ff, resume7419ff, normalization4155ff. Effective truth4062–4092 changes with time; native claim may expire elapsed deferrals and write receipts. A writer lock does not freeze time. |
| Decisions | `decisions.rs` blockers2473–2527 consume membership, link roles, significance and state. Create2725ff, link3388ff, unlink3504ff, transition3925ff can change them independently of task version. A list of blocking IDs alone is incomplete. |
| Recovery/import/composition | `release_expired_leases_at`8149–8269 uses a DB-wide, non-repo-filtered expired-task selection5402ff; clears ordinary claims without fencing workers. CLI main26567–26583 exposes explicit expiry operations. FCOS/restore/import9948ff and bulk writers can affect dependencies even if the launched task is non-FCOS. Default-off composition remains separate. |
| Canonical identity/deletion | Task/repo deletion and `repo.rs` rebind1438ff affect authority identities, not merely labels. |
| Hidden maintenance | Ordinary CLI opens SocietyDb (`main.rs`25516–25532); `db.rs`3180–3224 may reconcile evidence/issue substrate; `external_issues.rs`2597ff normalizes tracker/issue/sequence data. `get_task`7503ff can invoke exact-ID lookup repair5203ff with writable connections; mutation preflights5341ff may repair too. Nominal show is not a guaranteed zero-write operation. |

Correction: source investigation found **no ordinary-open or ready-path call to release-expired** in the approved pin. Ready8900–8934 is observational. Explicit recovery semantics do not prove an installed timer/daemon. No ambient schedules or live writer population were probed; enrollment must establish them positively.

## Selected future closed protocol

`startup_interval_v1` is a design label, not an installed command, permission token or governed vocabulary promotion.

1. **Enrollment:** bind canonical DB identity, pin/policy generation, exact ordinary task/repo, sealed host/profile, attempt/request and transport reservation. Positive custody covers all DB access/trigger routes, including maintenance/direct adapters, imports, recovery, controllers and policy/binary/DB replacement. Unknown or unpausable bypasses mean unavailable. Existing access policy remains controlling.
2. **Prepare before the interval:** reserve operational task/workspace exclusion and prepare the locked host first. Never hold the little-helpers namespace mutex while taking AK custody or invoking owner commands. Resource/provider initialization and arbitrary waits stay outside the short AK interval. No candidate admission is nested.
3. **Closed installed owner interface:** use the **same canonical DB admission lock** as ordinary commands. The sealed host retains actual custody through its local terminal startup transition and accounts for native subprocess lifetimes. Broker tokens, controller PID, expiring permits or queued “release permitted” messages are insufficient. Operations are fixed/versioned baseline reads, one native claim, ordered readback and terminal startup publication. No public arbitrary runner, env bypass, caller binary override or unvalidated FD reuse. The owner mode avoids recursively taking the ordinary gate; that path is new owner work, not lawful through today's interface.
4. **T0:** successful exclusive acquisition, drained prior gated invocations and post-acquisition identity/policy validation, before authoritative baseline reads. Compare the plan against complete task/scope/companion/dependency/decision membership and facts, evaluated time and lease. Perform one native claim; verify expected `v -> v+1`, exact actor/claim tuple and independent companion facts. The lock excludes cooperating reads/writes, not just a chosen verb list. This is enclosing serialization, not a new CAS/delegation algorithm.
5. **T1:** under the same host custody, durably and irreversibly either bind/admit the sole literal task message or deny future admission for that incarnation. **No model/tool dispatch until after interval release.** Last show, window/ACK, parent observation or a broker reply is not T1. Ambiguity becomes denied/unresolved, never resend. A host may not relinquish custody while a delayed message could still admit. Helper loss must deny locally before a surviving host relinquishes custody; in-flight native calls retain serialization and have no model/tool capability.
6. **Boundedness:** configured startup deadline/lease budget causes terminal denial before lock release, not forced expiry of the lock/history. A stalled live host can retain the gate and require owner recovery; another process must not age-unlock it while runnable. No global gate is held during normal model execution or remote task effects. Interval duration/contention require later measurement.
7. **Own-call effect closure:** new owner mode uses no-maintenance baseline reads and refuses repair-required/noncanonical state before release. Claim admission suppresses/denies repair fallback while preserving the native claim algorithm and accounting for permitted claim/receipt and elapsed-deferral normalization effects. Unexpected companion change refuses. Repair remains separately authorized maintenance. Current ordinary show/claim does not supply this mode.

These are the selected minimum missing semantic capabilities: actual multi-call host custody, closed no-maintenance effects, and protected-attempt authority-change/recovery discipline. If that owner-local change is rejected, retain preparation-only; do not relabel the current gate as sufficient.

## After startup and recovery

After T2 (explicit DB unlock), unrelated AK work may proceed. No permanent authority freeze or continuous polling is promised. Bind the admitted authority-input set and responsible writers in enrollment. For affected scope/contract/dependency/decision/claim/reassignment changes, use **stop-and-dispose-before-change**: establish host no-future-dispatch plus effect disposition before mutation. If a writer cannot distinguish unrelated from affected/bulk work, suspend it rather than guess. Policy/DB generation changes require disposition too.

The simple v1 choice is to suspend DB-wide release-expired triggering while any enrolled active/unresolved attempt could be affected, and use owner-directed exact-task recovery. Include queued/in-flight/restart paths and a named reinstatement condition. Alternatively every affected claim must already have its required disposition before a bulk run. A startup-only timer pause is insufficient. This sacrifices recovery availability for other tasks; an unknown automated caller blocks enrollment. Updating a captured digest does not legitimize mid-run scope drift.

Recovery uses a **new AK-owned interval after external host/effect closure**, not a global lock held while waiting for those facts. Under custody compare exact claimant, claimed_at, lease, task version and repo to the preserved tuple. Only the explicit owner may issue one native unclaim, retaining exclusion through result/readback. Drift or uncertain commit stops without retry. If reassignment already happened, do not clear the current claimant to tidy the old attempt: reconcile old effects and new authority separately. Matching current state is not an operation replay receipt.

Transport retirement requires host closure + effect disposition + AK claim resolution. Lease/task completion, PID/window disappearance and ACK/FINAL are insufficient. Feature inability must not become an indefinite DB-wide incident fence; today's separately authorized incident-recovery route remains available.

## Multi-order consequences and later proof

Global interval custody briefly blocks unrelated readers/writers; slow native opening or repairs would amplify outage, motivating preload/no-maintenance/no-network constraints. A stopped live holder may monopolize AK; closing actual capabilities/helpers is necessary, not lockfile deletion. Paused bulk recovery accumulates unrelated orphan claims and pressure to bypass. Shared decisions/dependencies widen custody beyond one checkout. Frozen scope/context/lease can strand useful work; no silent transfer or scope expansion is accepted.

After ADR and separately authorized implementation, require adversarial writer-family races across T0–T2, repair/normalization denial, temporal deferrals, claim commit/read error, host/helper/broker death and inherited-FD leakage, recovery claimant drift, expiry/reassignment with surviving effects, queued/restarting bulk recovery, installed gate/profile identity, and withdrawal preserving inspection/history. Measure interval duration, contention, recovery backlog, stranded resources and bypass attempts. No such test or enrollment occurred here.

## Finite AK/Pi protocol concurrence

In its requested supplement, the same AK delegate **ACCEPTED the local Pi shared-open-file-description refinement** as compatible with the conditional future AK contract. No further generic owner vote is required; unimplemented/no-maintenance/writer-enrollment conditions remain. These refinements control the earlier T0/T1 sketch:

- Supervisor opens the permanent canonical lockfile without locking, passes the same OFD privately to the sealed host, and waits for resource/profile PREPARED outside the DB lock. No user FD or ordinary nested gate. Host retains custody; descriptor/channel must not escape to task execution.
- **T0** is flock acquisition plus policy/identity validation, before baseline reads. **T1** is durable admission/binding of the exact envelope/baseline to this incarnation or irreversible denial—not merely receipt of a proposal and never model execution. Bind request/attempt/incarnation, baseline/effective-envelope, claim tuple, reservation, policy/pin and protocol generation. Supervisor validates the matching one-shot durable T1 while still locked.
- The private immutable T1 sidecar is written without the namespace mutex. Its later history projection occurs after DB unlock; lag cannot erase the prior durable reservation. Corrupt/missing/unknown T1 refuses release. A sidecar alone cannot resurrect execution after restart.
- **T2** is explicit supervisor unlock. Exclude authority writers for **T0–T2**, not merely through T1. After T2, stop-and-dispose-before-change custody applies even while CLOSED/first prompt is pending; no continuous freshness or no-mutation-until-prompt guarantee is asserted.
- Success is matching durable admitted T1 → explicit LOCK_UN → successful bound CLOSED → host checks current phase/incarnation and deadline, closes private descriptor as prescribed and invokes the sole prompt once. Denied T1 allows orderly unlock only after irreversible local denial; CLOSED carries DENIED and cannot authorize a prompt. CLOSED is channel/phase-bound, nonpersistent/nonreplayable control.
- Supervisor death before unlock leaves host-held lock and no prompt. Unlock followed by death before CLOSED leaves host denied/unresolved although unrelated AK may resume. Host death before T1 cannot select success unlock; death after T1 does not prove execution/retirement. No EOF/timeout/finally unconditional unlock. A shared reference does not protect against erroneous explicit unlock by a trusted holder.
- Permanent inode, immediate CLOEXEC after deliberate inheritance, controlled native-operation exceptions only and no provider/tool descriptor leakage are mandatory. Stranded inspection is DB-free and never authorizes PID/age/delete-based unlock. Recovery closes both holders' future admission and accounts for native operations before explicit closure; all-reference kernel closure is not claim/effect retirement.

Post-ADR deterministic cases include T1/T2/CLOSED death windows, stale/duplicate CLOSED, sidecar mismatch, lease expiry while waiting, one/both holders dying, explicit-unlock misuse, FD leakage and projection lag. This supplement supplies compatibility acceptance, not implementation, tests or refreshed source facts.

## Selected source SHA-256 identities

Current AK files:

```text
AGENTS.md 60daaaea2d32e1e3f94129b0f4099b9ef96f8eb0895fc5852fb44a9abd42fe2a
policy/ak-runtime-access.json ec133b538618c9cf228b27100499a70edc73cdc4620ee08e92c658e107964ff6
scripts/ak-runtime-gate.sh 5c0d526eb871d4f742aa477d1c72bd810bd5356344e545f49c0204ee7055a652
docs/project/database-backend-runtime.md 0d1d44b0d23e46e1fb94cb7edff714513d4f91c7bc1bb1ddd80282e0ed58a230
docs/project/database-incident-response.md 7c602e133bfd6d7979d9a2b3e96e73e9441dd41f4eaa59585e92b39fc947e3dc
docs/project/task-scope-authority-contract.md 692a4132a37ef096fffa2ebeeab7bb4f71dba7b4a559e8b71cbdc2fcf514bad8
```

Pinned Git blobs at the approved commit:

```text
crates/ak-core/src/tasks.rs e9ec2d99327ebfc66979281bf1d19e70ec8d50d6a6ed14a6064d0aa556d4f3f2
crates/ak-core/src/decisions.rs 8bdebda29b5dc751d4c0da6bda8836607b122e3da1e3af7a28a27cfa8ca4eb5f
crates/ak-core/src/db.rs 71b8cdd186616306567d1653b03e63d1bddd49933c65a522b4940821e1766e7f
crates/ak-core/src/repo.rs ce929978805365b01fe8da38d27c5292d9786e91873a91c9bd5655466d748d6a
crates/ak-core/src/external_issues.rs 116b77270dadb9476e208ed69fc6439207af3b6a695a733c972a1794cac099bb
crates/ak-cli/src/main.rs c27ff83625da1e32f55f9d3f1db75564ee265f60b24b0c8d493ef4671bbcb4a9
crates/ak-core/src/task_composition_begin.rs 1a683e2c1851a9bae32d1f6e75e640555b3ebb11532b6a1b728ec560b29ec3e7
```

Source inspection only; no schedule/writer census or operational behavior was measured. The finite shared-OFD protocol above records AK/Pi conceptual compatibility; actual owner implementation, enrollment and fault proof remain later prerequisites.
