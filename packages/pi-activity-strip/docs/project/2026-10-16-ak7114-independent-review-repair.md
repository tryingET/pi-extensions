---
summary: "AK7114 independent-review corrections: publisher-set identity, source-bound jump intent and enforced private protocol v2. Inactive candidate."
read_when:
  - "Inspecting or reproducing the three corrections requested by review dispatch 1792182224759."
---

# AK7114 — independent-review corrections

Worktree: `/home/tryinget/.local/state/pi-quests/tmp/ak7114-hover-restore.e8cbK2/worktree`.
Base: `5d12a2a7`.
Scope remains `packages/pi-activity-strip/**`. No commits, activation, canonical/settings changes,
operator-process signals, AK/ontology writes, or release 7076/startup 7095 adoption.
The user authorization to restore hover-and-type remains unchanged. The
[earlier candidate evidence](2026-10-16-ak7114-hover-restoration.md) is historical: its passing
325/38/full-GUI checks did not cover these three defects and are not current proof.

## Findings and corrections

1. **Publisher presentation order was incorrectly identity.** The real broker reorders streams
   by activity; aggregation preserves that publisher-key order. Source identity now uses a
   sorted, deduplicated publisher-key set. Actual broker order changes retain epoch, ownership
   and visibility under normal and reserved-NULL hover/explicit modes. Membership additions and
   removals still revoke the old claim. New, not-yet-admitted members cannot inherit old admission.
2. **Enter's own release could revoke an already accepted numeric action.** Capture ownership
   and source identity are now independent. A synchronous, one-shot accepted jump intent snapshots
   its source epoch/context, claim generation and listed-target identities. Its own inactive ack
   and transient NULL release can hide the ribbon and release all keys without cancelling that
   action. After the asynchronous window read, the exact same production binding rechecks current
   source context, complete fresh admission, source window pid/app/workspace facts and target
   identity. Known non-agent/unknown focus, workspace change, close, replacement, ambiguity,
   membership change, explicit cancellation or a newer admitted claim revoke it. Listed targets
   cannot silently become unlisted; only an accepted explicit intent may address an existing
   originally-unlisted id. No capture lease is retained and no future keyboard grab is queued.
3. **The private wire change was incompatible with v1.** The private controller/panel protocol
   is explicitly **v2**. Build receipts declare `panelProtocol: 2`; receipt admission checks it
   even for development integrity bypasses. Actual child readiness/events must also match; a
   mismatch becomes a terminal runtime error, revokes ownership, closes/signals only that owned
   child, and cannot become ready through a later packet. Native input checks every control/view
   envelope. A legacy message emits a clear v2 error and exits 1, including when GTK never mapped
   a window (closing that hidden window alone did not terminate its application hold).

Pi publisher/broker message envelopes and source files are unchanged. The GUI fixture additionally
uses the actual base-commit publisher client alongside the current client, aggregated into one
agent card. This is separate from the private panel protocol and does not require publisher reload.

The optional acquisition boundary is also tightened: applied focus at/after the acquisition
expiry cannot restart an expired hover claim; pending-grant expiry and release/reacquire token
checks remain covered. Complete cached-window production revalidation is unchanged except for a
read-only copy accessor for source window identity facts. No CSS/theme/design-token changes.

## Verification

| Check | Observed result |
| --- | --- |
| Pinned Node 22.23.3 / npm 12.0.2 package check | **375 tests / 39 files**, exit 0. [Log](ak7114-review-evidence/package-check.txt). Existing 0.9.0 publish **dry-run** version guard was tolerated by the declared script; Pi smoke skipped. No publication/activation. |
| Focused current production/admission regressions | **202/202 passed**: 200 ownership, invalidation, pipe-ordering, action and protocol cases plus two fixture-selector tests. [Log](ak7114-review-evidence/focused-regressions.txt). |
| Pinned Rust 1.98.0 private-target native check/build, heavy-job task 7114 | **39 tests passed**, GUI test deliberately ignored in this ordinary lane; exit 0. [Log](ak7114-review-evidence/native-check-build.txt). |
| Full isolated GTK + actual controller/Niri after all runtime fixes | **Exit 0**: selected native GTK test passed, actual cross-version negative checks passed, then the complete controller interaction suite passed. [Log](ak7114-review-evidence/isolated-gui.txt). |
| Current source/binary receipt | ABI **2**, staged binary and complete Rust/CSS/Cargo source hashes match. The GUI pinned this receipted path with integrity bypass disabled and observed protocol-2 readiness. [Record](ak7114-review-evidence/artifact-match.txt). No supplemental /proc executable-hash observation is claimed. |
| Isolation/cleanup | Completed full-run helper stopped with no remaining fixture windows/layers. Protected PIDs retain their October 15 start times; host AT-SPI inode remains 18947. Git index empty. [Record](ak7114-review-evidence/isolation-boundary.txt). |

The actual first hover (without a shortcut) stayed active for **16,010 ms** through **73 view
updates**. The real broker emitted **both publisher-key orders**, while the owner epoch remained
**7**; there were **zero hidden views** and **zero inactive acknowledgements** before Enter's
jump. Exact cross-workspace target focus and subsequent typing were asserted. The rest of the
full suite retained project search, actual nonempty-query cleanup on leave/Escape/idle,
interrupt/subsequent typing, no telemetry recapture, unlisted-hover refusal, explicit upgrade
and toggle, explicit NULL focus, non-agent hiding, workspace refusal and owner-close checks.
[Summary](ak7114-review-evidence/protocol-summary.json) /
[selected original protocol events](ak7114-review-evidence/protocol-events.jsonl).

Actual cross-version diagnostics included:

- v2 native + legacy input: protocol-2 error containing expected 2/received 1, exit **1**, no layer;
- current controller + genuine v1 binary with a checksum-correct v2-declared test receipt:
  state **error**, readyAt **null**, visible **false**, expected 2/received 1, **zero restarts**;
- actual base controller + new panel: never ready, visible **false**, unsupported-protocol warning,
  no layer. Unchanged public broker ping/shutdown worked in both controller cases.

The tested base publisher/client/extension sources are also byte-identical to canonical commit
2792dc43292310acbed280fed4aaa11bdb361595 by commit diff (not a claim about arbitrary uncommitted
canonical files). Their actual client published into the new controller alongside the current
client during the full run.

Current artifact, new inactive worktree only, not Git-staged:

- Binary SHA-256: `aada4b72d4b1f5534e14c0a835d8c0faf7df7a9b062abcc5aa48de09984b1f66`
- Complete native source SHA-256: `9e7c91e117893922cf3844f461da89ca4ca1d5e86ff34b51cbb2f292aee84cee`
- Cargo lock SHA-256: `f8ebc11bc721c569af982169e448a5ea4fed15bc06001017d97acda22b1c890b`
- Receipt: `native/bin/linux-x64-gnu/artifact.json`, including panelProtocol 2.

Early extended runs were not passes: fatal rejection initially relied on closing a hidden GTK
window and did not terminate; that was fixed by diagnostic plus process exit. A later workload
changed lastEventAt but not the broker's updatedAt sort key, so the added live-reorder assertion
correctly failed; the workload was corrected and that assertion retained.

After the completed full run, a **test-only** workspace selector was hardened to choose a truly
unoccupied workspace rather than any other workspace (which might hold the target agent). Its
two pure tests passed. This selector refinement was **not GUI-replayed**: an extra optional
rerun's canonical helper up failed with focused outer output null. Only its owned Niri PID
2875827 was recovered after exact config/socket identity checks and stopped with canonical down.
No operator window was moved to manufacture a passing environment. Optional new executable
observation code was removed. Runtime source and native artifact are unchanged from the successful
full run; the post-run selector change is fixture-only and its GUI coverage limit is explicit.

## Test boundaries

Controlled races call `createPanelWindowJump`, the same binding invoked by
native event consumption. Both independent pipe orderings are covered: restored source focus
before the inactive ack, and inactive ack plus a real fallback projection while still NULL before
source restoration. Source and target invalidation cases include facts observed only in the
fresh IPC inventory, without relying on a preceding simulated event. Compositor IPC completion
and focus effects are doubles in those tests; no actual operator window is addressed. Positive
explicit-unlisted actions and the two forced pipe orderings are controlled production-binding
proofs, not forced real-Niri race scheduling.

The full GUI fixture retains canonical helper `up/env/check/down` isolation, a private
HOME/config/runtime/session bus, disabled AT-SPI, explicit owned Niri/display sockets and Cairo.
It uses actual GTK fixtures, real controller processes, genuine virtual pointer/keyboard events,
actual Niri focus/mode checks and subsequent typing receivers, not operator applications.
A preinitialized keyboard avoids consuming the short hover idle period on client startup.
Actual publisher activity alternates the representative/order while hover stays engaged.

Cross-version checks use the real extracted base `5d12a2a7` controller and binary, not a protocol
mock: v1-receipted overrides are rejected before GUI launch; a real v1 binary with a deliberately
v2-declared but checksum-correct test receipt still fails actual readiness; the old controller
never becomes ready against the new panel; and the new panel rejects an actual legacy command.
Public broker ping/shutdown and the base publisher client are independently exercised unchanged.

No new live Pi/Ghostty/hidden-tab/AT-SPI/host GPU/multi-output proof is claimed. Click rearming is
not separately GUI-driven. GTK geometry warnings remain unsuppressed. Package checks, not full
monorepo CI, are the declared bounded validation surface here. The passive pipe observer adds
synchronous logging overhead; no uninstrumented operator-runtime timing claim is made.

## Reproduce and parent handover

Use the prior note's pinned toolchain, private target, virtual-pointer/keyboard compilation and
canonical helper setup. Before running the extended GUI harness, materialize only the historical
package under owned ignored scratch (no installs or builds of it):

```bash
mkdir -p native/panel/target/cross-version
git -C ../.. archive 5d12a2a7 packages/pi-activity-strip | \
  tar -x -C native/panel/target/cross-version
```

Then run package `npm run check` and task-labelled `native:check/native:build`,
followed by the full `tests/support/isolated-niri-check.mjs` with a fresh owned helper state.
Always run helper check/down after harness child cleanup, including failure. Do not use the
controller-only diagnostic selection as full-run proof.

Parent next: independent source/artifact/evidence inspection, then commit only the authorized
candidate scope and, if inspection permits, perform the already authorized temporary **paired
controller/panel ribbon-only** switch. This child does not commit or activate. Canonical, Pi
settings, other extensions, 7076 and 7095 remain untouched; no AK lifecycle closeout is asserted.
