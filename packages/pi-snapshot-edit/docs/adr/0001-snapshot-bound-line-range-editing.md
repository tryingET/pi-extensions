---
summary: "Adopt fail-closed snapshot revisions with occurrence-qualified exact selectors."
read_when:
  - "Changing snapshot_read or snapshot_edit semantics."
  - "Considering line coordinates, fuzzy relocation, merge, or built-in overrides."
system4d:
  container: "Architecture decision for the active editing protocol."
  compass: "Remove textual ambiguity without manufacturing concurrency certainty."
  engine: "Bind selectors to raw-byte snapshot -> verify -> mutate atomically -> issue revision."
  fog: "Aliases and atomic rename can look stronger than their actual guarantees."
---

# ADR 0001: Snapshot-bound exact-selector editing

- Status: amended; Protocol B replaces Protocol A
- Date: 2026-07-11
- Amendment: AK `#3619`

## Context

Historical Pi failures show that exact text can be missing, duplicated, stale, overlapping, or a no-op. Protocol A initially combined a whole-file snapshot with numbered read gutters and line-range edits. Controlled package experiments then showed that Protocol B's raw reads and occurrence-qualified exact selectors were more token-efficient while retaining deterministic duplicate selection.

The content-free aggregate remains in [`../project/session-edit-failure-baseline.json`](../project/session-edit-failure-baseline.json). Historical benchmark and autoresearch documents may describe A as an evaluated protocol; those descriptions are not runtime guidance.

## Decision

Protocol B completely owns both namespaced `snapshot_read` / `snapshot_edit` and opt-in standard `read` / `edit`:

1. Read snapshots the complete canonical regular file as raw bytes.
2. Output is one compact `revision:<alias>` header followed by raw UTF-8 text, with pagination/truncation but no line gutters.
3. Replace uses `{op:"replace", oldText, occurrence?, newText}`.
4. Insert uses `{op:"insert_after", anchorText, occurrence?, newText}`.
5. An exactly unique selector may omit occurrence. Duplicate selectors require a positive 1-indexed occurrence.
6. Partial-line and multi-line selectors match exactly against immutable snapshot text.
7. Selector and replacement/insertion EOLs normalize to the file's EOL; unrelated bytes do not.
8. Every operation resolves against the same base before mutation.
9. Missing or invalid selectors, invalid occurrences, overlaps, shared insertion points, insertion on a replacement boundary/interior, and no-ops fail closed.
10. Stale digest, path/identity drift, hard links, and cancellation detected before rename fail closed.
11. Desired bytes must pass snapshot-store budget and text-decoding validation before commit.
12. Commit uses a same-directory temporary file, fsync, mode preservation, a best-effort pre-rename recheck from one opened handle, and atomic rename.
13. Successful edit output issues a fresh revision and a raw, gutter-free bounded preview or a non-throwing omission notice.
14. Distribution uses one deterministic, readable, unminified ESM bundle at `dist/snapshot-edit.js`. It embeds all package-owned runtime modules while leaving Pi and TypeBox host imports external.
15. `prepare` and `prepack` rebuild that entry. Published files exclude `extensions/` and `src/`, and `/reload` must activate rebuilt bytes in the same Pi process.
16. A release-only command closure exists only when `PI_SNAPSHOT_EDIT_RELEASE_SMOKE=1`; exact-tarball validation uses it without a model/provider call and without operator settings.

There is no fuzzy matching, automatic relocation, merge, or rebase. A stale or incompatible resumed call must reread. Resumed Protocol A line coordinates and top-level legacy calls receive precise migration guidance; nested Protocol B `oldText` is valid.

## Consequences

### Positive

- Read output no longer pays a per-line token tax.
- Duplicate source remains deterministic through explicit occurrence.
- Selectors can be as small as a partial line or span multiple lines.
- Immutable batch resolution avoids coordinate drift.
- Snapshot digest and identity checks preserve machine-verifiable staleness.
- One bundled runtime prevents a reloaded extension schema from retaining stale package-owned service modules.
- Deterministic bundle bytes and an exact publish whitelist make artifact drift detectable before publication.

### Negative

- A harmless external change invalidates the revision.
- Models must include occurrence for duplicate selectors.
- Full snapshots retain sensitive bytes in bounded process memory.
- Atomic rename cannot preserve every filesystem metadata or identity property.
- Non-cooperating cross-process races cannot be eliminated with portable filesystem APIs. In particular, the final recheck is not compare-and-swap: a writer can change the path after that check and before rename.
- Contributors must rebuild after runtime source changes; `/reload` loads the bundle, not source modules.

## Retired decision

Protocol A's numbered `N│text` reads and `startLine` / `endLine` operations are retired runtime behavior. They remain only as explicitly historical benchmark terminology. Per-line hashes remain an evaluated alternative, not a live protocol.
