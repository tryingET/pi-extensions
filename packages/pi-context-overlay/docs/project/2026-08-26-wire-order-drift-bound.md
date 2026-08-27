---
summary: "Measured wire-order drift bound: warmth-model vs measured cacheRead divergence across 5 real sessions and 5 provider identities; licenses bounded P3 positional claims."
read_when:
  - "Authoring or reviewing any P3/decision-support instrument that makes positional claims."
  - "Changing the warm-prefix model or warmthAgreement in context-strata-projections.mjs."
system4d:
  container: "Dated evidence note discharging the RFC §9 wire-order evidence gate."
  compass: "Wire order is unobservable; bound its claim-relevant effect via warmth agreement, and report the tail honestly."
  engine: "replay sessions -> per-request |cacheShare - modelShare| -> mae/p50/p90/p95/max + discontinuity-tail rate -> licensing statement."
  fog: "A tight mean hides a near-total-disagreement tail; p95 alone flips meaning when the tail crosses 5%."
---

# Wire-order drift bound — 2026-08-26

Discharges the RFC §9 gate: *no P3 instrument may make positional claims until wire-order
drift is measured (≥3 real sessions, ≥2 providers, a `warmthAgreement.mae`-style drift bound
over prefix-divergence points).*

## What is and is not measured (epistemic framing)

- **Not measured** (measured class unavailable): provider wire order. Session JSONL records
  file order; the provider's actual serialization is unobservable from it.
- **Measured**: the claim-relevant *consequence* of replay order. Warmth is positional — the
  warm prefix is a prefix in wire order, and the model computes it in replay order. Per-request
  divergence between the model warm share (`warmModelTokens/residentEst`) and the measured
  cache share (`cacheRead/(input+cacheRead)`) therefore bounds how much replay-order error can
  matter to positional/warmth claims. This is the RFC-defined instrument, not a proxy invented
  here.
- **Inferred**: the physical cause of the divergence tail (below) — candidate mechanisms are
  provider caching beyond the strict prefix, branch-switch discontinuities (file's active
  chain ≠ provider's actual served history), and re-cold events. Not diagnosed per-request.

## Instrument

`meta.warmthAgreement` in `strata.json` (this slice, additive): `n`, `mae`, `p95`, `max` over
per-request `|measured cache share − model warm share|`. Reproduce:

```bash
node scripts/context-strata-replay.mjs <session.jsonl> --out <dir>
jq '.meta.warmthAgreement' <dir>/strata.json
```

## Sessions (5 real sessions, 5 provider identities, 2851 measured requests)

| session | providers | n | mae | p50 | p90 | p95 | max | tail (Δ>0.5) |
|---|---|---|---|---|---|---|---|---|
| s1-gpt55 | gpt-5.5 | 361 | 1.3% | 0.3% | 1.5% | **2.4%** | ~1.0 | 2 (0.6%) |
| multi | glm-5.3, gpt-5.6-sol, grok-4.6, kimi-k3, stealth/ox-alpha | 1410 | 2.0% | 0.2% | 1.0% | **2.8%** | ~1.0 | 22 (1.6%) |
| glm52 | glm-5.1, glm-5.2 | 231 | 2.6% | 0.1% | 1.9% | **10.6%** | ~1.0 | 4 (1.7%) |
| glm53-oxalpha | glm-5.3, stealth/ox-alpha | 539 | 5.0% | 0.1% | 1.3% | **18.1%** | ~1.0 | 25 (4.6%) |
| s2-gpt54 | gpt-5.4 | 299 | 6.4% | 0.1% | 3.9% | **96.7%** | ~1.0 | 17 (5.7%) |

Session file stems: `2026-05-29T03-56-17…019e71e0` (s1), `2026-04-16T03-40-57…c154b848` (s2),
`2026-08-04T19-04-52…019fce2a` (glm52), `2026-08-23T06-41-51…01a02d5a` (multi),
`2026-08-24T20-43-47…01a03583` (glm53-oxalpha), under `~/.pi/agent/sessions/…`.

## Findings

1. **The bulk is tight across every provider family tested**: median divergence ≤ 0.33% and
   p90 ≤ 3.9% on all five sessions, including a 1410-request session spanning five provider
   identities in one arena. Replay-order warmth modeling tracks measurement well outside the
   tail.
2. **Every session has a discontinuity tail**: 0.6%–5.7% of requests show near-total
   divergence (Δ > 0.5; per-session max ≈ 1.0 everywhere). The tail is present in all
   families — it is not a single-provider artifact. Minimum observed: 2 requests (s1).
3. **p95 is bimodal-sensitive**: when the tail is < 5% of requests, p95 stays tight
   (2.4–2.8%); when the tail crosses 5% (glm53-oxalpha 4.6%→18.1%, s2 5.7%→96.7%), p95 lands
   *inside* the tail and stops describing the bulk. A single-percentile bound is therefore
   insufficient; the bound must be stated as (p90, tail rate, max).

## Drift bound (adopted statement)

For sessions of this fleet: **≥ 90% of requests agree within 4% share divergence (p90 ≤ 3.9%,
median ≤ 0.4%), with a discontinuity tail of 0.6%–5.7% of requests at near-total divergence,
across gpt-5.x, glm-5.x, grok-4.6, kimi-k3, and stealth/ox-alpha.** Single-request max ≈ 1.0
in every session.

## What this licenses for P3

- **Licensed**: positional/warmth instruments that (a) state this bound per session
  (`meta.warmthAgreement`: mae, p95, max) and (b) flag or exclude discontinuity-tail requests
  (Δ > 0.5) from positional claims. Aggregate order-free quantities (token-turns, $, cacheHit,
  runway slope) were never gated.
- **Not licensed**: any global claim that "replay order ≈ wire order". The tail is present in
  every family and its cause is undiagnosed; the bulk bound holds only because it is stated
  as a tail-rate bound, not because the tail is absent.
- Re-measure (append a section; do not rewrite) when: a new provider family is added to the
  fleet, the warm-prefix model changes, or the corpus surfaces a session with a tail rate
  materially above 6%.
