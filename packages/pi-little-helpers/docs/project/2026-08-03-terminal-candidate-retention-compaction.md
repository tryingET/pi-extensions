---
summary: "Lossless, authorization-bound compaction of terminal candidate registry, event, and restoration-archive state."
read_when:
  - "Changing terminal candidate retention, lifecycle event compaction, or restoration archive storage."
  - "Operating terminal-retention-* lifecycle-v2 commands."
type: "reference"
status: "implemented"
system4d:
  container: "Owner-only lifecycle-v2 terminal state and restoration evidence."
  compass: "Reduce terminal storage without weakening lineage, authorization, or restoration truth."
  engine: "verify terminal -> prepare and restore capsule -> authorize exact bytes -> commit marker -> retire redundant copies -> publish exact GC receipt; explicitly recover only provably dead compaction locks."
  fog: "Production cohort sizing and compression ratios remain operator-measured; installation alone performs no compaction."
---

# Terminal candidate retention compaction

## Problem and boundary

Lifecycle-v2 correctly retains complete terminal evidence, but full review snapshots are repeated through append-only event records and again inside restoration archives. The local 2026-08-03 census found 265 terminal resources whose resource/event tree occupied about 6.1 GiB and whose restoration archives occupied about 8.8 GiB. The registry itself was small (about 2.9 MiB) but remains necessary compatibility and inventory lineage.

Compaction is a storage representation change, not cleanup authority, disposition, promotion, publication, or evidence deletion. Age, `PEER_FINAL`, process absence, registry-v1 packets, and a terminal-looking path never authorize it. The operator names exactly one lifecycle-v2 resource and separately authorizes the prepared bytes.

This implementation supports verified `cleaned` and `reconciled_missing` records. `closed_with_retained_effects` fails closed until a dedicated terminal verifier exists.

## Retained capsule

`terminal-retention-prepare` first runs the ordinary terminal verifier. It then captures these exact owner-only regular files:

- the canonical terminal `record.json`;
- the complete append-only `events.jsonl`;
- every exact registry-v1 sidecar named by the terminal record aliases;
- every file in the lifecycle-v2 restoration archive, when one exists.

The prepared `terminal-capsule.tar.gz` also contains a self-describing `capsule-metadata.json` with resource/generation identity, terminal state and record digest, terminal proof digest, sorted aliases, complete source manifest, source-manifest digest, preparation time, and its own metadata digest. Preparation records every original absolute path, capsule-relative path, mode, byte length, and SHA-256. It extracts the capsule into managed scratch and checks the exact member set, paths, modes, sizes, hashes, metadata digest, and restored record identity before publishing `preparation.json`.

Preparation is non-destructive and idempotent only while the capsule and every original source remain unchanged. If a hard crash publishes the capsule but not `preparation.json`, the capsule is still non-authoritative: after exact dead-lock recovery, preparation removes that owner-only orphan and rebuilds/restoration-tests it from unchanged original sources.

## Separate authorization

`terminal-retention-authorize` requires:

```json
{
  "actor": "owner:identity",
  "expiresAt": "2026-08-03T06:00:00.000Z"
}
```

The expiry must be canonical UTC, later than issue time, and no more than 30 minutes away. The authorization binds the exact resource/generation, preparation digest, terminal record digest, source-manifest digest, capsule SHA-256, actor, nonce, issue time, and expiry. Issuance revalidates every original source and restoration-tests the capsule again.

## Marker-first execution and recovery

`terminal-retention-compact` holds the global registry-mutation lock and exact resource lock. Before any representation change it revalidates:

1. terminal record, exact terminal receipt schema/chronology, and absent worktree;
2. preparation and authorization digests;
3. current registry inventory plus any bound-but-unpublished admission aliases;
4. every original source mode, size, SHA-256, and complete member set;
5. capsule member restoration and self-description;
6. current wall-clock authorization validity immediately before the durable marker rename.

It then atomically publishes `terminal-compaction.json`. The marker binds the complete manifest, capsule, authorization, and commit time. Execution immediately rechecks terminal state, registry/admission identity, capsule, and every live or quarantined source before any redundant copy changes. Only after that membrane may redundant copies change:

- exact registry-v1 sidecars remain byte-for-byte in place for inventory and historical dry-run compatibility;
- `events.jsonl` is removed only when its current SHA-256 still equals the marker;
- the restoration archive is quarantined only after an exact full-member check, and every remaining member is reopened and rechecked for type, mode, size, and SHA-256 immediately before its individual unlink.

Pending execution uses the capsule only inside the locked compactor after rechecking all remaining live/quarantined sources, including a second check after the final pre-GC hook/boundary, another worktree check after capsule materialization and source hashing, and per-member byte revalidation immediately before unlink. Ordinary terminal verification serializes with registry publication and does not switch to capsule evidence until an exact durable `gc-receipt.json` proves the redundant event/archive paths and quarantines are lexically absent (dangling links are presence). It then verifies the capsule, materializes it into managed scratch, and applies the ordinary cleaned or reconciled-missing verifier to the restored surfaces. Admission release holds the same registry membrane through verification and permit publication. Thus a marker alone or a late alias cannot hide drift or release pressure.

If execution stops after marker publication, a retry may finish only exact remaining redundant-copy removals, even after authorization expiry. Lock acquisition prebuilds `lease.json` in a private directory and atomically renames that non-empty directory into the fixed lock path: a crash before rename does not block retry, while every published lock has a complete lease. A catchable failure releases locks normally. After a hard crash with published locks, `terminal-retention-recover-locks` removes only the exact present registry/resource leases for this resource whose recorded process is provably absent, and publishes an owner-attributed recovery receipt. Pre-marker expiry or source drift cannot publish a marker; post-marker drift or a reappeared worktree blocks before further GC. The final `gc-receipt.json` binds the marker and observed retained/removed surfaces.

## Oversized exact terminal events

Ordinary lifecycle event scanning keeps the fixed 16 MiB buffer limit for cleanup intents, cleanup observations, and unexpected terminal content. A valid final `cleaned` event can itself exceed that limit because lifecycle-v2 embeds the complete terminal record, including a large review-object inventory.

For this one case, the terminal verifier derives the exact canonical event bytes from the already owner-verified terminal record: `event`, `at`, `fromVersion`, and `record` in the same order emitted by `writeLockedLifecycleRecord`. It scans the event ledger in 64 KiB chunks, hashes the candidate terminal line incrementally, and retains no oversized line buffer. The dynamic acceptance ceiling is the exact expected byte count, not a larger global threshold. Acceptance requires one uniquely identified `cleaned` event whose byte count and SHA-256 match that canonical event and which is physically final. Intents, observations, malformed or truncated JSON, noncanonical/reordered bytes, wrong resource or generation identity, extra or duplicate terminal events, and any later event still fail closed.

The same verifier is used by ordinary admission release and by terminal-compaction materialization. This repair changes no permit, lifecycle, archive, capsule, or receipt schema and authorizes no automatic release or compaction.

AK-4628 carries an explicit readability exception for `candidatePeerLifecycleArchive.ts`, which was already above the brownfield 500-line budget before this repair. The bounded scanner change stays local so the live verifier correction is not mixed with a high-risk module extraction; the package gate remains warn-only for that pre-existing size posture.

### AK-4628 production proof

Commit `2931ea11` added the bounded verifier and adversarial admission suite. The final package gate passed 249 tests with zero failures, and independent reviews `dispatch-1785796263489` and `dispatch-1785796263489-1` passed after the early-read ceiling was enforced.

The exact AK-4368 resource `cpr-95a8476f3081a9023d83ac3e` then passed read-only terminal verification with digest `9e24d2fd2f9a53d89875b8867c02bd5298ae0613038bfc26645e2f1fb08b5246`. Its final event was 24,666,608 bytes. The ordinary `candidate-admission-v2 release` command changed permit `cadm-0165dc3c-fdcb-4add-b78e-4a9edcdadabd` from `reserved` to `released` at `2026-08-03T22:41:43.931Z`, with outcome `terminal_cleaned` and that exact terminal digest. Active admission pressure changed once from one resource / 805,306,368 bytes to zero. The canonical lifecycle record and event-ledger SHA-256 values remained unchanged (`9e8a64570c37e5ea26e8b3c4609a52371503bfd1330bf7fe883afda8f6305fe1` and `f17e7261d5673df092e56827a00fe66796912ceb1058b5c274a3b468d0f39dc8`); no permit edit, event rewrite, legacy reconciliation, or retry was used.

## Commands

```bash
node scripts/candidate-lifecycle-v2.mjs terminal-retention-prepare \
  --resource cpr-0123456789abcdef01234567

node scripts/candidate-lifecycle-v2.mjs terminal-retention-authorize \
  --resource cpr-0123456789abcdef01234567 \
  --input /absolute/owner/terminal-retention-authorization.json

node scripts/candidate-lifecycle-v2.mjs terminal-retention-compact \
  --resource cpr-0123456789abcdef01234567

# Only after a hard crash, with {"actor":"owner:identity"} in the input:
node scripts/candidate-lifecycle-v2.mjs terminal-retention-recover-locks \
  --resource cpr-0123456789abcdef01234567 \
  --input /absolute/owner/lock-recovery.json

node scripts/candidate-lifecycle-v2.mjs terminal-retention-verify \
  --resource cpr-0123456789abcdef01234567
```

Operate one resource at a time. This implementation does not add an automatic age janitor or bulk production executor.

## Verification and rollback

Synthetic tests prove:

- non-destructive preparation and byte-for-byte capsule restoration;
- explicit bounded authorization;
- pre-marker source drift rejection with originals untouched;
- cleaned archive/event compaction while exact registry lineage remains;
- post-compaction ordinary terminal verification through the capsule;
- atomic pre-leased lock acquisition plus real `SIGKILL` lock recovery and marker-first resumption after authorization expiry;
- orphan-capsule rebuild after hard preparation crash;
- pre/post-marker event, archive, alias, and worktree drift rejection before GC;
- exact reconciled-missing receipt/final-event schema and chronology;
- registry-serialized terminal verification and admission release after compaction;
- dangling retired-path rejection;
- capsule tamper rejection;
- inventory identity stability.

Rollback is source-only unless an owner explicitly authorizes restoration. Do not bulk-delete terminal capsules or markers. Restoring original event/archive paths from a capsule is a separate owner operation and is not performed automatically. Installing or reloading this package executes no production compaction.
