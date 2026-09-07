---
summary: "AK5430: separate quota renewal, banked count and credit expiry, with installed startup/reload/resize proof."
read_when:
  - "Reviewing /limits Overview column semantics or responsive acceptance evidence."
---

# Limits renewal versus credit expiry — AK5430

Operator clarified that recurring quota-window renewal and banked-reset credit
expiration must not compete for a single display column.

## Implemented

Overview now has five independent fields: **Subscription | Quota/balance left |
Quota renews | Banked resets | Credits expire**. Compact headings shorten these
without combining their meaning. Eight accounts remain visible at a 75-column
component width and 24-row terminal.

- Renewal belongs to the displayed bottleneck primary quota window, not an earlier
  unrelated window. Missing dates remain unknown; passed timestamps require refresh.
- Banked count is neutral. Only the credit-expiry field receives the existing
  inclusive yellow/`!` <=72h and red/`!!` <=24h urgency (also red for passed dates).
  Zero, unavailable count, partially undated credits and non-Codex applicability
  remain distinct. Consumed credits cannot determine the next expiry.
- Loading, queued, partial and failed-refresh/old-data health appears before the
  subscription label, independently of both dates and the count.
- OpenRouter uses bounded `K` key and `W` wallet USD tokens; `∞` applies only to an
  uncapped key, `?` is unknown and `~` denotes compact rounding. Subscription retains
  full amounts. No monetary balance is presented as a quota renewal.
- Below 60 inner columns, a labelled selected-account panel preserves all five
  fields; arrows select accounts. Insufficient height explicitly requests resize.
- Existing Pi theme tokens retained; no relevant ancestor/package DESIGN.md or
  new palette/design contract. No fetching/auth/provider/store/switch/spend changes.

Code/doc changes are limited to `packages/pi-little-helpers/lib/limits-runway.ts`,
`lib/limits-dashboard.ts` help strings, `tests/limits-expiry.test.mjs`,
`tests/limits-runway.test.mjs` and package README. Existing dirty work, including
ontology artifacts and maintained provider checkout changes, was preserved.

## Review and verification

- Implementation peer: package `npm run check`, **398 passed**, typecheck/lint/
  packaging complete. Parent inspected the log and independently reran all **64**
  focused limits tests. Root `./scripts/ci/smoke.sh` and `git diff --check` passed.
  The package release dry-run encountered the expected already-published 0.9.0
  guard and continued; embedded Pi smoke was explicitly skipped by that gate.
- Independent visible reviewer reported no actionable defect after coherent-source
  review, 64 passing focused tests and 580 read-only boundary probes. Suggested
  nonblocking test improvement: retain a final-render monetary width matrix in
  addition to current helper tests. No runtime change was needed.
- Reinstalled the local helper package, then exercised the actual installed
  `/limits` in Ghostty TUI before and after `/reload`. Both 75-column Overview
  landings showed eight accounts and passed independent per-cell renewal/count/
  expiry assertions derived from live snapshots, not imported presentation helpers.
- Resized the actual nested PTY in each round: **50-column** component showed the
  selected account with all five labelled fields; restored 75-column layout.
  Inspected all eight subscriptions, tabs/back/search/refresh/attention/horizon/help.
- **No model switches**, no inference or reset-credit spending. Metadata-only
  network proof recorded 60 GET requests, all HTTP 200, two Codex credential groups.
  Final proof passed and the full process exited **0**. Runtime source hashes
  matched after exit. Actual live expiry dates were outside warning thresholds;
  exact urgency boundaries and partial/stale fixtures are covered by local tests.

Private evidence: `$TMPDIR/pi-limits-columns-5430/{proof.json,overview-0.txt,
 overview-1.txt,narrow-0.txt,narrow-1.txt,terminal.log,source-before.sha256,
 source-after-check.log,exit-code}`. Package log: `$TMPDIR/pi-limits-5430-package.log`;
parent focused log: `$TMPDIR/pi-limits-columns-5430-parent-focused.log`.

Harness correction: first attempt incorrectly equated PTY width with component
width. PTY75 produced a 70-column overlay (94%), failing the expected full-label/
header assertion. Archived failed exit-1 output under `attempt-1`; corrected to
PTY80/54 for component75/50 and reran successfully without product edits.

AK close-check was advisory-ready with no done contract. No commit, push, merge,
publication or upstream port. This controller still needs `/reload` for its own
activation only; final installed behavior was already verified in a fresh session.
