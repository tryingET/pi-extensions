---
summary: "AK 5406: account-bound /limits plus selected-subscription subbar fix in the upstream-owned pi-sub checkout."
read_when:
  - "Reviewing the active Codex subscription quota fix or local pi-sub activation."
---

# Active Codex subscription limits — AK 5406

## Implementation ownership

- `packages/pi-little-helpers/extensions/limits.ts` registers read-only `/limits`.
- `packages/pi-little-helpers/lib/codex-limits.ts` snapshots the selected model before resolving authentication once for both usage and reset-credit GETs. Reports returned windows, UTC reset dates, banked-reset count and expiry dates; partial failures stay explicit. No consume endpoint, account switch, credential write, or quota-cache write.
- Shared reset-header helper has an explicit alias opt-in; the existing `/codex-reset` spend path and base-provider restriction are unchanged.
- Actual subbar defect is owned by `softwareco/contrib/pi-sub`, not multi-pass. Its base-only credential loader and provider-keyed shared cache ignored the selected alias. Fix is on local branch `fix/active-codex-subscription`, based on upstream `65deb56`.
- That checkout adds active Codex model-registry auth, a session-local credential-scoped cache, account labels, stale-response invalidation, and shared-cache isolation. The widget clears on model changes; pinned Codex follows the selected Codex account.
- No multi-pass implementation changes or edits to npm-installed source files were needed.

## Verification

- Little-helpers `npm run check`: passed, 340 tests, type/lint/structural/package gates. Existing release dry-run same-version guard was handled by its declared gate; no package was published.
- Pi-sub `npm run check`: passed for all workspaces. `npm test`: 131 passed (64 bar, 46 core, 21 status).
- Pi-sub `npm run lint`: 57 errors. A separate `git archive HEAD` baseline run also reports 57 errors; this is an unchanged upstream baseline, not a passing lint claim.
- Root `scripts/ci/smoke.sh`: passed. Both repo diffs passed `git diff --check`.
- Real Ghostty TUI: loaded actual multi-pass, sub-core, sub-bar and limits; exercised `/reload`, switched between base and numeric-alias accounts, observed different real usage windows and reset counts, and invoked `/limits` without spending a reset.
- Repeated that proof using the **installed full extension stack**, not only explicit test extension paths. Probe receipt reports `mode=tui`, `reloaded=true`, `status=passed`, and the exact local `/limits` command owner. Terminal output confirms the actual widget and command rendering. A separate installed `pi -p --no-session ... '/limits'` invocation passed.
- Ephemeral, account-detail-bearing proof files remain outside git at `$TMPDIR/pi-limits-live-5406/`; package logs are `$TMPDIR/pi-limits-package-check-final.log` and `$TMPDIR/pi-sub-tests-final.log`.

## Activation / delivery boundary

Post-close acceptance correction, AK **5407**: the first full-stack probe wrote its successful account observations before the process finished. Its later exit was **1**, exposing an old sub-core refresh timer touching a stale Pi context after reload. AK 5406's completion result was therefore premature for whole-process acceptance. The corrective slice unsubscribes core bus listeners on shutdown, guards disposed instances, and cancels deferred watcher startup; its regression asserts no old listeners or context access remain. After reinstall, the installed full-stack TUI proof was repeated and observed through termination: account/command proof passed and `COMMAND_EXIT_CODE="0"` at 2026-09-05 09:00:30 UTC. The initial failed terminal log remains separately named `terminal-installed-before-lifecycle-fix.log`; the final log is `terminal-installed.log`. This correction supersedes any earlier whole-process success inference.

Installed local `contrib/pi-sub/packages/sub-core`, `contrib/pi-sub/packages/sub-bar`, and `packages/pi-little-helpers` with `pi install`. Removed the superseded `npm:@marckrenn/pi-sub-bar` entry through `pi remove`; local workspace dependencies supply the patched core. Multi-pass installation is unchanged. Local-path packages do not move on npm package updates.

The controller session still needs its own `/reload` to replace already-loaded extension instances. Fresh-session and reload behavior were verified independently. No upstream push, PR, release, publication, or merge was performed.
