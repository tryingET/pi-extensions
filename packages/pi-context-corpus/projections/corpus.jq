# ---
# summary: "Named jq projections over corpus/index.json (and strata.json for topfiles). jq is the DSL."
# read_when:
#   - "Changing a projection's emitted shape or the --arg p dispatch convention."
# ---
# Usage (one line, pinned convention):
#   jq -f projections/corpus.jq --arg p spend corpus/index.json
#   jq -f projections/corpus.jq --arg p topfiles <corpusDir>/<session>/strata.json
#
# index.json projections take corpus/index.json as input; `topfiles` takes one
# strata.json. Unknown names fail closed with the available listing.
#
# Fact projections include only sessions whose facts the corpus could derive
# (replayStatus "ok" or "empty"); "failed" and "unsupported" (schema major newer
# than supported) are excluded from facts but stay visible in the inventory
# projection `sessions` — listed, never dropped.

def projection_names:
  ["occupancy", "faults", "spend", "ghosts", "runway", "sessions", "topfiles", "compaction"];

def facts: map(select(.replayStatus == "ok" or .replayStatus == "empty"));

# per-session last occupancy + context window
def occupancy:
  .sessions
  | facts
  | map({id, lastResidentEst, contextWindow});

# sessions with faults: count + last fault request
def faults:
  .sessions
  | map(select((.faults // 0) > 0))
  | map({id, faults, lastFaultR});

# per-session on-chain $ (sum-of-reported) + measured cache-hit share
def spend:
  .sessions
  | facts
  | map({id, onChainCostUsd, cacheHitShare});

# sessions ranked by mined-dead share of pathed tool token-turns
def ghosts:
  .sessions
  | facts
  | sort_by(.ghostShareOfToolTokenTurns)
  | reverse
  | map({id, ghostShareOfToolTokenTurns});

# sessions ranked by requests-until-fault (nulls excluded)
def runway:
  .sessions
  | facts
  | map(select(.runwayRequestsRemaining != null))
  | sort_by(.runwayRequestsRemaining)
  | map({id, runwayRequestsRemaining, lastResidentEst, contextWindow});

# compact per-session overview
def sessions:
  .sessions
  | map({id, replayStatus, requests, turns, onChainCostUsd});

# top path-qualified allocations by token-turns (input: one strata.json)
def topfiles:
  .items
  | map(select(.p != null))
  | sort_by(.tt)
  | reverse
  | .[0:10]
  | map({path: .p, cat: .c, label: .l, tokens: .t, birthR: .b, freedR: .f, tokenTurns: .tt, dead: (.d == 1)});

# P3 compaction tradeoff summary (input: one strata.json; carries its licensing bound)
def compaction:
  .meta.compactionTradeoff // null
  | if . == null then
      error("strata.json carries no compactionTradeoff (replay with a current pi-context-overlay)")
    else
      {available, reason, breakEvenRequests, horizonRequests, verdict,
       freedTokensPerRequest, continueCostPerRequestUsd, compactPenaltyOnceUsd, savedPerRequestUsd,
       warmEstimateDegraded, warmthBound}
    end;

if $p == "occupancy" then occupancy
elif $p == "faults" then faults
elif $p == "spend" then spend
elif $p == "ghosts" then ghosts
elif $p == "runway" then runway
elif $p == "sessions" then sessions
elif $p == "topfiles" then topfiles
elif $p == "compaction" then compaction
else
  error("unknown projection '" + $p + "'; available: " + (projection_names | join(", ")))
end
