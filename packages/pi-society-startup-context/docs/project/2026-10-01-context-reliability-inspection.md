---
summary: "Architecture, plan and dogfood protocol inspection findings and dispositions for Society context reliability."
system4d:
  container: "Architecture and execution inspection lineage projection."
  compass: "Keep specification acceptance distinct from implementation proof."
  engine: "Record findings -> disposition -> independently reinspect."
  fog: "Implementation and runtime inspections remain separate obligations."
read_when:
  - "Checking the inspection lineage or proof limits for AK6391/AK6392."
---
# Work-product inspection ledger

## Architecture / plan / dogfood protocol

Independent inspector: ASC dispatch `dispatch-1790845675562`. Initial inspection found six blockers. Reinspection on 2026-10-01 read both revised documents completely and reported: design passes specification inspection; plan passes for adoption; dogfood protocol passes as a planned protocol. No implementation, runtime, authority or performance proof is implied.

| Finding | Disposition before adoption |
|---|---|
| Envelope validity mistaken for payload-semantic health | RFC requires strict per-surface arrays/types and rejects data from wrong-envelope/nonzero-exit responses. Health is independent of warning truncation. |
| Cache could affect ordinary readiness or survive transaction retries | RFC requires explicit startup-only seam and a fresh success cache inside each transaction-attempt closure. |
| Leader exit mistaken for process-group settlement | RFC separates leader/group settlement; TERM grace 250 ms, mandatory escalation, bounded 2 s cleanup checks and cleanup_failure. Escaped sessions are outside group containment. |
| ak-dev proof could exercise old pin | Plan requires explicit immutable candidate `--binary`, source/binary SHA and provenance plus rollback rehearsal. |
| Candidate TUI could skip collection or load duplicate collectors | Protocol requires private agent config, exactly one extension, unchanged HOME, registered canonical cwd, explicit loaded-path/hash and real call-count proof. |
| Optimized installed proof was ordered before publication | Protocol separates installed baseline/candidate proof from post-promotion installed proof. |

Optional inspector clarifications adopted: packed extension must load from extracted tarball with no repo/dev-dependency fallback; compatibility preserves valid payload projections, not malformed/rejected-data behavior; effective config fingerprint, earliest-observation TTL, healthy-only reset, capped jitter are explicit.

Operator approved the inspected architecture via interview: “Approve and implement the inspected design.” The prior scope/publication interview authorized end-to-end Pi plus AK implementation and gated/runtime publication. AK decision state remains adoption authority; this file records the inspection and operator input, not a substitute state machine.

## Implementation and execution inspections

### Consumer source inspection and initial bounded repair — 2026-10-01

Historical first-repair receipt: reinspection found two remaining P1 defects; see the follow-up below. These checks did not discharge factory-reload ownership or pre-KILL zombie-subset ambiguity.

Independent source inspection `dispatch-1790850568341` found four blocking defects in the initial consumer candidate. The following are implementer repair dispositions with local regression evidence, **not independent reinspection acceptance**. Architecture/plan/dogfood metadata and the adopted decision projection above are preserved.

Candidate: uncommitted package-only work in `ak6391-wt`, based on `ad737d50fa6147fd0dbda2aea921b6ba4ed47f75`. No AK mutation, producer edit, canonical edit, commit, activation, global install or publication occurred.

| Finding | Repair and regression evidence |
|---|---|
| F1: completed cleanup-failure promise mistaken for settled ownership | `OwnedReaders` retains unresolved resource handles separately from completed promises. Controller views stay degraded/stale/unknown in `blocked_cleanup`; manual refresh, due retry and cwd/config replacement cannot launch reads while proof remains unavailable. Controller restart/shutdown do not clear the retained barrier. Replacement also checks the barrier after predecessor completion. [Controller/native-receipt tests](../../tests/cleanup-barrier.test.ts) and [registered-adapter tests](../../tests/registered-cleanup.test.ts) cover supersession, promise completion, config change, manual/due demand, warning suppression and recovery only after actual settlement observation. |
| F2: one non-atomic empty proc scan cached as group absence | Cache absence only after kernel `kill(-pgid, 0)` reports ESRCH. Empty censuses cannot suppress TERM/KILL. Guard leader start time before/after census and before group signalling; check session/UID. Zombie-only settlement requires two nonempty stable PID/start-time-matched censuses. The [controlled fork/exit handoff](../../tests/cleanup-barrier.test.ts) injects an empty census, observes TERM and independently reads the fixture's PID/start/state after settlement; it does not use the runner scanner as its liveness oracle. |
| F3: unsafe integers and silently coerced optional fields | Check original emitted values before projection: safe integer IDs/counts, safe derived claimed-plus-running sum, integer priorities 0–4, string/null `claimed_by`, legal task statuses and typed optional count/metadata fields. Preserve valid empty claimed-by strings rather than coercing them to null. [Negative regressions](../../tests/payload-integers.test.ts) assert degraded health, absent facts and uncapped warning accounting with `MAX_WARNINGS=0`. |
| F4: idle footer remains ready past TTL | A generation-bound one-shot UI expiry update clears readiness at the monotonic TTL deadline, without collection/retry polling. Cancel on replacement/new collection/shutdown; recheck identity/deadline. [Registered idle test](../../tests/idle-expiry.test.ts) expires the footer without another prompt and verifies no new collection, no repeated expiry updates, and cancellation on replacement/shutdown. |
| Optional: arbitrary 50 ms success drain | Require stdout and stderr EOF within a bounded drain budget; interrupted/incomplete output is not success and preserves cancellation/timeout provenance. [Output tests](../../tests/output-completion.test.ts) cover 900 KB complete output and an escaped fixture holding inherited pipes open (`output_incomplete`). |
| Optional: entire `src` packed | Manifest names exactly the four imported modules. The [isolated extracted-tarball test](../../tests/packed-package.test.ts) loads/registers on a production-only host and checks the missing-module negative control, without repo/dev-dependency fallback. |

### Actual local checks

- Root-sourced `scripts/select-gate-node.sh`: Node **22.23.3**, npm **12.0.2**.
- `npm test` and `npm run check`: both full package gates passed, **43 tests across 13 files**, zero failed/skipped. Gates included lint, typecheck, structure, file budgets, packed-file whitelist and release dry-run checks; the existing registry version guard is handled by the declared gate, not publication.
- Direct `tsc --noEmit` and regression run passed. The large extension is **1341 LOC / 47894 bytes**, below its existing 1418-LOC ratchet; new runtime modules are **375/92/213/261 LOC**, all below 500 LOC/50 KB. No exception policy was edited.
- Post-ledger strict canonical docs metadata check, package structure check, tracked and all-file budget audits, and `git diff --check` passed.
- Gate logs: `$TMPDIR/ak6391-fixes-npm-test.log`, `$TMPDIR/ak6391-fixes-npm-check.log`; docs receipt: `$TMPDIR/ak6391-fixes-docs-check.log`. Implementer self-review covered the runtime diff and new transport/lifecycle/payload modules; this does not replace independent inspection.

Initial-repair runtime SHA-256 identifiers (superseded by the follow-up source below):

| Package-relative path | SHA-256 |
|---|---|
| `extensions/society-context.ts` | `a1ec960ec2a1feef27ab25809d6e76fec7506716e7edb62566319888451f0175` |
| `src/command-runner.ts` | `46b587929419a2cb28d1d8f155b9a04ccc03eb068d02b2677d315ec5c3c9b585` |
| `src/config.ts` | `461ce640f0e25fcd897957ec3c6f73488e3cf5d0a9b9235d16f6645ee894634a` |
| `src/payload-check.ts` | `8ec97b2787cd654a214fc1245bcbb33c76f09280ea59c5f66e4cf0fba9afc363` |
| `src/refresh-lifecycle.ts` | `e3d75acc9b9c56c948b8da8a532ff148369a508a12ee4dff9ef297dcc7c5c0ea` |

### Proof limits and next owner action

Independent reinspection and parent-owned AK/Ghostty dogfood remain pending. Local fixtures are not proof of installed AK capacity or deployed generations. Linux ownership/settlement depends on available kernel/proc observations; uncertain ownership remains blocked indefinitely rather than being reset or re-signalled unsafely. Deliberate group/session escape is outside containment, and non-Linux fallbacks have no local tree-proof claim. Controller restart retention is tested; starting an unrelated new process/runtime is not a settlement proof or a cross-process recovery mechanism. Parent should reinspect these dispositions and exercise real-source/TUI behavior before any separately authorized publication.

### Two remaining P1 source blockers — reinspection follow-up

Reinspection of `dispatch-1790850568341` rejected two incomplete first-repair dispositions. This follow-up initially recorded implementer execution/evidence only. Final independent source acceptance and candidate TUI proof are recorded below; promoted-runtime proof remains pending. Parent-authored architecture/plan/dogfood and decision metadata above are unchanged.

1. **New factory lost unresolved ownership.** The adapter now supplies `reloadStableReaders` when the first session/command context becomes available. A process/realm-local `globalThis`/`Symbol.for` registry keys readers by normalized source-module URL (query/hash stripped) and opaque host `SessionManager` object identity. The pinned Pi 0.84.4 host source retains that object through reload/rebinding; `pi`, `ctx`, cwd, config fingerprints and session-id strings are not stable ownership keys. New factories get the same receipt registry, never the previous lifecycle or authority packet. Unresolved receipts pin their owner/registry; only actual settlement observation releases that pin. Healthy owner entries are weak, config changes add no keys, and default serial collection stops at its first cleanup failure. There is no age/GC/shutdown eviction or idle probe; necessary unresolved owners cannot be safely hard-capped by dropping receipts. Distinct SDK managers/module owners are not mutexed. The minimal no-manager test-adapter fallback is API-object-local and is not a host reload guarantee.
   - [New-factory/module regression](../../tests/factory-reload.test.ts): first registered instance receives an actual native `cleanup_failure`, then shuts down; cache-busted module/factory re-evaluation initializes a second instance. Startup, manual refresh, due prompt demand and config replacement remain blocked/degraded with no old queue facts. A distinct manager with identical cwd/session-id strings collects independently. Recovery publishes only newly collected facts after the old native receipt's actual settlement observation succeeds.
2. **Matching zombie subsets were not completeness proof.** The runner now records successful ownership-guarded SIGKILL delivery. While the kernel group exists, zombie-only observations cannot settle before that escalation. TERM/KILL still run after leader exit; KILL errors/unknown ownership never set the delivery flag. Atomic kernel absence independently proves absence; otherwise only post-KILL stable nonempty PID/start-matched zombie observations may settle. Existing leader start-time, session/UID and PID-reuse guards remain intact; no unproven group is re-signalled during retained-resource observation.
   - [Zombie-subset negative controls](../../tests/zombie-escalation.test.ts): a controlled fork/exit relay leaves an independently identified live TERM-ignoring descendant in the actual owned group. Injected matching zombie-only censuses cannot bypass TERM/KILL. The successful path observes TERM and physical termination of that PID/start pair; the unavailable-ownership path leaves it live, returns `cleanup_failure`, and retains an unsettled receipt. Fixture cleanup uses independent PID/start identity and confirms inactivity before removing scratch.

Follow-up final receipt: root-selected **Node 22.23.3**, npm **12.0.2**; both full `npm test` and `npm run check` passed with **46 tests across 15 files**, zero failed/skipped. The prior 43 tests are unchanged; three new regressions cover the two P1 defects. Gates included lint, typecheck, structure, tracked budgets, the 13-file packed whitelist, isolated production-host loading and release dry-run checks (no publication). Direct focused regressions and `tsc --noEmit` also passed. Extension: **1361 LOC / 48572 bytes**, below the unchanged 1418-LOC ratchet; runner: **420 LOC / 14390 bytes**, below 500 LOC/50 KB. No exception policy, manifest allowlist, producer, AK state, canonical checkout or live installation was changed in this follow-up.

Receipts: `$TMPDIR/ak6391-reinspection-npm-test.log`, `$TMPDIR/ak6391-reinspection-npm-check.log`, `$TMPDIR/ak6391-reinspection-regressions.log`. Follow-up checked runtime fingerprints (other three modules unchanged from the earlier table):

| Package-relative path | SHA-256 |
|---|---|
| `extensions/society-context.ts` | `72efe0925b47369479ea4fa329e70cd781af087d2e46551d9bb122974362cbc6` |
| `src/command-runner.ts` | `76bbdebd916313cdc52e6a3e199e65f0d09e92c6f70639808d1aa7b5d8d2c631` |

Coverage limits: tests exercise registered adapters, new factories, ESM module re-evaluation and actual Linux subprocesses, not a live TUI/AK or a full production `AgentSession.reload()` transaction. Host identity continuity was inspected in the pinned host source. Namespace continuity requires the same process/realm, source-module owner path and retained manager object; changing any owner is not settlement or cross-process recovery. Escaped groups/sessions and non-Linux tree containment remain outside local proof. Unavailable ownership stays blocked indefinitely. Next action: parent independently reinspect both P1 dispositions before any separately authorized live proof or publication.

### Final independent source acceptance and candidate TUI proof

Reviewer `dispatch-1790850568341` subsequently passed the bounded final source slice: factory-reload receipt retention and ownership-guarded KILL before zombie-only settlement are accepted, with no open source blocker identified. On continuation after a websocket interruption, the reviewer recovered that completed verdict from its retained session; it did not rerun inspection. Accepted runtime hashes are the final two hashes above plus the unchanged config, payload and lifecycle hashes in the earlier table.

Parent package verification passed on pinned Node 22.23.3; the real TUI probe completed before the interruption. Post-run verifier and independent tester `dispatch-1790865721436` then passed the bounded candidate behavior after inspecting raw callbacks, command records and native terminal output. The tester confirmed three approximately 252 ms prompt waits, default 45 s timeout degradation, recovery on activity, native `/reload`, five-minute TTL expiry without idle AK probes, and recovery after expiry. The native reload occurred after settlement, not during unresolved cleanup; deterministic factory-reload tests cover the latter seam. No producer or promoted-runtime proof follows.

The original `verified.json` checks command-registration counts under a startup-registration label; the independent tester separately checked the actual startup-handler registrations. TTL is measured from collection start, not from the inspection command. Current recorded PID absence does not independently prove all descendant/group settlement schedules.

Evidence and retention: [candidate dogfood receipt](2026-10-01-context-reliability-dogfood.md), with hash-bound raw event/call captures and a retained named-artifact archive outside scratch. Canonical landing, CI and post-promotion verification remain open obligations.
