---
summary: "Snapshot-bound line-range editing tools for Pi agents."
read_when:
  - "Installing or evaluating pi-snapshot-edit."
  - "Choosing between exact-text edit and snapshot-bound editing."
system4d:
  container: "A standalone-friendly Pi extension package."
  compass: "Make duplicate text unambiguous without hiding stale-file conflicts."
  engine: "snapshot_read -> snapshot_edit -> fresh revision."
  fog: "Ordinary filesystems cannot provide lock-free compare-and-swap against arbitrary writers."
---

# @tryinget/pi-snapshot-edit

`pi-snapshot-edit` adds two opt-in tools:

- `snapshot_read` — reads UTF-8 text with line numbers and creates a compact revision alias;
- `snapshot_edit` — applies disjoint line-range edits against exactly that revision.

It addresses a common failure in exact-text editing:

```text
Found 2 occurrences of edits[1]. Each oldText must be unique.
```

Duplicate source text is not ambiguous when the edit names lines in an immutable base revision.

## Example

```text
snapshot_read({"path":"src/example.ts"})

revision:amber
1│const value = 1;
2│return value;
3│return value;
```

```json
{
  "path": "src/example.ts",
  "base": "amber",
  "edits": [
    {
      "op": "replace",
      "startLine": 3,
      "endLine": 3,
      "newText": "return value + 1;"
    }
  ]
}
```

All operations in one call use coordinates from the same base revision. Do not adjust later ranges for earlier replacements.

## Safety contract

The MVP deliberately prefers MVCC-style rejection over fuzzy relocation:

1. `snapshot_read` retains the complete raw file bytes, even for paginated output.
2. The compact word is an opaque session-local alias for a SHA-256-bound snapshot. It is not itself a checksum.
3. `snapshot_edit` binds the alias to the canonical target path.
4. Every range and overlap is validated before writing.
5. The current raw bytes must still match the base digest inside Pi's per-file mutation queue.
6. The result is written through a same-directory temporary file and atomic rename.
7. A successful edit returns a new revision and bounded changed-area context.

The implementation preserves:

- valid UTF-8 bytes outside changed ranges;
- a UTF-8 BOM;
- CRLF/LF style for inserted text;
- the final-newline shape of replaced ranges;
- file mode bits.

It rejects binary/non-UTF-8 files, bare-CR or mixed-EOL files, and hard-linked targets. Atomic rename would otherwise silently normalize unrelated line endings or break hard-link identity.

## Known boundaries

- Revisions live in memory and expire on reload, session shutdown, eviction, or `/snapshot-edit clear`.
- Compact aliases are selected from a conservative word list, but one-token status is not yet verified per active model tokenizer. Correctness never depends on tokenization.
- Pi's mutation queue coordinates tools in one Pi process. It cannot exclude arbitrary editors, Git operations, formatters, or other processes.
- Atomic rename prevents partial visibility, but ordinary filesystem APIs do not provide true content compare-and-swap against non-cooperating writers.
- The MVP fails stale revisions instead of automatically merging. Explicit, previewable disjoint rebase is a later evaluation candidate.
- Replacing a file by rename can affect ACLs, xattrs, sparse-file layout, open descriptors, and file watchers. The MVP promises mode preservation only.

## Standard-tool override dogfood mode

The package keeps `snapshot_read` and `snapshot_edit` as escape hatches, but can explicitly replace the standard names for one Pi process.

Enable it in the current session:

```text
/snapshot-edit override
```

Or at process startup:

```bash
PI_SNAPSHOT_EDIT_OVERRIDE=1 pi
pi --snapshot-edit-override
```

In override mode:

- standard `read` returns a revision plus 1-indexed text lines;
- standard `edit` requires `base` and line-range operations;
- image, binary, mixed-EOL, bare-CR, and other unsupported snapshot reads fail closed; run `/reload` to restore the authoritative built-in reader rather than bypassing remote or sandbox operations;
- old resumed exact-text edit calls fail with a deterministic reread instruction;
- explicit renderers prevent accidental use of built-in result-detail assumptions;
- activation refuses to displace a non-built-in `read` or `edit` owner, such as an SSH or sandbox override.

Override mode is local-filesystem dogfood, not the final authority architecture. Run `/reload` to restore standard built-ins. Permanent canonical ownership belongs in Pi core so native operation adapters and remote execution contracts can be preserved.

## Empirical baseline

Run:

```bash
npm run evidence:edit-failures
```

The jq-only analyzer scans `~/.pi/agent/sessions/**/*.jsonl`, deduplicates failed `edit` tool calls, and writes a content-free aggregate to:

- [`docs/project/session-edit-failure-baseline.json`](docs/project/session-edit-failure-baseline.json)

The captured 2026-07-11 baseline contains 3,205 unique failed edits, including 1,095 ambiguous-`oldText` failures. No source text, paths, session identifiers, or tool-call identifiers are retained.

Session JSONL is historical empirical input, not canonical task or evidence authority.

## Install and verify

```bash
npm install
npm test
npm run typecheck
npm run lint
pi install /absolute/path/to/pi-extensions/packages/pi-snapshot-edit
```

Then run `/reload` and verify with real `snapshot_read` and `snapshot_edit` calls on a disposable file.

## Architecture

- [ADR 0001 — Snapshot-bound line-range editing](docs/adr/0001-snapshot-bound-line-range-editing.md)
- [Standard override dogfood evidence](docs/project/2026-07-11-standard-override-dogfood.md)
- [Session edit failure baseline](docs/project/session-edit-failure-baseline.json)

## Package identity

- npm: `@tryinget/pi-snapshot-edit`
- monorepo path: `packages/pi-snapshot-edit`
- release component: `pi-snapshot-edit`
