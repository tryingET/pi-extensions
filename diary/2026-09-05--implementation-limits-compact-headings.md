---
summary: "AK5431: narrower Left and consistent Banked/Expires headings, verified in installed TUI."
read_when:
  - "Reviewing the compact /limits column follow-up to AK5430."
---

# Compact limits headings — AK5431

Operator requested a smaller Left column and only Banked / Expires for the last
two headings. Updated the Overview renderer and README: Left is 15 characters
at the default 71-inner-column table width and capped at 18 on wide tables;
it no longer stretches into unused space. Last headings are BANKED and EXPIRES
at every table width. Existing labelled narrow panel and date semantics unchanged.

Updated literal coordinate regressions and added final-render monetary checks at
60/71/120 inner columns, including unknown, zero and large balances, so compact
key/wallet tokens remain identifiable after rendering, not only in helper output.
No provider, fetching, authentication, account or credit-spending changes.

Verification:
- `npm run check`: 399 tests passed, typecheck/lint/packaging passed. Package gate
  skips embedded Pi smoke; expected already-published-version guard in publish
  dry-run was handled by the declared wrapper. No publication occurred.
- Root `./scripts/ci/smoke.sh` and `git diff --check` passed.
- Local helper reinstalled. Actual installed Ghostty TUI before and after reload:
  all eight accounts visible; Left measured 15 characters; short headings and
  separate renewal/count/expiry cells verified. Real resize to 50-column component
  preserved all five fields in both rounds. Navigation/refresh exercised with zero
  model switches. Proof passed; full process exited 0; runtime hashes unchanged.
- Evidence: `$TMPDIR/pi-limits-5431-package.log`,
  `$TMPDIR/pi-limits-columns-5431/{proof.json,overview-0.txt,overview-1.txt,
  terminal.log,exit-code,source-before.sha256,source-after-check.log}`.

Existing dirty work preserved. No commit/push/merge. Current controller needs
`/reload` for activation only; installed verification was performed separately.
