---
summary: "Exact owner transaction for releasing admission pressure from the July 13 legacy terminal anomaly."
read_when:
  - "Reviewing AK-4378 or the one legacy candidate admission release."
  - "Distinguishing historical cleanup evidence from hardened lifecycle-v2 verification."
system4d:
  container: "Owner-only reconciliation for one historical admission anomaly."
  compass: "Release pressure without weakening hardened lifecycle-v2 truth."
  engine: "Prepare exact packet -> semantic preflight -> lock and revalidate -> atomically release once."
  fog: "A generic compatibility path would silently redefine hardened terminal verification."
---

# Candidate admission legacy terminal reconciliation

## Boundary and root cause

The July 13 cleanup performed its two Git effects and persisted a cleaned record before lifecycle-v2 added hardened intent/observation events. Its effect entries contain only the legacy effect identity and timestamp fields. Its cleaned receipt digest covers exactly:

```text
digestObject({ resourceId, effects, archiveDigest, authorizationDigest })
```

The ordinary verifier correctly requires hardened observations. It and the archive implementation remain unchanged. This separate transaction recognizes only the one historical shape and persists `verificationSemantics: "legacy_july13_exact"` with `hardenedV2Verified: false`.

## Owner flow

Use an absolute, normalized request path in an owner-only directory. The request file must be an owner regular 0600 JSON file with exactly:

```json
{
  "admissionId": "<admission id>",
  "resourceId": "<resource id>",
  "ownerRationale": "<non-empty rationale>",
  "ownerReference": "<non-empty review reference>"
}
```

Create a new packet; the output must not already exist:

```bash
node scripts/candidate-admission-v2.mjs prepare-reconcile-release \
  --request /absolute/owner/request.json \
  --output /absolute/owner/reconciliation-packet.json
```

Preparation reads the bound reserved permit and canonical lifecycle artifacts, writes canonical JSON through a no-follow exclusive descriptor at mode 0600, fsyncs the file, and fsyncs its owner-only parent directory. It never copies the permit objective into the packet or CLI output.

Run semantic preflight:

```bash
node scripts/candidate-admission-v2.mjs verify-reconcile-input \
  --input /absolute/owner/reconciliation-packet.json
```

Preflight is non-mutating: it creates no owner or resource lock. It performs two stable descriptor-based/no-follow reads and semantically verifies the current permit, lifecycle record and raw events, archive and member bytes, and Git deletion facts. Any drift between passes fails closed. Execution revalidates under locks, so preflight is evidence about current facts rather than a reservation of those facts.

Execute the unchanged packet:

```bash
node scripts/candidate-admission-v2.mjs reconcile-release \
  --input /absolute/owner/reconciliation-packet.json
```

All three command results and failures are redacted. The packet path must remain absolute and normalized; the file and parent are owner-only, regular/non-symlink surfaces. Input reads reject duplicate JSON keys, blank JSONL lines, noncanonical packet JSON, symlink traversal, and descriptor identity drift.

## Exact historical chain

The raw canonical events file has SHA-256 bound in the packet and exactly ten entries:

1. `migrated_v1`: version 1, `review_pending`;
2. first `review_captured`: from 1 to version 2, `review_pending`;
3. first `disposition_rejected`: from 2 to version 3, `rejected`;
4. second `review_captured`: from 3 to version 4, `review_pending`, with the prior disposition removed;
5. second `disposition_rejected`: from 4 to version 5, `rejected`;
6. `archive_verified`: from 5 to version 6;
7. `cleanup_authorized`: from 6 to version 7;
8. legacy `remove_worktree` effect;
9. legacy `delete_branch` effect;
10. `cleaned`: from 7 to the exact final version-8 record.

The two review snapshots and two dispositions must be distinct. Each snapshot and disposition validates its own exact key set and digest. Each disposition binds its cycle's snapshot. Archive, authorization, and final record bind the second cycle only; omissions, reordering, or hybrid cycles fail. Authorization has `authorizedResourceVersion: 7` and stores effects in the exact order `delete_branch`, `remove_worktree`; the receipt stores observed effects in execution order `remove_worktree`, `delete_branch`.

The verifier also requires exact final record/review/disposition/archive/authorization/COMPLETE/receipt/effect key sets; one alias, repository, and branch; canonical record and raw JSONL digests; every archive manifest member's descriptor-stable byte SHA-256; review/disposition/authorization cross-digests; and a transaction timestamp no earlier than the final event.

## Fail-closed deletion proof

Only `ENOENT` proves worktree-path absence. Control characters, non-normalized paths, symlink ancestors, permission/query errors, a surviving branch, or any matching registered worktree fail. Git commands are tri-state rather than treating every nonzero status as absence. Worktree discovery uses `git worktree list --porcelain -z`, so unrelated newline paths are parsed safely. Repository top-level and common-directory canonical paths and filesystem identities must match the reviewed and authorized identities. A detached owner checkout is not itself a failure; a detached or different-branch registered target worktree is.

## Transaction and recovery

Execution acquires the resource lock first and the admission lock second. Under both locks it verifies canonical artifacts and Git facts and captures complete global and exact-repository pressure. At the permit-write linearization point it validates the branch ref, acquires the exact target loose-ref `.lock` below the canonical reviewed Git common directory, then repeats packet, pressure, artifact, and Git verification and performs the one durable permit rewrite while holding that fence. The empty fence is durably removed afterward; only newly created empty ref-parent directories may be removed, and a preexisting/stale fence requires owner recovery. No branch, ref, worktree, or path sentinel is created. One transaction timestamp is threaded through the nested lifecycle proof and outer reconciliation proof. There is no post-commit check that can report failure after the successful effect.

The rewrite changes exactly one matching `reserved` permit to `released`, with outcome `legacy_terminal_anomaly_reconciled`. The proof records global and repository active counts, unresolved counts and bytes, and active admission IDs before and after. An exact retry rederives the lifecycle and pressure proof. A different release, stale packet, forged extra key, stale lock, or drift fails closed. A precommit write failure leaves the reserved permit visible and retryable. Existing stale-lock owner recovery procedures apply after a hard process termination.

## Explicit non-authorizations

This flow does **not** execute cleanup, create/delete Git state, claim hardened lifecycle-v2 verification, modify lifecycle/archive/registry facts, authorize or spawn another candidate, alter the historical hold, install/reload anything, or reconcile live state automatically merely because the code exists.
