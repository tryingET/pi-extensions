---
summary: "Diary entry for AK task references on the activity ribbon (AK 5701)."
read_when:
  - "Reviewing why AK task chips join by session id for buttons and by repo for badges."
system4d:
  container: "Session diary entry."
  compass: "Capture the join-semantics decision and fail-closed rules while fresh."
  engine: "State objective -> record design decision -> record validation -> note limits."
  fog: "A later session may re-litigate the badge join and lose the operator-confirmed semantics."
---

# 2026-09-13 — feat — clickable AK task references on the ribbon

## Objective

AK #5701: show the AK task a card's session is working on, make the reference clickable to focus the claiming session's Ghostty window, keep AK strictly a read-only projection.

## Design decision (operator-confirmed)

Two join keys, settled through an operator interview because the pure session-id join could never render the two badge states the task acceptance demands:

- **Buttons join by exact session id.** `claimed_by = session-<uuid>` must equal a session id aggregated into exactly one card (a session resumed into two terminals is ambiguous and binds nothing). Lease must be unexpired; AK5700 makes an expired lease vacant custody, which renders nothing.
- **Badges join by task repo.** "Claim outlives session" (live lease, claiming session has no live card anywhere) and deferred tasks (active deferral rows) have no card of their own by construction — cards exist only for live sessions, and AK deferrals only attach to pending/unclaimed tasks. They badge cards whose cwd sits inside the task's repo, bounded at two badges per card plus an overflow count. Badges never fire anything; only the live-claim chip reuses the card's `activate` path, so no new control-plane action exists (no unclaim/land/reconstruct/apply, ever).

Read surface: `ak task list --status claimed --format json --all --verbose` plus `ak task deferred --format json --all`, both read-only, polled every 15 s. Missing binary / non-zero exit / malformed envelope clears all chips (fail closed, no invented state); `PI_ACTIVITY_STRIP_AK_TASKS=0` disables the join.

## What changed

- `src/common/ak-tasks.mjs` — pure parsing + join (claim/deferral validation, lease liveness, repo containment, ambiguity, chip bounding)
- `src/native/ak-runtime.mjs` — polling runtime + projection wiring + status fields
- `src/native/panel-projection.mjs` — `setAkTasks` and chip join into display cards
- `src/common/session-cards.mjs` — cards now carry `publisherSessionIds`
- `src/native/main.mjs` — runtime wiring and `akTaskRenderedCount`
- native panel: `AkTask` in the view protocol, chip row in the card header (active chips clickable via the card's activation; badges inert), `task` inspector row, tooltips/accessible labels, `style.css` chip palette derived from the theme names
- README interaction contract, environment controls, scope; contracts `.ts`/`.d.ts` AK types

## Validation

- `npm run native:build` — cargo fmt + 12 tests + release build, staged artifact receipt regenerated (source and binary hashes rebound)
- `npm run check` — full package gate green (file budget, unit tests including 14 new AK join/parse tests and 5 runtime fail-closed tests, typecheck, release dry-run)
- live dogfood: strip restarted, `strip:status` reports `AK task refs: ok` with the live claim count, and the session card for this task's claiming session renders `AK #5701` (see task evidence)

## Limits / next moves

- Badge overflow beyond two per card is a count, not a list; the inspector row shows all joined references with state.
- AK poll cadence (15 s) can lag a claim by up to one interval; chips refresh on the next view after each poll.
- A dead session's card disappears from the broker within the 12 s stale window, so an orphaned claim typically badges repo cards for most of its remaining lease (up to 1 h by default) — that is the visible "custody is stuck" signal.
