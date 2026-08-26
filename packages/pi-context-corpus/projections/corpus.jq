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

def projection_names:
  ["occupancy", "faults", "spend", "ghosts", "runway", "sessions", "topfiles"];

# per-session last occupancy + context window
def occupancy:
  .sessions
  | map(select(.replayStatus != "failed"))
  | map({id, lastResidentEst, contextWindow});

# sessions with faults: count + last fault request
def faults:
  .sessions
  | map(select((.faults // 0) > 0))
  | map({id, faults, lastFaultR});

# per-session on-chain $ (sum-of-reported) + measured cache-hit share
def spend:
  .sessions
  | map(select(.replayStatus != "failed"))
  | map({id, onChainCostUsd, cacheHitShare});

# sessions ranked by mined-dead share of pathed tool token-turns
def ghosts:
  .sessions
  | map(select(.replayStatus != "failed"))
  | sort_by(.ghostShareOfToolTokenTurns)
  | reverse
  | map({id, ghostShareOfToolTokenTurns});

# sessions ranked by requests-until-fault (nulls excluded)
def runway:
  .sessions
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

if $p == "occupancy" then occupancy
elif $p == "faults" then faults
elif $p == "spend" then spend
elif $p == "ghosts" then ghosts
elif $p == "runway" then runway
elif $p == "sessions" then sessions
elif $p == "topfiles" then topfiles
else
  error("unknown projection '" + $p + "'; available: " + (projection_names | join(", ")))
end
