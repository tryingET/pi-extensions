---
summary: "AK5491: capability-aware subscription reset commands, provider evidence, and safe native recovery."
read_when:
  - "Reviewing the /resets implementation or z.ai/Grok banked-reset evidence boundary."
system4d:
  container: "pi-little-helpers subscription reset UX and native Codex adapter."
  compass: "Never equate missing support or quota renewal with a reset inventory."
  engine: "Research -> capability routing -> review -> package and live verification."
  fog: "Provider credit semantics and alias identities differ; global checkout contains unrelated work."
---

# Subscription reset capabilities — AK5491

Operator requested a general reset interface in pi-little-helpers, integrated with /limits,
and shipping the feature. The owner boundary is unchanged: Pi helper commands/UI here,
provider-specific sub-core adapters and credentials there. No z.ai/xAI API contract for
banked inventory, expiry or redemption was verified; see the source-linked
[provider research and contract](../packages/pi-little-helpers/docs/project/subscription-resets.md).

## Implementation

- `/resets [status|use|manage]`, default **status**, routes by exact-provider capability.
- Codex native actions share the existing compatibility handler, in-flight lock, persisted
  recovery state and request IDs. The previously local account-bound/multi-pass Codex
  implementation and its tests were included as a prerequisite rather than reviving the
  older unbound upstream reset handler.
- z.ai/Grok show unverified inventory and verified external management guidance. Only an
  explicit, confirmed manage command opens the static provider URL; headless prints only.
  Unsupported aliases never borrow base-account credit data or links.
- `/limits` bank/expiry cells distinguish native zero/count, unavailable native inventory,
  unverified provider inventory and unsupported integration. Details/help explain `/resets`.
- Error-only quota responses no longer say `old`; that marker requires actual retained data.
- Review found and fixed a same-account/different-provider-alias double-spend risk: unresolved
  requests on another alias of the same account now block a new spend until the original
  alias is restored. Tests cover both command names and session recovery.

## Verification

- Clean worktree based on `origin/main` at `f50a6eee974c0b319ef621ef10dc2a48e3bd7f63`.
  Original dirty checkout and its branch were preserved; only this feature's bounded
  edits were projected back for local activation, retaining unrelated local differences.
- Clean package `npm run check`: **430/430 passed**, typecheck/lint/structure/packaging passed.
  Package dry-run respected the already-published-version guard; no npm publication.
- Canonical dirty checkout package `npm run check`: **443/443 passed**, same gate passed.
- Root `scripts/ci/smoke.sh`: passed.
- Independent read-only review: original same-account-alias blocker resolved; follow-up
  focused tests and diff checks passed, no remaining scoped blocker.
- Real Ghostty TUI, no model turn: `/resets status`, cancelled `/resets manage`, and `/limits`
  unknown z.ai/Grok bank cells passed before and after `/reload`. Source-owned command paths
  correlated to this worktree. TUI exited 0. No management action or redemption performed.
- Reinstalled canonical local package using `pi install`; fresh normal installed Pi print
  session `/resets status` returned the z.ai unknown-inventory guidance successfully.
- No real reset credits consumed. Redemption is tested with mocked requests, real host
  persistence checks, and ambiguity/recovery regressions, not real spending.

Local artifacts: `$TMPDIR/pi-resets-5491/` (resolved for this run under
`/home/tryinget/.local/state/pi-quests/tmp/`): `check-final.log`, `canonical-check.log`,
`root-smoke.log`, `live-proof.json`, `tui-terminal.log`, and `pre-push.log`.

## Shipping boundary

Full root `npm run quality:pre-push` is currently blocked at local-package-link preflight
in the clean worktree: unrelated monorepo package dependencies are not installed there.
The scoped package gate and root smoke do **not** substitute for this full gate.
No gate bypass, unrelated dependency/source migration, npm publication or remote push
is claimed here. Retain the isolated commit/worktree for completing the declared shipping
preflight. AK5491 remains open for shipping; implementation/live evidence is not push proof.
