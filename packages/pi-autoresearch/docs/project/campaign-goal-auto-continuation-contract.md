---
summary: "Contract for opt-in, session-local campaign-goal auto-continuation follow-up in pi-autoresearch."
read_when:
  - "Changing campaign-goal continuation, longer-campaign resume, or session idle hooks."
  - "Checking the boundary between pi-autoresearch continuation, contrib-style session follow-up, and ASC rewind."
system4d:
  container: "Package-local pi-autoresearch campaign-goal continuity surface."
  compass: "Make long campaign continuation easier without creating hidden authority or a background control plane."
  engine: "Ledger gate -> pure eligibility decision -> visible exact follow-up call -> operator-reviewed foreground execution."
  fog: "The main risk is accidentally turning a convenient follow-up into an unreviewed daemon, peer launcher, ASC rewind, or durable authority mutation."
---

# Campaign-goal auto-continuation contract

`pi-autoresearch` may send a visible `pi.sendUserMessage(..., { deliverAs: "followUp" })` follow-up after `agent_end`, but only as a session-local opt-in convenience. The follow-up asks Pi to run the exact foreground continuation call; it does not install a daemon, spawn peers, or mutate external authority.

## Contrib comparison

The intended behavior is inspired by the old contrib-style convenience pattern: when a session becomes idle, place the next useful foreground action in front of the operator instead of hiding it in a daemon. This package keeps that idea but changes the gate:

- source of continuity: `autoresearch.goal.json` campaign-goal ledger, left `active` only by an explicit `campaignGoalAutoContinue: true` loop/campaign-start policy;
- decision shape: pure helper `buildAutoresearchAutoContinuationDecision(...)`;
- follow-up shape: visible user-message injection containing the exact `autoresearch_runtime_loop({ ... peerMode: "off" })` call;
- scope: current Pi session only, with an in-memory max count;
- execution: automatic next-turn user message through Pi's follow-up queue, not a hidden/background run.

## Eligibility gates

The extension keeps one pending timer per `cwd`, re-checks these gates after a short settled window (`PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS`, default `1500`), and cancels the pending follow-up on a new `agent_start` before incrementing the session count. Auto-continuation is eligible only when all are true:

1. the foreground loop/campaign-start call opted into policy with `campaignGoalAutoContinue: true` and an explicit package-local campaign-goal budget (`campaignGoalIterationBudget`, `campaignGoalWallClockMinutesBudget`, or `campaignGoalTokenBudget`), causing `recordAutoresearchCampaignGoalSegment` to keep/return the campaign-goal ledger to `status: "active"` while budget remains;
2. session opt-in is enabled (`PI_AUTORESEARCH_AUTO_CONTINUE=1`);
3. the session-local count is below `PI_AUTORESEARCH_AUTO_CONTINUE_MAX` (default `1`);
4. the campaign-goal ledger exists and has `status: "active"`;
5. the campaign goal has remaining budget;
6. the ledger exposes a `nextContinuationCall` that preserves `campaignGoalAutoContinue: true`;
7. the runtime is runnable (`ready`);
8. control is not awaiting operator choice and not `stop`, `rebaseline`, or `finalize`.

Without `campaignGoalAutoContinue: true`, normal foreground segments preserve manual behavior and record the goal as `paused`, so the session hook will not continue even when `PI_AUTORESEARCH_AUTO_CONTINUE=1` is set. Stop/block states include `goal_pause`, `budget_limited`, `complete`, operator-paused/non-active goal, blocking runtime control, `stop`, `rebaseline`, `finalize`, max auto-continue count, and missing continuation call.

## Observability contract

`autoresearch_runtime_status` and `autoresearch_runtime_status({ action: "campaign_goal" })` must expose the current auto-continuation decision rather than leaving missing follow-ups implicit. The rendered surfaces report:

- whether the session env gate is enabled (`PI_AUTORESEARCH_AUTO_CONTINUE=1`) or disabled/unset;
- the current session count, max count, and remaining auto-continuations;
- runtime gate state (`machine`, control kind, blocked/completion reason);
- campaign-goal gate state (ledger presence/status, remaining budget, continuation call presence, and `campaignGoalAutoContinue: true` consent);
- whether the follow-up will be sent and the exact blockers when it will not.

This observability is diagnostic only. It does not create a daemon, spawn peers, run the continuation, mutate AK/KES/Oracle, or promote candidates.

## ASC boundary

ASC rewind remains live Pi/session recovery only. Campaign-goal auto-continuation must not call ASC, treat ASC as candidate lifecycle authority, or use ASC to create same-session follow-up. The only output is a visible Pi user-message follow-up carrying a foreground `autoresearch_runtime_loop` call.

## Validation

Focused proof lives in:

- `tests/auto-continuation.test.ts` — pure helper eligibility/blocker tests, env/session decision-format tests, extension `sendUserMessage`/cancellation tests, and actual-loop enabled-vs-disabled proofs;
- `tests/runtime.test.ts` — runtime/campaign-goal status-surface diagnostics for disabled and enabled env/session gates;
- `scripts/dogfood-auto-continuation-contract.mjs` — dogfood script proving actual-loop enabled-vs-disabled behavior, eligible exact-call output, status/campaign-goal observability, and blocked-state refusal.

Run with:

```bash
cd packages/pi-autoresearch
node --import tsx --test tests/auto-continuation.test.ts
node --import tsx scripts/dogfood-auto-continuation-contract.mjs
```
