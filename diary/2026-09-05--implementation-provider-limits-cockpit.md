---
summary: "AK5416: provider-general /limits, selective sub-core reads, installation recovery, and live acceptance evidence."
read_when:
  - "Continuing or reviewing the provider-general /limits cockpit and overview-tab work."
---

# Provider-general limits cockpit — AK5416

Operator requested adoption of the newly supported subscriptions into `/limits`,
then refined the UX to an Overview landing tab showing all subscriptions before
moving into individual details, inspired by `/c` navigation.

## Ownership and scope

- `packages/pi-little-helpers` owns `/limits`, presentation, project filtering,
  guarded explicit switching, and the existing account-bound Codex usage/reset lane.
- The installed maintenance worktree
  `softwareco/contrib/pi-sub-maintained` owns provider adapters and native credential
  resolution. Its additive `sub-core:usage-request:v1` event is the optional seam.
  No machine-specific source imports or duplicate provider fetchers in the consumer.
- This is local integration, not the optional upstream package proposed in PR #68.
  AK5414 remains the upstream proposal/account-contract follow-up. No new PR,
  publication, merge, or commit is claimed by this work.
- Existing dirty Codex work in this repo and the original `contrib/pi-sub` was preserved.

## Selective provider contract

Six exact base Pi identities: Anthropic, GitHub Copilot, z.ai, xAI, OpenCode Go,
OpenRouter. Numbered non-Codex aliases remain visibly unsupported rather than
borrowing base credentials. Project `allowedSubs` is checked before enumeration,
queued requests, current reads, and explicit switches.

Core reads one adapter directly, without shared usage cache, provider/model
selection, status polling, settings writes, or bulk refresh. Requests are GET-only,
redirects prohibited, version/outer and adapter identities checked. Existing
background sub-core behavior remains separate and unchanged. Cancellation composes
caller/runtime signals and a 15-second async deadline. Native credential subprocesses
receive finite requested timeouts, not a hard wall-clock/preemptive guarantee.
Cold requests cannot trigger legacy settings/cache migration.

OpenRouter key allowance and account wallet remain distinct dollar quantities;
no cross-provider percentage is fabricated. Unknown is not zero or unlimited.
Stale contradictory wallet fields are discarded when marked unavailable. Codex
banked resets appear only on Codex accounts. Native adapter fallback credentials
may differ from custom model-specific overrides; base-provider identity is not
proof of arbitrary custom account identity.

## Installation recovery

The operator reported sidequests failing to load `@marckrenn/pi-sub-shared`.
Inspection found the maintained worktree had been moved from the verified local
integration branch to old tag `v1.5.0` / `65deb56` at 15:09:32 local, after the prior
14:55 acceptance. Its workspace dependency links were absent. The actor is unknown;
a coordinating controller confirmed it did not perform that checkout.

Restored the clean worktree to `local/maintained-provider-stack` / `e22370f`, then
materialized its unchanged lockfile with `npm ci --ignore-scripts --offline`.
No dependency upgrade. An offline audit count is not vulnerability clearance.
Fresh normal-installed Pi startup proved correct core/bar/helper command sources
and exited 0. Reinstalled the actual local core/helper paths with `pi install`.
AK5421 tracks identifying/preventing the ref rollback. Original dirty source was
not reset or overwritten.

## Verified before Overview refinement

- Independent core review found and reproduced two defects (cold request migration,
  unbounded native keychain command); both fixed with regression tests. Re-review:
  no remaining blocking finding in the bounded bridge.
- Maintained worktree full `npm run verify` inside credential-free/network-isolated
  Bubblewrap: **296 tests**, typecheck and lint passed. Log:
  `$TMPDIR/pi-sub-scoped-5416-verify.log`.
- Independent consumer review: **49 focused limits tests**, no blocking finding.
  Package full check: **383 tests**, typecheck/lint/packaging passed. Root smoke and
  `git diff --check` passed. The declared release dry-run hit the already-published
  version guard; no real publish occurred.
- Real installed scoped bridge returned successful data from all six providers;
  recorded **seven GETs, HTTP 200**, no active model change. Metadata-only proof:
  `$TMPDIR/pi-limits-general-5416/bridge-proof.json`.
- Two real installed Ghostty TUI/reload runs inspected all six base providers plus
  two Codex accounts, refreshed selected/all, visited horizon/attention/help,
  explicitly switched Codex base → numbered account, and exited **0**. Eight rows
  ready, two distinct Codex credential groups, no inference/reset consumption.
  Proof: `$TMPDIR/pi-limits-general-5416{,-wide}/proof.json` and `terminal.log`.
  The second run matched all recorded source hashes. Despite the requested larger
  Ghostty size, both actual dashboard widths were **75 columns**; do not call that
  wide-screen live proof.
- Headless `/limits` printed all eight identities with separate OpenRouter money
  sections. Explicit setup → `/limits current` verified xAI and OpenRouter and
  restored Codex-2. Logs: `$TMPDIR/pi-limits-headless-5416/`.

Harness corrections: Pi's bootstrap replaces global fetch, so the preload now
wraps that replacement and records only URLs/method/status and credential-group
counts. Prototype hooks crossed separate extension module instances and failed to
attach; that first attempt was stopped, archived as `attempt-1`, and replaced with
an observer around the actual shared `ctx.ui.custom` callback. No product success
was inferred from that failed harness. Private screenshots/frame logs stay under
mode-700 scratch, not public source.

## Final Overview acceptance

The operator refinement is implemented: explicit **Overview / Subscription /
Horizon** tabs, always landing on the compact full-width Overview. All eight
subscriptions fit at 75 columns and 24 terminal rows. Arrows move through rows,
Enter/right inspects, Tab/Shift-Tab cycles views, left returns to Overview. Esc
backs out of details before clearing filters or closing. Navigation never switches;
`s` remains the explicit guarded account action. Separate detail/timeline scroll
positions survive tab changes. `/c` was inspected for interaction guidance only.

- Final package full check: **388 tests**, typecheck/lint/108-file packaging passed.
  Log: `$TMPDIR/pi-limits-overview-5416-package-check-final.log`.
- Parent independently reran **54 focused tests**, all passed. Tests explicitly
  cover the eight-row Overview at 75×24, tab/back navigation, selection stability,
  scrolling, resize bounds and no switching on navigation.
- Reinstalled the local helper package after final UI freeze. Final real Ghostty
  run opened the actual installed command, asserted `view=overview` and **all eight
  labels present in the rendered landing frame**, then inspected every subscription,
  cycled all three views, refreshed, used attention/help, explicitly switched Codex
  base → numbered account, reloaded, and repeated. Both landings passed. Two Codex
  credential groups, only expected switches, 63 recorded allowed requests. Full
  terminal process exited **0** at 17:13:45 local.
- Proof and private rendered frames:
  `$TMPDIR/pi-limits-overview-5416/{proof.json,overview-0.txt,overview-1.txt,terminal.log}`.
  `source-before.sha256` verified unchanged after process exit for all runtime
  modules and the core bridge. Actual observed width remained 75 even after an
  exact-owned-window Niri resize; the nested script PTY did not deliver a wider
  size. Wide layout bounds have unit coverage, not a claimed wide-screen live proof.

The controller session needs `/reload` only to adopt the installed code; testing
was already performed in fresh sessions. No source commit/push/publication or
upstream `/limits` port. AK5421 remains the installation-ref-drift follow-up.

