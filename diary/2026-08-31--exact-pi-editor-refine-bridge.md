---
summary: "Focus-bound two-phase Pi editor refinement bridge with exact editor CAS, discovery descriptors, and hash-only recovery."
read_when:
  - "You need the Pi-side implementation or validation boundary for OpenDeck REFINE ALL."
type: "diary"
---

# 2026-08-31 — exact Pi editor refinement bridge

## Scope

AK task `5223` owns this Pi-side slice. `packages/pi-interaction/pi-interaction` now exposes a same-user Unix-socket bridge for the exact expanded owned `TriggerEditor`; `pi-editor-registry` supplies a monotonic mutation generation used to reject ABA edits.

The bridge publishes a mode-`0600` process-unique socket and discovery descriptor under the mode-`0700` `${XDG_RUNTIME_DIR}/pi-editor-refine/` directory. Snapshot and commit bind the logical session, random publisher, PID/start identity, exact Ghostty process/family/surface, Niri window/focus epoch, editor instance/generation, mode, transaction, preimage, and deadline.

Commit rechecks idle/pending state, active editor ownership, process/focus identity, exact retained preimage, and generation before one native `setText`. Changed successful candidates retain Pi's one-unit `Ctrl+-` undo behavior. Unchanged candidates, ambiguity, drift, replay, expiry, malformed framing, and concurrent work fail closed. Applied or indeterminate outcomes are recoverable for 30 seconds through hash-only status; unknown status is never retry-safe.

Raw editor text is transported only in the bounded snapshot/commit exchange. It is not logged, persisted, placed in diagnostics/session entries, or copied through the system clipboard.

## Validation

Observed source validation:

- `@tryinget/pi-interaction`: lint and typecheck passed; 22 tests passed.
- focused editor bridge: 15 tests passed, including in-flight cancellation, replay, ABA, notification failure, descriptor modes, status recovery, and indeterminate readback.
- `@tryinget/pi-editor-registry`: `npm run check` passed; 9 tests passed; package/release smoke passed.
- `@tryinget/pi-interaction` package/release smoke passed in an isolated run; one earlier concurrent pair of release checks collided on the shared publish-manifest lifecycle and was not treated as product evidence.
- independent reviewer final verdict: PASS for the Pi bridge blocker/high matrix.
- `git diff --check` passed for the scoped package files.

## Proof boundary

No Pi package install/reload, live TUI editor mutation, model call, clipboard operation, or workstation runtime mutation was performed in this source-validation slice. Live same-session multi-publisher focus, physical OpenDeck invocation, and `Ctrl+-` restoration remain rollout proof, not completed behavior.
