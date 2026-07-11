---
summary: "Dogfood plan and prior evidence for the guarded standard read/edit override."
read_when:
  - "Evaluating local standard-tool override behavior."
  - "Preparing Protocol B live verification."
system4d:
  container: "A bounded implementation and live-runtime verification note."
  compass: "Promote only behavior that survives real tool selection and exact-byte inspection."
  engine: "Install -> reload -> activate override -> read/edit disposable file -> inspect."
  fog: "Mock registration can pass while provider serialization or argument preparation fails live."
---

# Standard read/edit override dogfood — 2026-07-11

## Current Protocol B command

After installing the package in the intended Pi runtime and reloading:

```bash
PI_SNAPSHOT_EDIT_OVERRIDE=1 pi --no-extensions \
  -e packages/pi-snapshot-edit/extensions/snapshot-edit.ts \
  --tools read,edit -p '<scenario>'
```

The expected read result is one `revision:<alias>` header plus raw UTF-8 text with no gutters. Standard `edit` uses `{path,base,edits}` with `oldText` replacement or `anchorText` insertion selectors and an optional 1-indexed `occurrence` only when the selector is unique.

Candidate worktrees must report the install command and must not mutate the controller Pi install.

## Protocol B deterministic coverage

Package tests cover:

- namespaced and standard override registration and behavior;
- raw token-lean read and edit preview output without line gutters;
- unique-selector occurrence omission and duplicate occurrence selection;
- partial-line and multi-line exact selectors;
- anchored insertion and immutable batch resolution;
- overlap, shared insertion-point, and replacement-boundary rejection;
- selector/new-text CRLF normalization with BOM and mode preservation;
- stale bytes, replaced inode, hard-link, cancellation, and no-op rejection;
- top-level legacy and resumed line-coordinate reread diagnostics;
- nested Protocol B `oldText` surviving standard argument preparation.

## Historical Protocol A dogfood

Before AK #3619, live dogfood exercised numbered reads and line-coordinate edits. It discovered two extension integration failures that remain relevant:

1. Startup override activation must occur at `session_start`; action APIs are not lawful while the extension factory loads.
2. Unsupported standard reads must fail closed rather than constructing a local reader that could bypass a remote or sandbox owner.

That run also led to positive built-in owner identification and refusal to displace visible non-built-in owners. Its line-coordinate payloads and line-number output are retired and are not current examples.

## Live verification still required after install

Run a disposable Protocol B scenario through standard `read` and `edit`, then inspect exact file bytes. Include a duplicate selector with occurrence, a CRLF/BOM file, and a stale revision failure. Reload restores built-ins.

Permanent canonical ownership still belongs in Pi core if arbitrary remote/sandbox operation adapters must be preserved. This package remains a reversible local carrier.
