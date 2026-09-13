---
summary: "AK5623: non-authoritative Level-4 dashboard observation export and consumer contract."
read_when:
  - "Reading .autoresearch/dashboard/level4 snapshots from a dashboard consumer."
  - "Changing or validating the Level-4 observation bridge."
system4d:
  container: "Owner-scoped Level-4 observation export for dashboard consumers."
  compass: "Preserve owner results and non-dispatching boundaries."
  engine: "Public return -> bounded atomic snapshot -> read-only consumer."
  fog: "Observation freshness and plan fields are not execution authority."
---

# Level-4 dashboard observation bridge — AK5623

## Producer and boundary

The public `autoresearch_live_supervision` tool, with
`action=level4_autoresearch_campaign_runner`, attempts one export after the existing
`runAutoresearchLevel4CampaignRunner` returns. The helper receives that actual result,
not a reconstructed plan or simulated execution. Direct runner calls do not export.
Owner errors before a result returns do not produce a snapshot.

Levels 1–4 and the non-dispatching boundary are unchanged. This is observation
plumbing only: no launches, benchmarks, action execution, lifecycle actions,
AK writes, or synthetic effect receipts. Original owner journals and their resume
semantics are unchanged; the observer neither appends to nor rewrites them.

## Exact consumer contract

Glob, relative to the canonical campaign cwd:

```text
.autoresearch/dashboard/level4/*.json
```

Exact filename:

```text
<taskId>-<sha256-hex-of-UTF8-result.objective>.json
```

- `taskId`: positive safe integer, decimal digits (no `AK` prefix).
- Digest: full 64-character lowercase SHA-256, over the exact returned objective's
  UTF-8 bytes, **not** JSON encoding, not a slug, and not an action-plan digest.
  The existing public adapter trims the request objective before calling the owner.
- Directory root: `realpath(resolve(result.cwd))`, not the Pi session's cwd.
- One latest successful snapshot per task/objective/canonical cwd; other objectives
  have separate files. This is not an event stream or a complete campaign inventory.

UTF-8 JSON object, compact serialization followed by one newline:

```typescript
{
  kind: "autoresearch.level4_dashboard_observation.v1",
  observedAt: string, // new Date().toISOString(), observation time, not effect time
  taskId: number,     // result.taskId
  cwd: string,        // canonical absolute cwd
  objective: string,  // exact result.objective
  nonAuthority: true,
  execution: "not_executed_by_orchestrator",
  result: AutoresearchLevel4CampaignRunner // actual owner return, JSON serialized
}
```

`result` retains the owner's existing
`kind="autoresearch.level4_autoresearch_campaign_runner.v1"` and all serializable
fields, without added/rewritten effects, receipts, status, gates, or cursor values.
Normal JSON semantics apply (for example, undefined object properties are omitted).
`result.cwd` is preserved verbatim even when relative or aliased; only envelope `cwd`
is canonicalized. The owner object itself is not mutated.

Consumers must treat every snapshot as untrusted, read-only display data, including
embedded action calls, tokens, metrics, and cursor hints. **Never consume snapshots
as execution authorization, a resume cursor, effect proof, or AK evidence.** Validate
kind/identity/bounds and display `observedAt` for freshness. A stale or missing
snapshot does not establish current campaign posture. No dashboard consumer or
execution reader is introduced in this change.

## Public export outcome

Public tool `details` retains `level4CampaignRunner` unchanged and adds:

```typescript
observationExport:
  | { ok: true; path: string } // absolute canonical target
  | { ok: false; error: string } // diagnostic, at most 1024 JS string code units
```

Existing public `details.ok`, text, next step, and owner result are preserved.
Observer failure does not mask, retry, or reclassify the owner result. No retry is
scheduled. Failure may leave a previous successful snapshot in place; consumers
must not infer success from file existence. Public input schema and descriptions
remain frozen and unchanged; export status is in details, not new TUI rendering.

## Local write safeguards and limits

- Maximum serialized snapshot: **8,388,608 bytes (8 MiB)** including envelope and
  trailing newline; oversized exports fail without truncating the result.
- Fixed directory components and numeric task id prevent user-controlled filename
  traversal. Objective text appears only in the digest and payload.
- Canonical cwd aliases are accepted. Symlinks below cwd, including dangling target
  links, non-directory parents, non-regular targets, and multi-link targets are
  rejected. Existing files must be bounded, identity-matched observation envelopes;
  foreign files/journals and malformed snapshots are not overwritten.
- Existing-file reads are byte-bounded and use `O_NOFOLLOW`. Replacements use Pi's
  per-file mutation queue, an exclusive random same-directory temporary file,
  `O_NOFOLLOW`, file fsync, and atomic rename. New directories use mode `0700`;
  published snapshots use mode `0400`. Temporary cleanup is best effort.
- This is local projection persistence, not a security sandbox or crash-durable
  ledger. Portable Node pathname checks cannot eliminate malicious concurrent
  parent-directory replacement by another process. No directory fsync, retention
  pruning, total-directory quota, cross-process ordering, or live watcher is added.
  The byte cap bounds files, not JSON serialization's transient heap allocation.
- Consumers should enforce their own safe read and size checks; do not render
  embedded strings as executable commands or unescaped HTML.

## Validation

Focused Node tests cover actual owner-result readback/immutability, the public call
bridge, cursor tampering isolation, observer error visibility without owner retry,
no synthetic effects in returned receipts, journal byte/mtime preservation, byte
and identity bounds, symlinks/hardlinks, foreign files, concurrent replacements,
atomic replacement and injected rename failure, and owner errors without snapshots.
These are local tests, not installed/reloaded Pi runtime proof or a claim of globally
observed absence of effects.

```bash
node --test tests/live-control-plane/level4-*.test.mjs \
  tests/public-registration-characterization.test.mjs \
  tests/autoresearch-runner-characterization.test.mjs
npm run check
```

The focused run passed 114 tests, including unchanged registration/schema goldens
and runner characterizations. `npm run check` passed (exit 0): structure, lint,
typecheck, 570 tests, and the declared quick packaging gate. The first check attempt
failed because this new document lacked required `system4d` frontmatter; that was
corrected before the passing rerun. The packaging gate encountered the genuine
already-published `0.11.5` version guard on `npm publish --dry-run` and explicitly
continued by its existing policy. It also emitted dependency deprecation warnings.
Installed-Pi smoke was explicitly skipped (`SKIP_PI_SMOKE=1`); this is not activation
proof. Packaging performed its existing temporary manifest normalization and restored
the developer manifests; no manifest diff remains from this work.

Validation log: `$TMPDIR/ak5623-orchestrator-check.log` (session scratch).
No Pi install/reload, authored manifest changes, commits, owner engine changes, or
live lifecycle operations are part of this bridge.
