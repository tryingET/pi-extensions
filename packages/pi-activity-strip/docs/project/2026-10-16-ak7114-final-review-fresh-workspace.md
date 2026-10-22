---
summary: "AK7114 final-review P2/P3 corrections: fresh focused-workspace jump admission and history-free protocol unit checks; inactive candidate, no GUI replay."
read_when:
  - "Reviewing the latest AK7114 workspace race correction or reproducing history-free protocol checks."
---

# AK7114 — fresh workspace / hermetic protocol checks

This note supersedes the current-proof claims in the [previous repair note](2026-10-16-ak7114-independent-review-repair.md) for the Node jump binding and ordinary protocol tests only. Its genuine historical-controller/binary GUI results remain earlier evidence, **not a GUI replay of this revision**.

## Changes

- The production `createPanelWindowJump` binding now reads windows and workspaces concurrently. `main.mjs` supplies the existing `getNiriWorkspaces` / `readNiriWorkspaces` production path. After both reads complete, `resolveFocusedWorkspaceView` uses the canonical focused-workspace resolver, never output-local `is_active`. The accepted source workspace must still be the uniquely focused workspace. Missing, malformed, duplicate, ambiguous, or failed workspace observations refuse the jump.
- Existing one-shot intent, epoch/generation, fresh source pid/app/workspace/admission, target identity and explicit-unlisted policy remain intact. Own release still relinquishes capture immediately; eligibility is **not** required again to execute an already accepted intent.
- Controlled production-binding tests now pass workspace IPC through the real read helper (only command completion and effects are doubles). A delayed workspace notification with NULL focus, source workspace 7 retained in projection, and fresh empty workspace 9 focused refuses target 55. Both hover and explicit modes cover that race, failed/missing/malformed/ambiguous facts and duplicate ids. Existing normal source-focused cases cover both own-release pipe orderings, including NULL fallback projection before source restoration. Their workspace fixture deliberately marks multiple outputs' workspaces `is_active` while only source 7 is `is_focused`.
- Ordinary `panel-protocol.test.mjs` no longer invokes Git or materializes historical artifacts. Its executable bytes and v1 receipt are explicitly **synthetic semantic fixtures**, not cross-version proof. The real current controller still rejects the synthetic v1 receipt before launching it. Temporary fixture data uses owned TMPDIR scratch; relative socket names avoid Linux Unix-socket path limits with long TMPDIR, and the child has a bounded timeout.
- Genuine historical controller/binary GUI checks remain unchanged in `tests/support/protocol-cross-check.mjs`. They require explicit preparation of the real historical package, fail if absent, and are not silently skipped or replaced by these unit fixtures. Preparation instructions remain in the previous note.

## Observed checks

Pinned Node **22.23.3**, npm **12.0.2**:

| Check | Result |
| --- | --- |
| Focused ownership, release ordering, publisher reorder, source/target admission, protocol, fixture-selector suite | **224/224**, no skips. [Log](ak7114-final-review-evidence/focused-regressions.txt). |
| Package `SKIP_PI_SMOKE=1 npm run check` | **397 tests / 39 files**, exit 0; lint/typecheck/structure/file-budget/release dry-run checks passed. Existing published-0.9.0 dry-run guard tolerated by the declared script. No publication or Pi installation. [Log](ak7114-final-review-evidence/package-check.txt). |
| Protocol test in copied source-only tree, no `.git`, no node_modules, no native binary or historical fixture | **4/4**, no skips; `git show 5d12a2a7:...` failed as expected before tests. [Log and retained scratch path](ak7114-final-review-evidence/history-free-protocol.txt). |
| `git diff --check` | Exit 0. |

An initial targeted attempt stalled because an absolute scratch socket path exceeded Linux's socket-address limit; that was corrected to relative socket paths and a bounded child timeout. It is not counted as passing evidence. The final focused, package and source-only runs completed normally.

## Boundaries / next step

All authored changes in this pass are package-local Node/tests/docs. No Rust/native artifact/build-script changes, GUI execution, activation, canonical checkout, Pi settings, AK writes, commits or pushes. Binary SHA-256 remains `aada4b72d4b1f5534e14c0a835d8c0faf7df7a9b062abcc5aa48de09984b1f66`, matching the prior GUI-tested artifact. Protected PIDs **3290373 / 3290412** were only inspected, still showing their October 15 18:32:08 start times; neither was signalled or replaced.

The controlled tests prove binding decisions with supplied compositor facts, not real-Niri scheduling. Parallel IPC observations are not an atomic compositor transaction and cannot guarantee against a focus change after the reads. No new full GUI or live-runtime proof is claimed. Parent next: independent final inspection and full isolated GUI replay (including genuine historical fixture preparation) before any authorized paired temporary ribbon-only switch. This child does not activate or close out the task.
