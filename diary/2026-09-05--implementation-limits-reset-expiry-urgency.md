---
summary: "AK5423: banked-reset count/expiry in Overview, inclusive 72h/24h urgency, and installed TUI proof."
read_when:
  - "Reviewing banked-reset expiry warnings or Overview refresh health."
---

# Limits banked-reset expiry urgency — AK5423

Operator requested banked-reset counts and expiry visibility directly in Overview,
yellow three days before expiry and red one day before expiry.

## Implemented

- Codex Overview rows show the reported banked count and earliest eligible reported
  credit expiry, separately from percentage quota. `↺3 next 6d` is a count plus the
  next reported expiry, not a claim all three expire together.
- Inclusive thresholds: `warning` / yellow / `!` at <=72 hours; `error` / red / `!!`
  at <=24 hours. Passed timestamps stay red and explicitly say `past`; refresh is
  required before inferring current availability.
- Unknown dates stay marked `?`; consumed/nonavailable credits do not select the
  expiry. Zero banked credits and unavailable credit data remain different states.
- Narrow layouts prioritize banked count/expiry. Full account labels and individual
  dates remain available in Subscription. Horizon and Subscription use the same
  urgency classifier. The attention filter includes expiring credits.
- Loading (`↻`), queued (`…`), partial (`~`) and failed-refresh previous data (`old`)
  remain visible alongside expiry, including in narrow rows.
- No fetch/auth/switch/spending/core contract changes, no dependency change, no
  source commit/push/publication. Existing dirty work preserved.

## Review and verification

Independent scout review found the initial banked cell hid refresh health and
narrow stale markers. Fixed with independent health prefixes and ready/loading/
queued/partial/error regressions at both widths. An initial clean ASC reviewer
launch failed before bootstrap because its provider alias extension was missing;
confirmed no effects, replaced by the visible scout rather than modifying ASC.

- Final package `npm run check`: **395 tests**, typecheck/lint/packaging passed.
  Declared release dry-run encountered existing-version guard, no publication.
  Log: `$TMPDIR/pi-limits-expiry-5423-package.log`.
- Focused limits tests: **61 passed**. Coverage includes exact 72h/24h boundaries,
  unknown/consumed/expired/partial dates, callback-safe attention filtering, normal
  and narrow visibility, consistent colors in all three views and refresh health.
- Reinstalled `packages/pi-little-helpers` from its local path.
- Real installed Ghostty `/limits` proof: all eight subscriptions visible, both
  Codex banked counts and expiry text visible on Overview, before and after reload;
  navigation, refresh, explicit guarded switching, attention/horizon/help exercised.
  Metadata-only proof recorded two Codex credential groups and 62 allowed requests.
  Full process exited **0**. Actual width: 75 columns.
- Proof artifacts: `$TMPDIR/pi-limits-expiry-5423/{proof.json,overview-0.txt,
  overview-1.txt,terminal.log,source-before.sha256}`. Screens/terminal output remain
  private under mode-700 scratch. Threshold colors use synthetic boundary tests;
  current live account expiries were outside the warning window.

Current controller needs `/reload` for activation only; fresh-session testing is
already complete. No operator verification handoff is required.
