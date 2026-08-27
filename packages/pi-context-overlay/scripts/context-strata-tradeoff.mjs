// ---
// summary: "Pure P3 compaction tradeoff calculator: fault-now vs continue from the session's own measured data (no global price table)."
// read_when:
//   - "Changing the compaction tradeoff model, its price inputs, or the break-even arithmetic."
// ---
// Epistemic classes (RFC §2 ledger; wire-order licensing per
// docs/project/2026-08-26-wire-order-drift-bound.md):
// - measured: warm/cold prices (session-reported $ / tokens), last-request warm tokens,
//   observed post-fault resident size.
// - derived: freed tokens per request, break-even requests, verdict against runway horizon.
// - estimated: continue-cost per request (est-token area priced at measured warm rate).
// cacheWrite pricing is NOT modeled (multi-provider semantics open, RFC §9).
// All $ are sum-of-reported from this session only.

const roundUp = (x) => (Number.isFinite(x) && x > 0 ? Math.ceil(x) : null);

/**
 * Compute the fault-now vs continue tradeoff.
 * Inputs are the assembled strata pieces; output is additive IR data (meta.compactionTradeoff).
 */
export function compactionTradeoff({ requests, faults, runway, totals, warmthAgreement }) {
  const n = requests.length;
  const bound = {
    mae: warmthAgreement?.mae ?? null,
    p95: warmthAgreement?.p95 ?? null,
    max: warmthAgreement?.max ?? null,
  };

  const unavailable = (reason, extra = {}) => ({
    available: false,
    reason,
    warmthBound: bound,
    ...extra,
  });

  if (n === 0) return unavailable("no measured requests");
  const last = requests[n - 1];
  const billed = last.input + last.cacheRead;

  if (
    !(totals.cacheReadTokens > 0) ||
    !(totals.inputTokens > 0) ||
    !(totals.costCacheRead > 0) ||
    !(totals.costInput > 0)
  ) {
    // tokens without reported $ (some routers) would price warm/cold at 0 and fabricate a
    // "pays immediately" verdict — fail closed instead
    return unavailable("no measured warm/cold price pair (tokens or $ unreported)", {
      residentLast: last.residentEst,
    });
  }
  const warmPricePerToken = totals.costCacheRead / totals.cacheReadTokens; // $/tok measured
  const coldPricePerToken = totals.costInput / totals.inputTokens; // $/tok measured

  // Tail flag (licensing): if the last request is a warmth discontinuity (Δ > 0.5), the
  // next-request warmth inference is degraded and must be flagged, not hidden.
  const lastDelta =
    billed > 0 && last.residentEst > 0
      ? Math.abs(last.cacheRead / billed - last.warmModelTokens / last.residentEst)
      : null;
  const warmEstimateDegraded = lastDelta !== null && lastDelta > 0.5;

  const lastFaultR = faults.length ? faults[faults.length - 1].r : null;
  const postFaultResident =
    lastFaultR !== null && lastFaultR + 1 < n ? requests[lastFaultR + 1].residentEst : null;
  const base = {
    warmPricePerToken,
    coldPricePerToken,
    residentLast: last.residentEst,
    warmTokensLast: last.cacheRead,
    lastFaultR,
    observedPostFaultResident: postFaultResident,
    lastWarmthDelta: lastDelta,
    warmEstimateDegraded,
    warmthBound: bound,
    notes: "sum-of-reported $; cacheWrite pricing not modeled",
  };

  if (postFaultResident === null) {
    return unavailable("no observed post-fault request to size the summary", base);
  }
  if (!(postFaultResident > 0)) {
    return unavailable("observed post-fault resident is not positive", base);
  }
  const freedTokensPerRequest = last.residentEst - postFaultResident;
  if (freedTokensPerRequest <= 0) {
    return unavailable("post-fault size >= current resident (nothing to free)", {
      ...base,
      freedTokensPerRequest,
    });
  }

  // Continue: the whole window keeps billing warm each request (area continuation).
  const continueCostPerRequestUsd = last.residentEst * warmPricePerToken;
  // Compact now: summary+bedrock re-billed once at cold instead of warm (one-time penalty)…
  const compactPenaltyOnceUsd = postFaultResident * (coldPricePerToken - warmPricePerToken);
  // …and the freed tokens stop billing warm every request after that (per-request saving).
  const savedPerRequestUsd = freedTokensPerRequest * warmPricePerToken;
  const breakEvenRequests = roundUp(compactPenaltyOnceUsd / savedPerRequestUsd);
  const horizonRequests = runway?.requestsRemaining ?? null;

  return {
    available: true,
    ...base,
    freedTokensPerRequest,
    continueCostPerRequestUsd,
    compactPenaltyOnceUsd,
    savedPerRequestUsd,
    breakEvenRequests,
    horizonRequests,
    verdict:
      breakEvenRequests === null
        ? "no break-even (penalty <= 0): compaction pays immediately"
        : horizonRequests === null
          ? `break-even at ${breakEvenRequests} more requests; horizon unknown (no measurable burn)`
          : horizonRequests > breakEvenRequests
            ? `compaction pays: horizon ${horizonRequests} > break-even ${breakEvenRequests}`
            : `continue: horizon ${horizonRequests} <= break-even ${breakEvenRequests}`,
  };
}
