---
summary: "Why a stationary pointer re-entered by the compositor could request hover keyboard after hide/show, the pre-hide position anchor that stops it, and the hover returns no client can decide."
read_when:
  - "Changing when a body entry sends hover-request, or what hiding does to hover state."
  - "Revisiting the AK7417 F01-F03 hover counterexamples."
task_id: 7922
---

# Hover re-entry after hide: the pre-hide position anchor

AK7922 is a child of AK7417, operator-authorized on 2026-11-01. It covers only the native panel. The shipped artifact is restaged with the fix; live adoption is still open (see the last section).

## What failed on the live Oct31 panel

The historical AK7417/AK7640 GTK counterexamples were ported byte-identically onto `81304a459`, which is the live controller/panel subject, and run in a private nested Niri. The positive control passed and all three were RED:

- **F02 stationary remap: RED.** The panel hides with the pointer inside, then shows again under the unmoved pointer. A real `Tick` runs while the panel is mapped and the pointer is off the body, before the compositor's `Enter`. That `Enter` sent `hover-request`.
- **F03 backend loss: RED.** Same as F02, plus a workspace switch while hidden. GDK reports that the pointer left the root surface, and the `Enter` returns at the same position. It also sent `hover-request`.
- **F01 rapid re-entry: RED.** Hide, a genuine move outside, show, then a genuine return to the pre-hide position with no `Tick`. No request was sent.

F02 and F03 are the unsafe direction. A grant switches the panel to exclusive keyboard mode, so typing meant for another window could land in the strip.

## Root cause

The decision rests on `hover_keyboard.inside`, the "already inside since a genuine entry" latch.

1. The `Leave` that arrives while hidden is dropped by the `!visible` guard in `update_with_view`. The latch therefore survives a hide, which is why F01 fails.
2. The `Tick` clears `inside` whenever the panel is mapped and the pointer is off the body. A remap opens exactly that window before the compositor's stationary `Enter`. That `Enter` then counts as fresh, which is why F02 and F03 fail.

## What a client can know

`wl_pointer.enter` carries no cause. In the dispatch traces, between hide and `Enter`, F01 matches F03 except for the `Tick` that F03's test injects. Both re-enter at surface position (52, 32), and GDK reports no root position in both. F02 differs only in that GDK keeps the root surface at (52, 32) through the show. F03 shows that signal cannot separate a stationary pointer from a moved one.

No client-only rule, except timing, can therefore grant F01's exact-position return while refusing F02 and F03. The usable physical fact is narrower: an unmoved pointer comes back at exactly its pre-hide surface position, provided the surface did not move.

## Repair (safety-first)

- `interaction.rs` adds `PointerAnchor` (`At(x, y)` or `Unknown`) and the pure, unit-tested `is_stationary_reentry`.
  - Stationary: the exact pre-hide position, an unknown pre-hide position, or an entry with no reportable position. The unknown cases fail safe.
  - Otherwise: a genuine arrival.
- `app.rs`:
  - When `apply_view` hides the panel while `inside` is set, it records GDK's surface-local pointer position.
  - The next body entry consumes that record. A stationary entry keeps hover engagement (the directory opens) but sends no `hover-request`.
  - A genuine leave while visible clears the record.
  - The record also expires on the second mapped/body-absent `Tick` (`HideAnchor::after_mapped_absence`). Only the first such Tick can fall between a remap and the compositor re-entering a stationary pointer, which is the F02/F03 race. A second one, a full Tick later, means the pointer is elsewhere.

No wall-clock wait is added. The only clock is the panel's existing 1 s `Tick` sampling, which the expiry counts. Idle expiry, explicit keyboard mode, clicks, grants and epochs are unchanged.

A variant was tried and rejected: also clearing `inside` at hide. It made a fast return elsewhere request (runs 4 and 5). Independent inspection then showed the cost. The strip is anchored top/left/right, so another exclusive-zone layer changing while it is hidden moves the surface under a stationary pointer. With the latch cleared, that becomes a *deterministic* request; canonical had only a rare race.

| Stationary pointer, after hide/show | Canonical | This repair | Variant (rejected) |
| --- | --- | --- | --- |
| Same geometry, no Tick | no request | no request | no request |
| Same geometry, Tick in the gap (F02/F03) | **request** | no request | no request |
| Surface moved, no Tick | no request | no request | **request** |
| Surface moved, Tick in the gap | **request** | **request** | **request** |

| Genuine return | Canonical | This repair | Variant (rejected) |
| --- | --- | --- | --- |
| Elsewhere, before any Tick | missed | missed | request |
| Elsewhere, after a Tick | request | request | request |
| Exact pre-hide position | missed or request | missed | missed |

The repair is never less safe than canonical. A missed request costs one leave-and-return, or the hotkey.

The expiry was added after the full `tests/support/isolated-niri-check.mjs` caught a regression in the first version. In its third hover step the strip hides with the pointer inside, the pointer moves away while hidden, and the strip is then visible for seconds before the pointer returns to the same pixel. The surviving anchor called that return stationary, so the harness failed with "real pointer entry granted hover keyboard by Node". Canonical passes the same controller phase. With the expiry, that return is a fresh entry again, as it is on canonical, while F02/F03 keep their single remap Tick.

## Proof

All runs used the same oracles, in a private nested Niri with a private runtime and session bus and `GTK_A11Y=none`. Evidence is on AK7922.

| Case | Run 1, canonical | Run 3, repair | Run 4, repair + new oracle |
| --- | --- | --- | --- |
| Positive control `isolated_gtk_interaction` | PASS | PASS | PASS |
| F02 stationary remap | RED | GREEN | GREEN |
| F03 backend-loss stationary | RED | GREEN | GREEN |
| F01 return to the exact pre-hide position | RED | RED | RED (known) |
| Fast return elsewhere, no Tick (new) | n/a | n/a | RED (known) |

Run 8 binds the sources with the expiry, test binary `84866c8a…`. The results match run 4: F02/F03 GREEN, F01 and the fast return elsewhere still known RED, and the Rust unit suite at 43 tests. The release artifact `2e7b9333…` passed the full `isolated-niri-check.mjs`: the native GTK step plus 13 controller-phase checks, with cleanup verified. The first artifact, without the expiry, failed that phase at the third hover step. In every run, cleanup was verified and the sources and shipped artifact were unchanged.

The full harness now needs `PI_ACTIVITY_STRIP_GUI_HEAVY_JOB_TASK` and `PI_ACTIVITY_STRIP_GUI_HEAVY_JOB_LABEL` for its native step, and it honours `CARGO_TARGET_DIR`. Its hover-after-hide step waits 3.2 s (two Tick periods plus margin) with the pointer outside before returning. Its telemetry heartbeat drops an isolated publish timeout, as production telemetry does. To run the GTK cases, use the per-test runner adapted from AK7640 (`ak7922-hover/evidence/native-gui-7922.py`, invoked by `qualify-7922.sh` under `heavy-job`). It brings up a fresh nested-niri helper per test. `tests/support/isolated-niri-check.mjs` selects only `isolated_gtk_interaction`.

## Still open

- **F01 and the fast return elsewhere** (known RED, ignored with that reason). Closing them needs a compositor intent witness, of which the private AK7669 Niri protocol prototype is one candidate, or an owner decision to accept them.
- **A surface that moves while hidden, with a Tick in the gap**: same as canonical.
- **Anchor freshness.** The anchor is taken when the hide view is applied. A motion still queued in the same instant can make it stale, which risks a request only in the Tick case. Refreshing it at the hidden leave is a candidate, but it has no RED yet.
- **The one-Tick exact-pixel return.** A genuine return to the pre-hide pixel after exactly one mapped absence does not request; canonical's does. It looks the same to the client as F02, whose GREEN oracle encodes this accepted trade. After two absences it requests again, as `isolated_gtk_exact_pixel_return_after_two_ticks_requests_again` asserts. That oracle was RED with the aging removed and GREEN with it.
- **Double flap.** If the strip hides again after one mapped absence but before the pointer's re-entry, the old anchor carries over, and the next show's Tick expires it. That ends at canonical behaviour and has no oracle yet.
- **Expiry timing.** If the compositor stalls for more than a full Tick between a remap and its re-entry, the anchor has expired, and the behaviour is canonical's.
- **No committed harness runs the four hover cases.**
- **Live adoption.** The artifact is restaged and its receipt matches. Landing waits on the AK7675 Node pin, and then a paired live restart.
