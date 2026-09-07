---
summary: "AK 5408: searchable all-Codex subscription limits dashboard with explicit switching and cancellable refreshes."
read_when:
  - "Reviewing /limits dashboard UX, account scope, lifecycle or live verification."
---

# All-subscription limits cockpit — AK 5408

## Delivered behavior

The operator wanted the existing active-account report expanded into a searchable account menu. `/limits` now opens all project-allowed Codex subscriptions in a theme-native list/detail dashboard. It marks the active account, supports fuzzy search over labels/provider names/plans/status, shows base headroom and reset counts side by side, and exposes every usage window and credit expiry in scrollable details. Wide rendering is split-pane; narrow rendering navigates between panes.

Explicit keys: `/` search, arrows/j/k navigate, Tab/Enter inspect, PgUp/PgDn scroll, r refresh selected, R refresh all, s switch, a reveal active, o sort by active/headroom/expiry, ? scrollable help, Esc clear/close. Inspection is deliberately separate from switching. Model fallback requires confirmation; switching is blocked during an active turn. `/limits current` preserves the quick report; non-TUI `/limits` prints all allowed accounts.

Ownership remains in `packages/pi-little-helpers`: structured account-bound snapshots in `lib/codex-limits.ts`; read-only registry/config discovery in `lib/codex-accounts.ts`; queue, rendering and interaction in the three `limits-dashboard*` modules; command/lifecycle in `extensions/limits.ts`. All runtime files are in the publish allowlist. This wave did not modify multi-pass, the prior sub-core/sub-bar patch, or the base-provider-only reset spending workflow.

No applicable DESIGN.md exists in the target ancestry. The dashboard uses Pi's existing semantic theme tokens and built-in Input/fuzzy/keybinding/ANSI-width utilities; no palette or design-system contract was invented, and no DESIGN.md lint/export is claimed.

## Safety and review

- Discovery uses registered models (including environment aliases), projects friendly labels without reading credential files, and enforces the exact multi-pass project allowlist. Malformed scope fails closed.
- Both endpoints for an account use one bound model/auth snapshot. Reads never temporarily switch the session. Refreshes run two accounts at a time, coalesce duplicates, preserve partial error distinctions, and do not write quota caches.
- Independent read-only review `scoutpeer-mto9rpmt-ce4d0bd0` identified four gaps: `/limits current` scope bypass; a switch confirmation surviving disposal; an auth wait ignoring cancellation; and r with no search result accidentally refreshing all. All four were patched with reproducing regression tests.
- Closing/reload disposes the queue and ignores late results. Pending authentication waiting is raced against the deadline/abort signal, with the losing promise observed. Host-owned auth already dispatched may still finish. A switch already dispatched through `setModel` is likewise not claimed cancellable.
- Signed-out/unloaded accounts remain visible with guidance. Unknown quota never becomes 100%; extra model-specific limits do not masquerade as base headroom. Error-retained data is marked as a previous snapshot. Credit expiry is explicitly distinct from a quota reset date.

## Verification

- `npm run check` in pi-little-helpers: passed, **358 tests**, package type/lint/structural/publish-contract gates. Same-version release dry-run was handled by the existing package gate; no publication occurred.
- Targeted limits/reset suite: **36 tests passed**, including wrong-account response rejection, configuration restrictions, pending-confirm shutdown, stuck-auth abort, duplicate/bounded refresh, no-result hotkeys, Kitty printable keys, and ANSI/Unicode geometry across widths 18–160.
- Installed non-TUI `/limits`: both real subscriptions returned separate usage/reset details without a model switch.
- Installed full-stack Ghostty TUI: actual keyboard input exercised `/reload`, `/limits`, fuzzy account search, base-account switch, switch back preserving the model, single/all refresh, expiry/detail scrolling, help and close. Probe observed two credential groups in memory, GET-only usage/reset-credit calls, no consume requests, and return to the original subscription. No credential values were written.
- Final live receipt: `passed=true`, `mode=tui`, account switch sequence base → alias, and terminal **exit 0** at 2026-09-05 11:21:16 UTC. The installed command owner was the package's `extensions/limits.ts`.
- The first driver sent keys before host reload completion, so focus was still being restored. Its owned test process was stopped, and its output is not acceptance evidence. The corrected driver waits for completed reload and blocks any unintended editor input/model turn. The successful run's footer had context 0.

Ephemeral live receipts, terminal capture and screenshots are under `$TMPDIR/pi-limits-dashboard-5408/`; the unsuccessful early-input run is retained separately under `$TMPDIR/pi-limits-dashboard-5408-early-input/`. Screenshots are recorded, not claimed pixel-reviewed. Full package log: `$TMPDIR/pi-limits-dashboard-check.log`.

## Activation

Reinstalled the local pi-little-helpers package with `pi install`, then verified it in the full installed stack after reload. The already-open controller still requires its own `/reload`. No upstream release, publication, push or merge was performed.
