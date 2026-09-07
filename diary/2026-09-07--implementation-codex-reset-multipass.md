---
summary: "Extended /codex-reset to active numbered Codex subscriptions with account-bound recovery and explicit policy enforcement."
read_when:
  - "Reviewing multi-pass reset spending, account identity checks, or session recovery proof."
type: "implementation"
---

# Codex reset: multi-pass account binding

## Scope and execution

Operator requested extending `/codex-reset` to multi-pass and the active subscription. This was feature work, not a general RefactorOps refactor. Preserved unrelated dirty checkout work, including existing `/limits` additions.

Changed package-owned files under `packages/pi-little-helpers/`:

- `lib/codex-reset.ts`: numbered aliases for reset GET/POST; host-resolved token account identity checked against the operation target before every request, with provider/policy rechecks after asynchronous auth. Existing `/limits` header behavior retained.
- `extensions/codex-reset.ts`: selected subscription label/provider/account in status and confirmation; shared multi-pass `allowedSubs` projection; per-provider version-2 pending identity/request records; whole-session rather than active-branch recovery; legacy unbound requests fail closed; earlier ambiguous outcomes survive definitive retry failures.
- `tests/codex-reset.test.mjs`: adapted command fixtures and status expectations while retaining original scenarios.
- `tests/codex-reset-accounts.test.mjs`: alias/auth, confirmation drift, restrictions, token refresh, uncertain retry, per-provider recovery, legacy entries, cancellation/headless operation, and actual SessionManager persistence/reopening checks.
- `README.md`: support, policy, identity, and recovery boundaries.

No credentials are persisted by this feature. Before POST the matching recovery entry must be readable from the saved session's bounded tail. First-turn unflushed and in-memory sessions therefore cannot spend; use a saved session with an assistant turn first.

## Verified proof

- Baseline: 23 targeted existing reset/limits/account tests passed.
- Final package `npm run check`: exit 0, lint/typecheck/structure/tests/packaging completed; **430/430 tests passed**, 109-file packaging allowlist passed. Local output: `/home/tryinget/.pi/tmp/codex-reset-check.PoPPU5.log`. Release dry-run tolerated the documented already-published-version guard; no release was published.
- Read-only reviewer approved the account-spend boundary after independent targeted tests and actual guarded-host-context lifecycle probes.
- Reinstalled the local package with `pi install /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-little-helpers`.
- Fresh real Pi print session with installed multi-pass and `openai-codex-2`: `/codex-reset status` returned the selected subscription's banked credits.
- Fresh real Pi RPC session with the same provider: confirmed command registration, received subscription/account-labelled `/codex-reset use` confirmation, replied **false**, observed cancellation, then queried status. Session entries contained no reset state and no model turn ran.
- **No real reset credit was consumed.** Actual redemption remains covered by mocked HTTP and real host persistence tests, not a live spend.

## Boundaries / follow-up

- Recovery is session-scoped, not a global or cross-session spending lock. Server idempotency scope/retention is not independently proven. Do not initiate a separate reset while an earlier one is unresolved.
- Account identity comes from the host-resolved token; parsing is not independent cryptographic verification.
- Reviewer noted an existing-style teardown UX issue: stale-context UI reporting/cleanup can reject after lifecycle invalidation. Probes sent zero POSTs during pre-send invalidation and retained pending state after post-send invalidation. Optional UI cleanup hardening was not mixed into this feature.
- Fresh-session activation was verified; an already-running controller still needs `/reload` to load the new handler.
