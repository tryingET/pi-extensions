---
summary: "P3 slice evidence: compaction tradeoff calculator (fault now vs continue) shipped forensic-side under wire-order licensing; arithmetic independently verified; one honesty bug caught by dogfooding."
read_when:
  - "Reviewing or extending meta.compactionTradeoff or scripts/context-strata-tradeoff.mjs."
  - "Authoring the AGENTS-edit re-cold warning or any future P3 instrument."
system4d:
  container: "P3 decision-support slice for the forensic replayer; first positional-licensed instrument."
  compass: "Prices and sizes come from the session's own measured data; no global price table; unmeasured $ fails closed."
  engine: "measured prices/sizes -> break-even vs runway horizon -> verdict, bound attached, tail flagged."
  fog: "Zero-dollar sessions fabricating verdicts; a mean-bound licensing a positional claim."
---

# P3 compaction tradeoff calculator — 2026-08-26

First P3 instrument, licensed under `2026-08-26-wire-order-drift-bound.md` (this file's
existence is itself gated: `tests/rfc-freshness.test.mjs` would fail it without the
wire-order note).

## Model (pure: `scripts/context-strata-tradeoff.mjs`)

Fault-now vs continue, from the session's own measured data only:

- `warmPricePerToken = costCacheRead / cacheReadTokens`, `coldPricePerToken =
  costInput / inputTokens` — **measured** (sum-of-reported; no global price table).
- `observedPostFaultResident = requests[lastFaultR+1].residentEst` — **measured** summary
  size, from the session's own last fault. No fault/no post-fault request → unavailable.
- `freedTokensPerRequest = residentLast − observedPostFaultResident`.
- `continueCostPerRequestUsd = residentLast × warmPrice` (**estimated**: est-token area at
  measured rate).
- `compactPenaltyOnceUsd = observedPostFaultResident × (coldPrice − warmPrice)` (one-time
  re-cold of summary+bedrock).
- `savedPerRequestUsd = freedTokensPerRequest × warmPrice`; `breakEvenRequests =
  ceil(penalty / saving)`; verdict vs `runway.requestsRemaining` (horizon may be null).
- **Licensing**: output carries `warmthBound` (mae/p95/max verbatim) and
  `warmEstimateDegraded` when the last request sits in the discontinuity tail (Δ > 0.5).
- cacheWrite pricing **not** modeled (multi-provider semantics open, RFC §9). Emitted as
  additive `meta.compactionTradeoff` (IR v1).

## Verification

- **Unit pins, hand-computed** (22 model tests, +4): warm $0.0001/tok, cold $0.003/tok,
  resident 6,000, post-fault 1,000 → continue $0.60/req, penalty $2.90, saving $0.50/req,
  break-even 6, verdict "pays" at horizon 50 — exact. Unavailable paths (no fault, fault at
  end, nothing to free, no price pair) fail closed with reasons and no invented numbers.
- **Dogfood (real sessions, mid-session faults):**
  - `multi` (1416 requests, 7 faults, glm-5.3/gpt-5.6-sol/grok-4.6/kimi-k3/ox-alpha):
    warm $6.274e-7/tok, cold $4.249e-6/tok (**ratio 6.77×** — the ~0.1× tier is a
    provider-family property, not universal), residentLast 342,442, post-fault (r=901)
    6,531 → freed 335,911/req; continue $0.2148/req vs penalty $0.0237 once, saving
    $0.2107/req → break-even 1, horizon 0 → "continue: horizon 0 ≤ break-even 1".
    **Arithmetic independently recomputed from `strata.json` via jq: all 10 values
    identical.** Corpus projection `compaction` verified on the same artifact.
  - `glm52` (232 requests, fault @166): router reports no `$` →
    `available: false, "no measured warm/cold price pair (tokens or $ unreported)"`.
- **Honesty bug caught by dogfooding**: the first cut guarded tokens but not dollars;
  glm52's $0 totals priced warm/cold at 0 and fabricated "compaction pays immediately".
  Fixed fail-closed and pinned by a regression test.

## Interpretation guidance (what the verdict does and does not say)

The verdict prices *cache economics only*, from a horizon (`requestsRemaining`) that is
itself derived and can be null. A "continue" at horizon 0 means the one-time penalty is
never amortized under the model — it is not advice about context quality, tool deadness,
or attention. Cross-check `ghostShareOfToolTokenTurns` (P4 signal) before acting.

## Deferred

- AGENTS-edit re-cold warning ("this edit re-colds N tokens ≈ $X"): needs a live
  `cacheRead`-bearing host surface; live `/c` cannot estimate $ without fabricating
  warmth. Deferred, not designed around.
- cacheWrite pricing; multi-provider cost semantics (RFC §9 open).
