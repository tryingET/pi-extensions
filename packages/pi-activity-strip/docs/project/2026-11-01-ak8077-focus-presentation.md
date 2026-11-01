---
summary: "AK8077: eligible-focus switches keep presentation without retaining input authority; directory rows update in place."
read_when:
  - "Changing focus handoff presentation, selected-window revocation or directory row rendering."
  - "Investigating ribbon flicker, application height changes or the AK8077 RED/GREEN evidence."
type: reference
---

# Eligible handoff presentation — AK8077

This page explains implementation and bounded checks. AK8077 owns task, qualification,
remaining obligations and adoption state; this page does not authorize landing or restart.
The source comparison starts at `9535d2763be34f65045e1a5ee52955f701b0d27e`.

## Two mechanisms, not a reboot diagnosis

The current controller could publish a transient hidden view when switching between two
eligible windows. Layout selection and seat focus arrive independently, and full reads can
interleave them too. A selected-window contradiction correctly revoked the old exact source,
but clearing that source also made the presentation ineligible. A positive focus event could
not re-admit invalidated proof before fresh reconciliation, so the native surface hid and
then returned.

Native hiding removes the exclusive zone and unmaps the layer. Showing it reinstates the
compact zone. The private real-compositor counterexample measured application heights of
596 pixels with the ribbon and 688 without it: **84 pixels of compact zone plus its 8-pixel
anchored top margin**. The unchanged source reproduced that 92-pixel resize during an
eligible focus switch. Height repair can perform further resets after actual zone changes;
its existing algorithm is not changed here.

Separately, a directory entry's `current` flag participates in `WindowEntry` equality.
Focus-only changes therefore call `DirectoryView.render`. That method removed every GTK
row and built replacements, even when membership, order and labels were unchanged.

These establish current code mechanisms. They do **not** establish why the operator first
noticed the difference after reboot: no before-reboot loaded-process trace was used.

## First-principles boundary

Source/request revocation and presentation lifetime are independent facts. Keeping a useful
surface mapped must not retain an old permission, revive a late acknowledgement or infer
seat focus from layout selection. Conversely, withdrawing input authority does not require
tearing down a surface whose handoff endpoints remain positively known and eligible.

`panel-presentation.mjs` remembers presentation proof only. Both endpoints must retain:

- the focused workspace and complete cached window admission;
- exact window, process and application identity;
- exact visible card and publisher-set identity for agent sources, or neutral eligibility;
- selection consistent with the pending handoff when that field is present.

A hold cannot create an initially hidden surface. Unknown focus, non-presentable selection,
closure, movement or invalid admission ends it. There is no grace-period timer. Incremental
selection/focus events, mixed full reads and rapid eligible selections use the same rule.

The existing interaction state still revokes synchronously. Old epochs, requests and jump
intents remain invalid, including after their own keyboard release. Selected-window metadata
never establishes replacement keyboard authority. A visible passive handoff can therefore
refuse input until fresh focus admission; failed commands are not queued for later capture.

The controller GUI fixture now waits for actual fresh agent admission before its final
keyboard-entry assertion, rather than using visibility as a permission proxy. The success
assertion, non-agent revocation bound, returned-typing checks and hover timing oracles remain.

## Small native repair

`DirectoryView` caches the ordered material data of shown entries, normalizing only `current`.
When that data matches, existing GTK rows remain attached and their `current` and `chosen`
classes are updated. Every other `WindowEntry` field remains in the reuse key, including the
callback's captured card ID. Material changes still rebuild; empty-state messages remain
correct. Rebuild paths are not promised to preserve scroll.

## Executable checks

The required Given/When/Then suite is
[`focus-presentation.test.mjs`](../../tests/focus-presentation.test.mjs). Its production store,
placement, resolver, event-handler and projection path covers both event orders, agent/neutral
handoffs, immediate input revocation, mixed full reads, rapid selections and fail-closed controls.

The native oracle is
`app::gui_tests::isolated_gtk_directory_focus_only_preserves_rows_and_scroll`.
It retains strong references to actual GTK row objects, then checks object identity/order,
current styling and nonzero scroll retention after layout. The same test first failed on
row replacement and then passed after the repair.

The real geometry oracle is
[`focus-presentation-geometry.mjs`](../../tests/support/focus-presentation-geometry.mjs),
called by the existing isolated controller suite. It measures the same six fixture windows
with no layer **before starting the controller**, then requires every window to settle at
the compact 92-pixel reservation before the measured switches. This avoids attributing an
unfinished calibration configure to the first switch. It checks actual window heights and
mapped layers during convergence, plus every recorded view/native visibility message for
transient hides. It does not alter the rapid-hover acceptance preconditions.

| Observation | Bounded result |
| --- | --- |
| Controller Given/When/Then counterexamples | Each repair followed executable RED; final 24 presentation cases and 318 focused safety cases passed |
| Real application geometry | Unchanged9535 failed with five windows changing596→688; identical calibrated oracle passed on the repaired pair |
| Complete private controller suite | Passed, including actual public-publisher aggregation, incompatible-version negatives, returned typing, source revocation before idle, presence and source closure |
| Native declared Rust1.98 lane | Format/unit/release passed;45 unit cases,9 GUI cases ignored in that command |
| Explicit native GTK lane | All9 executed separately:7 positives passed;2 exact known F01 REDs retained under owner evidence18750 |
| Package contract | Pinned Node22.23.4/npm12.0.2 check passed57 test files and packaging; final source/tree receipts belong in AK |

AK evidence19370 records bounded progress;19390 records private controller/geometry/native
qualification. Exact final root checks, independent inspection, whole-pair recovery and
actual adoption require their own current AK receipts. None follows from this table alone.

## Limits and subsequent direction

The two rapid-return F01 limitations remain known RED, not repaired: see
[hover reentry](2026-11-01-hover-reentry-anchor.md) and AK evidence18750.
Physical GPU, IME, accessibility, multioutput and universal process/byte attestation are not
certified by private GTK/Cairo fixtures.

Ordinary non-agent and unknown focus still hide the ribbon by contract; their legitimate
working-area changes are not eliminated. This is not an always-visible global window
navigator. The operator's broader all-window monorepo extraction is deliberately separate
from this repair. No unrelated SDK, global setting, publication or lifecycle closeout is
part of AK8077.
