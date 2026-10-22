---
summary: "ROCS inspection output isolation, lifecycle boundaries, and disposable-target proof recipe."
read_when:
  - "Changing inspection, proposal, picker search, or ROCS output lifetimes."
system4d:
  container: "Package-owned inspection output and cache lifetimes over the ROCS contract."
  compass: "Preserve source, projections and authority receipts without weakening strict truth."
  engine: "Private artifacts and snapshots -> consume -> identity-checked cleanup."
  fog: "Index-cache disabling alone does not prevent strict-ref snapshot writes."
---

# Read-only inspection output contract

## Mechanism and repair

Legacy search needs ROCS `build` artifacts; status includes `validate` by default.
Neither command is a no-write operation. In particular, ROCS build can replace the aggregate
and build receipts and remove the validate receipt. A read-risk tool declaration does not
change those effects. The reproduced mechanism does not identify the last historical writer.

The workflow core requires the adapter's `withInspectionOutput` capability for legacy
status, search (including empty-query pickers), and pack. Proposal and all three pickers
share that core. Missing isolation capability fails closed. Verified development discovery
and bound-pack retain their existing cache-disabled, no-env-file protocol; they do not
use legacy build and are unchanged.

The adapter allocates a new 0700 `.pi-ontology-inspect-*` directory directly under the real
repository root. Its `artifacts/` child is the child-only `ROCS_OUTPUT_ROOT`; its sibling
`cache/` is `ROCS_CACHE_DIR`. ROCS owns the output marker and checks non-symlink, repository
containment, reserved paths, and source disjointness. The cache cannot live inside the managed
artifact directory: ROCS rejects a nonempty unmarked output root. `--no-index-cache` disables
index caching, but **does not disable strict-ref snapshot creation**. Those snapshots now live
only in the private cache and are removed with the same lifetime. `GIT_OPTIONAL_LOCKS=0`
prevents read-side Git index refresh. Ambient environment is not modified.

Artifact and pinned snapshot bytes are consumed before cleanup. Search hits backed by a private
snapshot return `path: ""`, as development discovery already does; returning a removed path or
substituting the dirty checkout path would be misleading. IDs, labels, definitions and scores
still come from the pinned bytes.

Cleanup verifies the parent and pinned directory identities, then removes only that owned
private tree. Subprocess failure, parsing/catalog failure, deadline, and cancellation all
settle before cleanup; POSIX inspection subprocesses have a private process group so launcher
children are killed too. Cleanup failures include the path and original error, and propagate
even through best-effort proposal search. There is no shared-output fallback.

Apply-time validate/build retains its existing output destination and receipt behavior.
Strict/loose flags and authoritative/non-authoritative ROCS results are not rewritten.

## Alternatives and limits

- Using canonical `dist` and restoring it afterward risks concurrent writers and mtime loss.
- Reading existing `dist` alone can return stale results and loses current validation truth.
- An arbitrary external temporary output root is rejected by ROCS's existing contract.
- Cloning/copying the repository changes workspace/ref identity and adds unnecessary scope.
- Disabling receipts alone neither isolates build projections nor preserves authority semantics.

This is source/projection/receipt preservation, **not zero filesystem writes**. Creating and
removing the private root changes the repository directory's mtime. Read-only filesystems fail
rather than falling back. Hostile same-uid rename races and malicious runner overrides are not
a sandboxed threat boundary. Abrupt host death (for example SIGKILL of Pi) can leave scratch;
there is deliberately no automatic sweep of old directories whose ownership is unknown.

## Regression commands

From the worktree root, with a caller-owned `TMPDIR`:

```sh
source scripts/select-gate-node.sh
cd packages/pi-ontology-workflows
npm run check
npm run test:inspection-output
```

`check` is the ordinary package gate; it discovers `*.test.ts`, not the real-ROCS
`.integration.ts` file. `test:inspection-output` explicitly runs both the lifetime unit tests
and the real-ROCS fixture suite. Both commands are required for this isolation proof; do not
substitute the ordinary gate for real-ROCS evidence.

The explicit suite requires an installed Git and owner ROCS `.venv` at
`~/ai-society/core/rocs-cli` (or `PI_ONTOLOGY_TEST_ROCS_PROJECT` for an isolated HOME).
It installs nothing and mutates only disposable target repositories, including Git init/add/
commit inside a disposable dependency. Missing prerequisites fail rather than skip. All ROCS
cache writes are confined to fixture scratch. It seeds real build and validate receipts,
compares file bytes and nanosecond mtimes (including dependency Git metadata and existing child
directories), exercises nested/root layouts, proposal, all registered picker handlers and
cancellation, error paths, exact missing-pin rejection, strict authoritative success for clean
and dirty pinned dependencies, loose non-authoritative success, and ordinary mutable build.
The dirty case requires actual private snapshot creation and verifies reads use committed bytes
rather than the dirty checkout; failure cleanup and absence of ambient cache changes are checked.
Neither command proves a loaded Pi generation or renders a TUI.

## Parent-operated live proof after independent inspection

1. Use a disposable ontology fixture only. Seed aggregate/build/validate receipts with the
   approved ROCS runtime, and snapshot source/projections/receipts as SHA-256 + `mtimeNs`.
   Bind fixture cache directories explicitly; do not use a user ontology repository.
2. Load the inspected extension in a fresh isolated Pi agent directory/session under the
   parent's activation authority. Record the extension path and actual ROCS runner identity.
3. In print mode exercise `ontology_inspect` search, empty search, default status and pack;
   exercise the proposal consumer if loaded. Compare the snapshot after every call and require
   no remaining `.pi-ontology-inspect-*` directory on success or ordinary error/cancel.
4. In a fresh TUI session exercise `/ontology-status`, all three picker triggers, and picker
   cancellation. Compare the same snapshot. Handler tests are not rendered-TUI proof.
5. Separately apply an explicitly authorized change **to that fixture**, and verify canonical
   build/validate publication still occurs. Record results before activating against real repos.
