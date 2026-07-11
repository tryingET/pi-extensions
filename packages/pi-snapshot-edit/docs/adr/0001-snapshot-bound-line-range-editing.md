---
summary: "Adopt fail-closed snapshot revisions and line ranges as the first pi-snapshot-edit protocol."
read_when:
  - "Changing snapshot_read or snapshot_edit semantics."
  - "Considering per-line hashes, fuzzy relocation, merge, or built-in tool overrides."
system4d:
  container: "Architecture decision for the initial editing protocol."
  compass: "Remove textual ambiguity without manufacturing concurrency certainty."
  engine: "Bind coordinates to raw-byte snapshot -> verify -> mutate atomically -> issue next revision."
  fog: "Checksums, patches, and word aliases can look stronger than their real guarantees."
---

# ADR 0001: Snapshot-bound line-range editing

- Status: accepted for MVP
- Date: 2026-07-11
- AK task: `#3588`

## Context

Pi's built-in exact-text edit rejects an `oldText` block when normalized matching finds it more than once. A jq-only scan of local Pi session JSONL found 3,205 unique failed edit calls between February and July 2026:

| Failure class | Count |
|---|---:|
| Missing old text | 1,447 |
| Ambiguous old text | 1,095 |
| Other | 432 |
| No-op | 141 |
| Overlapping edits | 90 |

Of the ambiguous failures, 840 had exactly two occurrences. Median attempted `oldText` was 104 characters and three lines; the maximum was 2,274 characters and 79 lines. This is not only a short-token edge case.

The baseline is a content-free aggregate in [`../project/session-edit-failure-baseline.json`](../project/session-edit-failure-baseline.json). Its source JSONL remains historical runtime capture, not canonical authority.

Three external approaches informed the decision:

- `pi-hashline-edit-pro`: strict unique short anchors and atomic batch validation;
- `pi-hashline-readmap`: line+hash ergonomics, relocation, syntax feedback, and broad context hygiene;
- `pi-hashline-edit`: contextual hashes, bounded snapshot history, and exact-context stale recovery.

Antirez's proposal establishes the central tradeoff: per-line tags avoid copying old text, while a whole-file checksum plus line ranges uses fewer tokens but ordinarily rejects unrelated changes.

## Adjudicated schools

The Prompt Vault `many-of-the-greats` procedure was applied before implementation.

### Stateless checksum CAS

A whole-file digest and line range is mechanically simple and restart-safe, but repeatedly copying a long digest is poor LLM ergonomics. A compact alias can retain the same correctness if the runtime binds it to a strong digest.

### MVCC snapshots

Line numbers are meaningful only relative to a version. A read should create that version, and stale writers should abort. This directly eliminates duplicate-text ambiguity without guessing.

### OT/CRDT collaboration

Operational transformation requires a complete trustworthy operation stream. Editors, Git, formatters, shell writes, and other processes do not supply one. Emulating a CRDT over arbitrary filesystem mutation would manufacture confidence.

### Patch and three-way merge

A base/current/desired merge can preserve harmless concurrent work, but a clean textual merge does not prove preserved intent. Automatic merge therefore changes the safety contract and does not belong in the MVP.

### Capability and security engineering

A revision must bind path, bytes, lifecycle, and quotas. Snapshot retention creates a second sensitive-content surface and must remain bounded and session-scoped.

### LLM/token ergonomics

Per-line tags tax every read. A single compact snapshot alias plus ordinary line numbers is cheaper. Natural-language aliases must remain display handles; collision resistance and freshness come from stored raw bytes and SHA-256.

## Decision

Implement separate `snapshot_read` and `snapshot_edit` tools with these invariants:

1. A read snapshots the entire canonical regular file as raw bytes.
2. Only valid UTF-8 text without NUL bytes is accepted.
3. A bounded store issues a unique session-local word alias.
4. The stored SHA-256 digest, not the word, identifies content.
5. Edit ranges are 1-indexed and resolve only against that base snapshot.
6. Every operation in a batch resolves against the same base.
7. Duplicate, overlapping, malformed, no-op, wrong-path, expired, and stale operations fail before commit.
8. Mutation uses Pi's complete per-file read/verify/write queue.
9. Commit uses a same-directory temporary file, fsync, mode preservation, final digest recheck, and atomic rename.
10. The result returns a new revision and bounded context.

The default MVP does not override built-in tools, automatically relocate anchors, or merge stale edits. An explicit session/process-scoped override mode may replace standard `read` and `edit` for local dogfooding, but must refuse active non-built-in owners and retain namespaced escape hatches.

## Consequences

### Positive

- Duplicate source text is unambiguous.
- Large deletion requests no longer reproduce the deleted block.
- Staleness is machine-verifiable rather than conversational.
- Existing built-in behavior remains available for comparative evaluation and rollback.
- The protocol stays much smaller than a structural-map or collaborative-editing suite.

### Negative

- A harmless external change invalidates a revision.
- Reload, forked runtime replacement, and eviction require rereading.
- Full snapshots retain sensitive bytes in process memory.
- Atomic rename cannot preserve every filesystem metadata or identity property.
- Non-cooperating cross-process races cannot be eliminated with ordinary portable filesystem APIs.

## Deferred experiments

Only evidence may promote these features:

1. verify framed one-token aliases for each active model tokenizer;
2. persist content-addressed snapshots safely across reload/fork without storing raw content in session JSONL;
3. add explicit preview-only disjoint rebase;
4. add a cooperative short cross-process lock with truthful stale-owner handling;
5. compare separate tools against the guarded built-in `read`/`edit` override before any host-native promotion;
6. stratify first-attempt success, retries, tokens, latency, stale conflicts, and wrong-target incidents by model/provider.

Per-line hashes remain a stateless fallback, not the preferred stateful Pi protocol.
