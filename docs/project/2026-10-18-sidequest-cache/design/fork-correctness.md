---
summary: "Proposed host-owned immutable fork snapshot and cancellable quiescence contract, including unknown external outcomes."
read_when:
  - "Designing /sidequest behavior while parent work or tool effects are unresolved."
---

# Design F — consistent snapshots, honest unknown effects

> **REDACTED historical derivative (AK7403), not byte-identical original evidence.**
> Historical AK7208 proposal only; no current implementation/adoption or live proof.
> Source statements refer to the historical inspection. See [public-copy provenance](../README.md).

This addresses an independently observed **transcript-fidelity concern**, not a proven cache cause. Missing results do not mean no effects. No automatic retry of parent tool calls is permitted by a fork.

## What quiescence means

Distinguish three predicates; never collapse them into an “idle = safe” badge:

1. **Local scheduling quiescence:** no active model/tool run, compaction/branch-summary operation, prompt preprocessing, command-driven mutation, pending persisted delivery, settlement handler or registered background writer that can mutate the captured session. The requesting fork command is excluded from waiting on itself.
2. **Snapshot consistency:** all entries/selected active leaf/checkpoints and context edits are captured at one host-owned revision while new session mutations are held briefly. Shallow arrays and a mutable JSONL filename do not provide this property.
3. **External-effect disposition:** each tracked pending operation is complete, cancelled-before-effect, failed-with-known-disposition, or outcome-unknown. Local quiescence does **not** prove a detached process, remote job, DB write or tool side effect settled. Untracked extension effects are unknown, not empty.

Default wait targets(1), then guarantees(2). It does not promise(3). Unknown external-effect disposition must be shown before launch and carried into the child; where a known running operation affects the intended task, the operator chooses to continue waiting, cancel the launch request, or explicitly fork-now acknowledging that uncertainty. Automatic callers cannot silently acknowledge it.

Current Pi1.1 limitations: `agent-session.js:667–707,1052–1055,1921–1926` has no snapshot reservation; `agent_settled` can expose apparent idle before handlers/deferred prompts finish; `:1517–1658` command/preprocessing and `:3096–3155` bash paths can race. `agent-session-runtime.js:174–233` forks before teardown waits. `session-manager.js:1062–1109` getters are shallow. These need host-owner changes, not a polling extension.

## Proposed host snapshot primitive

Placeholder name `prepareForkSnapshot`, command-context-only in the first implementation. Native host capability/version negotiation is mandatory; unsupported hosts refuse the guaranteed mode before launch, with an honest explanation. No fallback labelled equivalent.

Input binds: requesting session identity/generation, source-history confidentiality classification/company, destination cwd/company and verified provider/account-route identity, branch-selection mode, requested model/provider, wait policy, cancellation signal, exact objective held privately by launch owner. Snapshot API itself does not need objective text.

**Unconditional history-transfer admission:** before any fork, independently of cache-affinity selection, the source owner must permit disclosure of this captured history to the destination company/provider/account boundary. A target CWD, same provider alias, fresh target instructions or ability to launch is not that permission. Initially refuse unknown or cross-boundary transfers unless an explicit source-owner permission covers the exact classified history and destination. Bind the source-native permission reference to the intent; do not invent a new local grant authority. Same known boundary still needs the existing source disclosure policy to apply. Mixed/unclassified legacy history stays unknown, not automatically classified by current CWD. Recheck destination and permission at child bootstrap **before history use or any provider send**; drift/unknown produces a correlated refusal even if a child process already exists. No plaintext snapshot crosses an unadmitted boundary.

Output is an immutable handle/manifest containing:

- snapshot revision and content digest; captured active leaf and parent lineage;
- included context entries/checkpoint and explicit excluded abandoned branches;
- parent-origin historical usage attribution separate from child-origin future usage;
- pending-operation metadata and external-effect knowledge coverage, never automatic task authority;
- model/provider/thinking/settings at snapshot and target resource-discovery policy;
- one new child logical identity allocated exactly once, or a separately bound one-use allocation receipt;
- owner-only artifact identity, lifecycle state, and no raw path published to model telemetry.

**Selected context:** active branch at capture, with compaction checkpoint/context edits and the dependency closure necessary to replay it. Do not send abandoned branches to the model. A native archive can retain historical metadata separately, but the new child starts from the declared leaf, not whichever raw file entry was appended last. The parent session is never rewritten. This is an intentional contract refinement versus current CLI whole-file copy and needs host acceptance.

Snapshot data can contain sensitive prompts, so it is private owned runtime storage, not the content-free telemetry store. Validate owner/mode, no symlink substitution, size bound and immutable digest at parent publication and again before child consumption. Parent validation cannot preclude later substitution: bootstrap refusal may occur after child process dispatch but shall precede snapshot use and provider calls. Parent lineage must remain the original session, not just a scratch-file path. A host-supported snapshot import/fork mechanism is required; using today's `--fork` on a scratch copy without preserving these semantics is not declared equivalent.

### Snapshot storage lifecycle

Proposed owner-approved ceilings:16MiB per snapshot,8 retained snapshots and128MiB aggregate per runtime namespace, including incomplete/cancelled/failed/indeterminate artifacts. Reserve capacity atomically before capture; exhaustion refuses new capture without deleting existing work. Deep-copy time/memory is bounded by this admission; no unbounded pause under the mutation lock. Waiting intents do not allocate raw snapshots.

- Cancelled or confirmed-no-dispatch artifacts: eligible for disposal once no producer/reader owns them.
- Consumed snapshots: dispose only after verified child import and durable lineage/pending-outcome state transfer, with no remaining reader; ordinary child session retention remains a separate existing policy, not silently shortened here.
- Failed publication/bootstrap: preserve classification and custody until verified inactive; never treat failure as proof the artifact has no reader.
- Indeterminate launch: retain custody and sufficient artifact until owner reconciliation; no timed deletion or automatic retry while live readers/effects remain possible.
- Maximum intended raw-snapshot retention:24h from capture, not from eventual completion. At expiry, stop new capture in the affected namespace, reconcile liveness and dispose only proven owned/inactive artifacts. If unsafe to dispose, restrict access and report an overdue retention obligation with owner; do not claim deletion or evict a running child's data.
- Crash/restart scans only its journaled owned namespace, reconciles process identity/reader custody and reserved bytes, and launches nothing. Lease expiry alone does not prove process death. No cleanup of unrelated snapshots/sessions.

These limits bound allocation and stop growth; they cannot guarantee deletion by a deadline when reader/effect custody is uncertain. That residual privacy obligation requires owner resolution and is not hidden by quota compliance.

## State machine and linearization

```text
REQUESTED → WAITING → RESERVING → CAPTURED → ADMISSION_CHECK → DISPATCHING
    │          │          │           │             │              │
    └──────────┴──────────┴───────────┴─────────────┘              ├→ LAUNCHED
              CANCELLED / REFUSED                                  ├→ NO_EFFECTS
                                                                  └→ INDETERMINATE
```

1. Register a launch intent bound to session/generation. It is not a child or admission permit. No paid call or terminal launch while waiting.
2. Wait outside an active-run awaited callback. Do not hold a mutex while waiting for tools, callbacks or network I/O. Commands called reentrantly from an active tool/lifecycle boundary fail with a typed self-wait explanation rather than deadlock.
3. At a candidate scheduling boundary, acquire host session-mutation serialization, recheck every predicate and captured identity. New mutations either precede capture or queue after it; no half-included writes. If busy again, release and wait.
4. Deep-copy/freeze the selected dependency closure under the short serialization interval; reserve exact revision/leaf. Release the lock before disk flush, UI, admission or Ghostty operations. Subsequent parent work may continue on a later revision.
5. Durably publish snapshot before launch. If publication fails, there is no child dispatch; owned incomplete artifacts remain classified, not mistaken for ready snapshots. No file is removed unless owned and inactive.
6. Recheck target identity/company and supported launch admission. Parent progressing is not drift by itself—the snapshot names an earlier revision. A parent session switch, target/company change or model override requires a new explicit request/reconfirmation, not silently rebound lineage.
7. Use supported launch with a one-use snapshot/intent identity. Keep existing transport effect-disposition handling. No automatic duplicate launch after uncertain settlement.
8. A correlated child bootstrap acknowledgment proves consumption of this snapshot/identity, not model cache reuse, pixels/placement, completion or external-effect safety. Launch/display facts remain separate.

The **capture linearization point** is the deep-frozen revision under host mutation serialization. Launch is later and separately admitted. Queue events arriving after that point remain parent work and cannot mutate the child snapshot. There is no process-wide/global lock.

### Wait, cancel and starvation

- No routine wall-clock deadline. A healthy long tool may take hours. Show waiting duration, known blocker classes and whether external outcomes are unknown, without dumping tool arguments.
- Operator can cancel **the launch intent**, not the parent run. No implicit tool abort, rollback or compensation. Explicit aborting parent work would be a separate command/authorization.
- A user-selected deadline is permitted; expiry cancels pre-dispatch intent and reports that nothing was launched *by this intent*. It is not proof of no parent effects.
- Continued queued work can starve the default wait. Report “waiting; parent continues”; offer explicit fork-now or cancel. Do not inject steering to force settlement or silently drop pending messages.
- Cancel before dispatch returns confirmed no dispatch by this intent. Cancel racing `send`/Ghostty dispatch is indeterminate until existing custody/receipt proves otherwise; never relabel it no-effects. Cancel after launch does not kill the child.
- On restart, never automatically execute retained pending intents. Reconcile snapshots and launch receipts, then require explicit operator continuation. Reload/session replacement invalidates old command context and cannot reuse stale captured closures.

## Explicit fork-now

Fork-now bypasses **waiting**, not consistency, identity checks, freshness or launch admission. It captures an atomic prefix at the chosen revision while tracked work may still be running. Confirmation must identify unresolved operation count/classes and say:

> Parent operations may already have effects. Their outcomes are unknown in this snapshot. Do not retry them on the basis of missing results. Reconcile with the parent or the owning service before dependent work.

The child receives an append-only advisory manifest after inherited context, listing bounded source-qualified operation references and statuses. Deterministic host guarantees are **no automatic replay of inherited calls** and faithful unknown-outcome propagation. An LLM may still request a semantically equivalent operation; a warning alone cannot prevent that universally. Bounded model-behavior tests assess compliance but are not enforcement. Work requiring stronger duplicate-effect prevention needs the tool/service owner's operation reconciliation/admission or idempotency contract; if absent, dependent non-idempotent actions remain blocked by that owner policy. The fork feature neither invents that authority nor promises semantic-equivalence detection. It is not an AK grant or a synthetic successful/failed tool result. Existing provider-validity synthesis may still be required; mark it as adapter-synthesized and pair it with explicit unknown-outcome semantics. Never forge provider signatures, rewrite original tool calls or re-execute them to fill gaps.

Do not promise complete tracking of arbitrary tool-spawned background processes. The manifest includes `effect_coverage: tracked_only | unknown`, and an empty list with unknown coverage is not an all-clear. A late parent completion is not silently merged into the child; any later verified result is an append-only, source-qualified update subject to normal context/authority rules.

## Manual command versus model-callable tools

Manual `/sidequest` is the first target. `fork_peer_spawn` is invoked during an active agent turn and cannot synchronously wait for its own settlement. The shared low-level snapshot primitive still applies, but **do not silently break the existing launch-facts tool contract**.

Owner decision required before expanding the default to tool callers:

- Recommended new/versioned asynchronous intent contract: return `pending` intent ID, no peer/session ID yet; host may launch after settlement and independent admission, emitting a separate correlated receipt. Controller must not call `peer_watch` or await PEER_ACK before a launched receipt. A pending intent can be cancelled without a child.
- For current synchronous tool semantics, do not claim quiescent snapshots. Either explicitly support operator-authorized fork-now with uncertainty, or refuse that request and direct the operator to the command. Availability changes need their own compatibility decision and tests.
- Never accept caller-supplied `acknowledged:true` as human authorization or bypass source-owner admission. Exact evidence of operator choice must be host-bound and one-use.

No automatic controller mutation authority is added by copying context. Distinguish visible parallel cognition from task claims/permissions.

## Acceptance and adverse effects

A consistent snapshot prevents partial-history replay; waiting avoids a subset of synthetic missing results. Neither guarantees cache hits. Costs: delayed parallelism, larger private artifacts, stale snapshot if parent continues, added host complexity and possible starvation. Agents may substitute clean workers to avoid wait, losing context or repeating work. Explicit revision/freshness, bounded snapshots, no silent retries and versioned tool semantics damp these effects.

Fail the design implementation if tests can interleave a mutation across capture, preserve a stale context after session switch, deadlock a reentrant command, label detached work settled, automatically replay an inherited pending call, present advisory model compliance as universal duplicate-effect prevention, duplicate an indeterminate launch, or hide the fact that a snapshot precedes later parent evidence. Revert the new default only under owner control; never delete parent history or auto-run a pending intent as rollback.
