---
summary: "Snapshot-bound exact-selector editing tools for Pi agents."
read_when:
  - "Installing or evaluating pi-snapshot-edit."
  - "Choosing a fail-closed text editing protocol."
system4d:
  container: "A standalone-friendly Pi extension package."
  compass: "Make duplicate text deterministic without hiding stale-file conflicts."
  engine: "raw snapshot read -> exact selector edit -> fresh revision."
  fog: "Ordinary filesystems cannot provide lock-free compare-and-swap against arbitrary writers."
---

# @tryinget/pi-snapshot-edit

> **License notice:** This package is **source-available under a non-standard restricted license; it is not OSI open source**. Read the complete [LICENSE](LICENSE) before use. The license names Restricted Parties—including OpenAI, Anthropic, xAI, specified PRC frontier labs, their affiliates, and parties acting for them—and grants those Restricted Parties no rights.

`pi-snapshot-edit` provides Protocol B through both namespaced tools and an opt-in standard-tool override:

- `snapshot_read` / `read` — return one `revision:<alias>` header followed by raw UTF-8 file text, without line numbers or gutters;
- `snapshot_edit` / `edit` — apply exact replacements and anchored insertions against that immutable full-file snapshot.

## Protocol B

```text
snapshot_read({"path":"src/example.ts"})

revision:amber
const value = 1;
return value;
return value;
```

```json
{
  "path": "src/example.ts",
  "base": "amber",
  "edits": [
    {
      "op": "replace",
      "oldText": "return value;",
      "occurrence": 2,
      "newText": "return value + 1;"
    },
    {
      "op": "insert_after",
      "anchorText": "const value = 1;",
      "newText": "\nconst increment = 1;"
    }
  ]
}
```

A selector with exactly one match may omit `occurrence`. A duplicate selector requires a positive 1-indexed occurrence. Partial-line and multi-line selectors are exact. All selectors resolve against the same immutable base before any mutation.

Selectors and `newText` normalize to the file's LF or CRLF style. Unrelated text bytes are unchanged. Missing, invalid, or out-of-range selectors; overlapping replacements; shared insertion points; insertion on a replacement boundary/interior; and no-op edits fail closed. There is no fuzzy matching or automatic rebase.

Read pagination remains capped at 2,000 lines, and the complete serialized result—including the revision header and any truncation notice—is capped at 50KB. Space for framing is reserved before raw lines are added. A single line that cannot fit on that safe page fails explicitly because exact raw pagination cannot split it with a line-offset API. Edit previews contain raw text without gutters when they fit an independent bounded preview; otherwise success returns a non-throwing omission notice.

## Safety contract

1. A read retains the complete canonical file bytes and binds them to a session-local alias plus SHA-256 digest.
2. Edits bind the alias to the canonical path, file identity, and immutable snapshot text.
3. Every batch operation resolves and validates before writing.
4. Current bytes and identity must still match inside Pi's per-file mutation queue.
5. The desired bytes must pass the snapshot-store byte budget and text decoding validation before commit.
6. Commit uses a same-directory temporary file, fsync, mode preservation, a best-effort digest/identity recheck from one opened handle, and atomic rename.
7. Success creates a fresh revision.

The implementation preserves valid UTF-8 bytes outside edits, UTF-8 BOM, LF/CRLF style, final-newline shape unless explicitly selected, and mode bits. It rejects binary/non-UTF-8 files, bare-CR or mixed-EOL files, hard-linked targets, stale bytes, replaced inodes, cancellation before commit, and byte-identical no-ops.

Revisions expire on reload, session shutdown, eviction, or `/snapshot-edit clear`. The last digest/identity check is best-effort pre-rename detection, not filesystem compare-and-swap: a non-cooperating writer can change the path in the residual window between that check and rename. Atomic rename also cannot preserve every ACL, xattr, sparse-file, open-descriptor, or watcher behavior. Pi's queue cannot exclude non-cooperating processes.

## Standard-tool override dogfood

Namespaced tools are always registered. To replace standard `read` and `edit` for one local Pi process:

```text
/snapshot-edit override
```

or:

```bash
PI_SNAPSHOT_EDIT_OVERRIDE=1 pi
pi --snapshot-edit-override
```

The override refuses to displace non-built-in owners. Unsupported reads fail closed; `/reload` restores built-ins. Resumed line-coordinate calls and top-level legacy edit calls are rejected with instructions to reread and issue Protocol B. Nested Protocol B `oldText` remains valid.

## Install and verify

```bash
npm ci              # installs dev dependencies and runs prepare -> build
npm run build       # required after every extension/runtime source change
npm run check
pi install /absolute/path/to/pi-extensions/packages/pi-snapshot-edit
```

The published runtime is the deterministic, unminified `dist/snapshot-edit.js` bundle. Package-owned runtime modules are embedded; Pi and TypeBox imports remain host-provided. The package does not publish `extensions/` or `src/` runtime source.

After installation, run `/reload` and verify with real read/edit calls on a disposable file. After later source changes, run `npm run build` and then `/reload`. A bundled update **must take effect in the same Pi process; a process restart is not required**. Candidate lanes should report installation commands rather than altering the controller's Pi install.

Release validation uses the exact packed tarball in isolated `PI_CODING_AGENT_DIR` and `NPM_CONFIG_PREFIX` roots. The gated release-only smoke closure is unavailable unless `PI_SNAPSHOT_EDIT_RELEASE_SMOKE=1`; normal operators never see it.

## Evidence and architecture

- [ADR 0001 — Snapshot-bound exact-selector editing](docs/adr/0001-snapshot-bound-line-range-editing.md)
- [Protocol evaluation results](docs/project/2026-07-11-protocol-autoresearch-results.md)
- [Standard override dogfood](docs/project/2026-07-11-standard-override-dogfood.md)
- [Content-free historical failure baseline](docs/project/session-edit-failure-baseline.json)

Historical benchmark documents may describe Protocol A line coordinates as an evaluated alternative; they are not current runtime guidance.

## Package identity

- npm: `@tryinget/pi-snapshot-edit`
- monorepo path: `packages/pi-snapshot-edit`
- release component: `pi-snapshot-edit`
