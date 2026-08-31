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

## Controlled live canary

After explicit operator authorization, fresh Ghostty Pi sessions loaded the committed source and published mode-`0600` descriptors. A non-sensitive two-line scratch buffer was committed through the real focused Niri/Ghostty/session-presence bridge and workstation client using a deterministic in-memory model seam because the canonical live model port was down.

The live bridge reported matching input/output hashes, `status=committed`, and `effect=applied`; the full multiline buffer and both line anchors survived, and the clipboard digest did not change. Exact presence included the known Ghostty process family, normalized surface, terminal key, full bound title, and one focused window. Focus on Activity Strip/Brave failed before snapshot.

An automated `wtype` attempt to deliver `Ctrl+-` did not restore the preimage. Synthetic key delivery itself was not proven, so this is an unresolved live-proof gap rather than evidence that native undo is broken. The source-level inherited `setText` undo contract and tests still pass.

## Proof boundary

No explicit Pi install/reload was needed for fresh local-path sessions, and no production model/service or physical OpenDeck mutation was performed. The real live bridge commit is proven with a deterministic model seam. Same-session multi-publisher focus, successful production-model execution, physical OpenDeck invocation, and `Ctrl+-` restoration remain rollout proof, not completed behavior.
