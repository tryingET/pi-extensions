---
summary: "RFC for lossless, disposition-bound candidate-peer lifecycle management after the 2026-07-13 registry census."
read_when:
  - "Changing candidate peer registry, review, archive, or cleanup behavior."
  - "Designing fan-in and terminal disposition for candidate worktrees."
type: "rfc"
status: "proposed"
system4d:
  container: "Candidate-peer lifecycle control in pi-little-helpers with owner-review and orchestrator handoff boundaries."
  compass: "Every candidate receives owner review and a terminal disposition without silent promotion or data loss."
  engine: "inventory -> review -> disposition -> integration proof when accepted -> lossless archive -> exact cleanup authorization -> terminal receipt."
  fog: "Operational lifecycle records enforce cleanup safety; they are not AK evidence or promotion authority."
---

# RFC: Candidate peer lifecycle v2

## Problem

The 2026-07-13 census found 302 registry records representing 225 physical worktrees and approximately 142 GB. Review classified 22 candidates for scoped acceptance, 10 as rejected/superseded, 30 for preservation, 93 as archive-and-clean, three as process-blocked, and 67 already missing.

This is a lifecycle-model failure:

- reused worktrees create several cleanup owners for one physical resource;
- registry v1 stores launch state but no review disposition or terminal state;
- historical cleanup archives omitted untracked file bytes and verified loss occurred;
- ignored files have no explicit preserve/discard decision;
- cleanup accepted an unbound `integrationCloseoutStatus: successful` assertion;
- `repoRoot` can point at a transient linked worktree or `/tmp` checkout;
- no inventory/admission gate forces fan-in before more candidates are spawned.

The reviewed census is [candidate-peer-lifecycle-reconciliation.md](2026-07-13-candidate-peer-lifecycle-reconciliation.md).

## Decision requested

Adopt one resource-level lifecycle for candidate worktrees while retaining peer-run attempts as communication lineage. Permanently quarantine v1 cleanup packets from execution. Promotion, integration, disposition, archive, and cleanup remain separate operations.

## Owner and authority matrix

| Concern | Canonical owner | Lifecycle v2 role |
|---|---|---|
| Worktree creation, resource record, lock, archive verification, exact removal | `pi-little-helpers` | Owns local operational enforcement and receipts. |
| Candidate quality review and disposition | operator/controller acting for the target owner repo | Supplies a signed/hash-bound owner assertion; peer text alone is insufficient. |
| Target branch, validation, integration commit, accepted-scope coverage | target repository owner | Produces exact integration proof. |
| Fan-in routing and cleanup handoff projection | `pi-society-orchestrator` | May request/transport typed artifacts; cannot manufacture disposition or authorization. |
| Task, decision, evidence, lineage | AK | Stores canonical work authority and references when intentionally recorded; does not own worktree bytes. |
| Peer report and session state | intercom/Pi | Communication and activity hints only. |

`pi-little-helpers` enforces owner assertions but does not become acceptance, promotion, AK, KES, publication, or product-direction authority.

## Immutable resource identity and generations

On first candidate creation, `pi-little-helpers` assigns a random immutable `candidateResourceId`. Every physical worktree incarnation receives an immutable `generationId`. Reuse adds a peer-run alias to the same resource/generation; removal followed by recreation at the same path creates a new generation.

Identity fields:

- `candidateResourceId` and `generationId` are immutable primary identity;
- peer-run ids are attempt aliases, never cleanup owners;
- canonical real paths of the worktree and `git rev-parse --git-common-dir` are verification observations;
- repository root commit and normalized configured remotes are relocation evidence;
- branch, base, HEAD, worktree path, owner-root locator, and status are mutable versioned observations, not identity.

The durable owner checkout must be outside the generated candidate-worktree root and use the same Git common directory. Relocation or remote/path drift requires an explicit owner reconciliation transition. A missing path is never assumed deleted or disposable.

## Resource lock and versioning

All spawn/reuse, review capture, archive, authorization, cleanup, and reconciliation operations use an exclusive resource lock plus compare-and-swap `resourceVersion`.

- First spawn/admission uses a repository-level admission lock so resource creation and pressure accounting are atomic.
- The resource lock is created atomically beneath the owner-only lifecycle state root.
- The lease binds resource/generation, operation, process id plus process-start identity, Pi session when available, actor, acquisition time, and bounded expiry.
- Ordinary expiry does not authorize breaking a lease. Stale recovery is a separate owner action that proves process-start/session mismatch, records the prior lease, increments `resourceVersion`, and emits a recovery receipt.
- Destructive execution reacquires the lock and revalidates every bound digest immediately before each effect.
- Any concurrent alias, review, content, ref, archive, authorization, or relocation change invalidates the operation.

## Normative states and transitions

| From | Event | To | Required effect/evidence |
|---|---|---|---|
| — | spawn admitted | `open` | Create resource/generation under lock; reserve pressure budget. |
| `open` | launch fails, peer exits, or no final report | `review_pending` | Owner may force review; `PEER_FINAL` is not required. |
| `open` | peer final observed | `final_reported` | Communication receipt only. |
| `final_reported` | owner begins review | `review_pending` | Capture review snapshot. |
| `review_pending` | owner defers | `deferred` | Reason and review date; no cleanup eligibility. |
| `deferred` | owner resumes or drift occurs | `review_pending` | New review snapshot required. |
| `review_pending` | owner accepts/rejects/supersedes | `accepted` / `rejected` / `superseded` | Immutable disposition assertion bound to reviewed content. |
| any nonterminal pre-cleanup state | bound content/ref/alias drift | `review_pending` | Revoke disposition, proof, archive, and authorization descendants. |
| any nonterminal state before the first cleanup effect | resource appears missing | `missing_investigation` | Run absence/recoverability checks; do not infer loss. |
| `missing_investigation` | resource rediscovered/relocated | `review_pending` | Explicit reconciliation and fresh review. |
| `missing_investigation` | owner confirms absence | `reconciled_missing` | Terminal receipt records recoverable/lost material; release active reservation and retain historical loss accounting. |
| `accepted` | target owner proves integration | `integration_verified` | Exact target commit and coverage proof. |
| `rejected` / `superseded` | archive requested | `archive_pending` | No integration proof required. |
| `integration_verified` | archive requested | `archive_pending` | Accepted scope/exclusions carried forward. |
| `archive_pending` | verified archive atomically published | `archive_verified` | Archive digest and restoration verification. |
| `archive_verified` | owner issues exact authorization | `cleanup_authorized` | Separate immutable authorization with expiry. |
| `cleanup_authorized` | one or more cleanup effects succeed but sequence incomplete | `cleanup_partial` | Receipt for every attempted effect; retain retry/rollback data. |
| `cleanup_authorized` / `cleanup_partial` | exact authorized sequence completes | `cleaned` | Terminal receipt; pressure reservation released. |
| `cleanup_partial` | unchanged authorization remains valid and retry starts | `cleanup_partial` / `cleaned` | Probe and perform only remaining effects; never replay a proven effect. |
| `cleanup_authorized` before any effect | expiry, revocation, or binding drift | `review_pending` | Append revocation receipt; no destructive effect occurred. |
| `cleanup_partial` after a receipted effect | expiry, revocation, drift, or remaining-effect mismatch | `cleanup_partial_review` | Preserve completed-effect receipts; stop without pretending the removed worktree is unexpectedly missing. |
| `cleanup_partial_review` with worktree still present | owner restarts review after content/ref drift | `review_pending` | Carry completed-effect receipts, revoke prior review/proof/archive/authorization lineage, and perform a fresh review/archive cycle; never target the same closed process identity again. |
| `cleanup_partial_review` with worktree already removed and verified archive unchanged | owner reauthorizes exact remaining effects | `cleanup_partial` | Superseding authorization binds surviving refs/processes, prior receipts, verified archive, expiry, and new nonce. |
| `cleanup_partial_review` | owner waives any remaining effects | `closed_with_retained_effects` | Terminal receipt names every retained worktree/branch/process resource and rationale; completed effects remain immutable. |

Every mutation is append-receipted and compare-and-swap guarded. A partial sequence that only closed a process does not reuse the stale archive after worktree drift: the still-present worktree returns through fresh review, integration proof where applicable, and restoration-verified archive while retaining the prior process-effect receipt. If the worktree was already removed, only the unchanged verified archive and exact surviving refs can support remaining-effect reauthorization. `cleaned`, `closed_with_retained_effects`, and `reconciled_missing` are terminal and release active pressure reservations. Historical age/bytes/loss/retained-resource metrics remain in inventory without blocking new admission. Rediscovery after a missing terminal receipt creates a new generation linked to the reconciliation anomaly.

## Review snapshot and disposition binding

A review snapshot binds:

- resource/generation, every peer alias, `resourceVersion`, repository identity observations;
- branch, base, reviewed HEAD, index tree, tracked tree/diff digest;
- for every staged, modified, untracked, and ignored object: NUL-safe path, object type, mode, size, symlink target without dereference, and content hash where a regular file is readable;
- submodule/nested-repository/LFS-pointer classification;
- reviewer/operator identity and timestamp;
- rationale, selected scope/exclusions, and validation references.

Sockets, devices, out-of-root traversal, unreadable objects, nested repositories not explicitly handled, symlink escapes, and unsupported LFS material fail closed. Any byte/type/mode/path/ref/alias change revokes the disposition and downstream proof/authorization.

A disposition is one of `accepted`, `rejected`, `superseded`, or `deferred`. Acceptance identifies the exact selected commit set or content scope; it never implicitly accepts the whole worktree.

## Exact integration proof

Accepted cleanup requires a proof against an immutable target commit OID, never merely a branch name. The proof declares one or more accepted forms:

1. **Commit inclusion:** every selected candidate commit is an ancestor of the exact target OID.
2. **Patch equivalence:** selected commit patch ids and exact scoped path coverage match target commits; exclusions are explicit.
3. **Squash/content coverage:** the normalized accepted tree delta for the declared path scope equals the target tree delta, with explicit exclusions and no candidate-only accepted bytes omitted.

The target owner attaches validation references and an integration-proof digest. Target movement, candidate drift, changed scope/exclusions, or failed validation invalidates the proof. A proof can establish integration only; it cannot authorize cleanup.

## Lossless archive contract

Archive publication is owner-only (`0700` directories, `0600` files), atomic, and complete only when verification and byte-for-byte restoration pass.

It contains:

- lifecycle record and every peer-run alias;
- disposition, integration proof when applicable, and review snapshot;
- branch bundle and exact refs/OIDs;
- tracked/staged binary diffs;
- untracked bytes and, unless explicitly discarded by the owner, ignored bytes;
- NUL-safe object manifests including type/mode/size/hash/symlink target;
- explicit path-level discard assertions naming actor, rationale, and digest;
- hashes for every archive object;
- before/after capture snapshots and verification output.

Symlinks are archived as links and never dereferenced outside the worktree. Special files, traversal, live mutation, unsupported nested repositories/LFS state, or restoration mismatch block completion. Verification includes hashes, bundle validity, archive integrity, and restoration into an isolated directory whose manifest must match the reviewed archive scope byte-for-byte.

Existing complete archives are verified and reused on retry; partial staging directories are not authority. V1 archives may be retained as evidence but never upgraded to verified status without recapture/restoration proof.

## Separate cleanup authorization and effects

Cleanup authorization is an immutable owner/operator assertion containing:

- resource/generation and current `resourceVersion`;
- every peer alias;
- disposition/review/archive digests;
- integration-proof digest and immutable target OID when accepted;
- expected worktree real path, Git common-dir observation, branch ref and OID;
- authorized effects (optional exact process closure, worktree removal, branch deletion);
- authenticated local-owner actor, issue time, bounded expiry, and nonce.

“Owner-signed” means an authenticated local-owner receipt under the configured owner boundary; cryptographic signatures are optional unless the owner policy requires them. Authorization is immutable. Revocation is a separate append-only receipt bound to its digest, never a mutable field inside the assertion.

Cleanup reacquires the resource lock, verifies authorization and all bindings, confirms no live editor/process lease, and performs effects in this order:

1. verify the already-complete archive again;
2. optionally close only the exact resource-bound process after archive verification;
3. remove the exact worktree generation;
4. delete the exact branch only if its ref still equals the authorized OID;
5. append and verify the terminal receipt.

Every effect is idempotently probed before execution. Partial success enters `cleanup_partial`. Under unchanged authorization, retry resumes only remaining effects under a fresh lock. Expiry, revocation, or drift after a receipted effect enters `cleanup_partial_review`: completed effects are never replayed and known authorized removals are not misclassified as disappearance. A still-present drifted worktree requires a fresh review/proof/archive lineage; an already-removed worktree may continue only from its unchanged verified archive and exact surviving refs. The owner may instead close with any remaining worktree, branch, or process resources explicitly retained. No operation merges, pushes, opens a PR, mutates AK, publishes, or promotes.

## Missing-resource reconciliation

Before `reconciled_missing`, inspect all peer aliases, Git worktree metadata, canonical/common-dir alternatives, refs, reflogs where available, reachable objects, bundles/archives, known relocation evidence, and owner receipts. Distinguish missing path, moved worktree, unavailable storage, stale registry, partial cleanup, and confirmed loss.

The owner records what remains recoverable, what is confirmed lost, supporting hashes/locations, and whether a restored/new generation should be opened. Rediscovery after terminal reconciliation is an anomaly linked to a new generation; history is never overwritten.

## Inventory, admission, and pressure control

Expose a read-only inventory grouped by resource/generation with age, size, aliases, activity/lease, dirtiness, unique/equivalent patches, archive/disposition state, pressure reservation, and blockers.

Owner configuration defines repository and global warning/block thresholds for unresolved count, bytes, and age. Admission is evaluated under the repository lock with a fresh inventory and prospective reservation. A warning acknowledgement binds actor, inventory digest, threshold, reason, and short expiry; it does not permit crossing the hard block. Emergency override is a separate authenticated, time-bounded owner artifact and never authorizes cleanup.

`cleaned`, `closed_with_retained_effects`, and `reconciled_missing` release active count/byte reservations atomically with their terminal receipt. Reconciled loss and intentionally retained refs remain visible as historical metrics but do not consume unresolved admission capacity. Migrated v1 records begin with a measured provisional reservation; grouping deduplicates alias reservations, and terminal migration reconciliation releases that provisional reservation exactly once.

## Immediate P0 hold

AK task 3927 landed a pre-decision safety correction:

- every destructive `candidate_peer_cleanup` execution fails before reading/executing serialized packets;
- dry-run inventory remains available;
- prospective new-record archive packets preserve untracked bytes, block ignored files, use owner-only permissions, compare pre/post HEAD/path/content state, and verify hashes/bundle/compression;
- duplicate aliases are surfaced in dry-run inventory.
- a state-root backlog marker blocks updated/reloaded `candidate_peer_spawn` and `/parallelquest` paths before Git mutation.

The global cleanup hold protects historical unsafe v1 packets. The separate spawn hold pauses new candidate creation after the registry grew from 302 to 308 records and from approximately 142 GB to 143 GB during reconciliation. It does not implement v2, authorize cleanup, or make the prospective packet sufficient for restoration-grade v2 archives.

## Implementation checkpoint — 2026-07-13

The first lifecycle-v2 implementation checkpoint is landed in `pi-little-helpers` without releasing either hold:

- `candidatePeerLifecycleV2.ts` provides deterministic v1 alias grouping, immutable migrated resource/generation identifiers, owner-only records/events, exclusive resource locks, compare-and-swap versions, byte/type/mode review snapshots, disposition receipts, exact commit-inclusion proof, patch-equivalence proof, normalized content-coverage proof, durable owner-root reconciliation, and explicit missing-resource reconciliation;
- `candidatePeerLifecycleArchive.ts` provides owner-only atomic archives, full-index binary tracked/staged patches, untracked and explicitly retained ignored bytes, branch bundles, hash manifests, isolated restoration equality, expiring exact cleanup authorization, process-lease checks, effect receipts, and terminal cleanup records;
- `candidate-lifecycle-v2.mjs` exposes explicit inventory, migration, review, disposition, commit-inclusion/patch-equivalence/content-coverage integration proof, owner-root reconciliation, archive, authorization, cleanup, and missing-reconciliation operations. It never executes v1 packets;
- synthetic tests prove alias grouping, lock/CAS exclusion, missing reconciliation, post-review drift rejection, restoration of staged/unstaged/untracked bytes, patch-equivalence binding, separate authorization, exact worktree/branch removal, and retained verified archives. Production cohorts additionally exercised durable owner-root reconciliation and normalized content-coverage proofs against immutable owner target OIDs.

The fresh migration inventory captured **309 registry aliases grouped into 226 resources: 157 present and 69 missing**. The seven aliases added after the original 302-record census represent one new physical AK resource plus six additional aliases to previously reviewed DSPx/FCOS resources. The two FCOS resources that were present during review are now missing and therefore moved to `missing_investigation`; they are not presumed cleaned.

Production execution subsequently reached an explicit disposition for every migrated resource: **129 resources / 201 aliases** are `cleaned`, **69 resources / 74 aliases** are `reconciled_missing`, and **28 resources / 34 aliases** are named-owner `deferred`. All 22 originally accepted resources received immutable target-OID integration proof before cleanup. The controller-captured per-resource `du -sb` ledger records **130,555,973,628 bytes (121.59 GiB) reclaimed**; its seven cohort source captures, deterministic 157-resource consolidation, provenance, and checksums are retained because terminal resource records do not themselves store footprint bytes. Restoration archives and deferred resources remain retained. Cohort summaries, authorizations, terminal receipts, and effect receipts remain under `~/.local/state/pi-quests/candidate-lifecycle-v2/`; the checksummed 226-resource closeout aggregate and footprint ledger are under `cohorts/final-2026-07-13/`.

The two new implementation modules temporarily exceed the 500-LOC readability ratchet while the P0 contract stabilizes (`candidatePeerLifecycleV2.ts` 939 LOC; `candidatePeerLifecycleArchive.ts` 596 LOC). This is an explicit owner-scoped, warn-only exception for task 3927. Split by inventory/state/snapshot and archive/authorization/execution boundaries before making the repository file-size gate hard; do not delay the loss-prevention canaries merely to reshuffle code.

## Migration, rollout, hold release, and rollback

1. **Quarantine:** v1 packet execution remains permanently disabled. Import v1 records read-only and assign provisional resource/generation groupings; ambiguous groups require owner reconciliation.
2. **Inventory canary:** prove deterministic grouping of the 302 records into the 225 reviewed resources and preserve an explicit anomaly list.
3. **Lifecycle canary:** migrate only clean synthetic fixtures; prove locks, CAS, drift revocation, missing reconciliation, and terminal receipts.
4. **Archive canary:** prove unusual filenames, symlinks, staged/untracked/ignored bytes, restoration equality, confidentiality, races, and retry after partial cleanup.
5. **Owner canary:** process one rejected fixture and one accepted fixture with exact target-OID integration proof; no production worktree is used.
6. **Production cohorts:** migrate reviewed resources by owner repo in small refreshed cohorts. The global v1 hold remains; only individually migrated v2 resources can become cleanup-eligible.
7. **Admission control:** enable warnings, measure false positives, then enable hard thresholds with owner-approved configuration.

Abort a phase on identity ambiguity, lock/CAS failure, drift escape, restoration mismatch, permission leak, authorization mismatch, partial-effect receipt failure, or owner-boundary violation. Rollback disables v2 execution and admission blocking but never reenables v1 packets, deletes lifecycle records, or removes archives. Already completed exact cleanup is not “rolled back”; restoration uses the verified archive through an explicit owner action.

## Rejected alternatives

- Automatic merge/acceptance: peer output is not owner authority.
- Automatic deletion after `PEER_FINAL`: final report is communication only.
- Cron cleanup by age: age does not establish disposability.
- Git diffs/bundles only: this already lost untracked files.
- Ignored means reconstructable: ignored runtime evidence can be unique.
- One cleanup owner per peer run: reuse makes this unsafe.
- Reenable v1 after patching the generator: historical serialized packets remain unsafe.

## Acceptance tests

- Deterministically group the historical 302 records into 225 resources, with ambiguous cases explicit.
- Concurrent spawn/reuse/review/archive/cleanup obey resource locks and CAS; stale lease recovery is receipted.
- Rebranch/rebase/path recreation does not create or reuse the wrong generation.
- Review binds byte/type/mode/path state for tracked, staged, untracked, ignored, symlink, nested-repo, and LFS cases.
- Drift revokes disposition, integration proof, archive lineage, and cleanup authorization.
- Accepted scope proves commit inclusion, patch equivalence, or exact squash/content coverage against a target OID.
- Untracked and owner-preserved ignored material restores byte-for-byte with unusual filenames.
- Symlink escape, special file, traversal, unreadable input, mutation race, and restoration mismatch fail closed.
- Archives and lifecycle state are owner-only and verified before completion.
- Authorization is separate, exact, expiring, revocable, and effect-scoped.
- Process closure occurs only after verified archive; partial cleanup is receipted and idempotently retryable.
- Drift after worktree removal preserves completed-effect receipts, blocks replay, and requires superseding authorization or explicit retained-effect closure.
- Drift after process closure but before worktree removal forces a fresh review/proof/archive cycle or explicit terminal retained-worktree closure.
- Missing-resource reconciliation distinguishes relocation, unavailable storage, stale records, partial cleanup, and confirmed loss.
- Admission thresholds use fresh locked inventory and cannot be bypassed by ordinary acknowledgement.
- Cleaned, retained-effect, and reconciled-missing terminals release active reservations exactly once while retaining historical metrics.
- V1 execution remains permanently disabled.
- No path implicitly merges, pushes, opens a PR, mutates AK, publishes, promotes, or deletes an unreviewed resource.
