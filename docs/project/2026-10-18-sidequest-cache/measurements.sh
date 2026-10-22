#!/usr/bin/env bash
# REDACTED historical derivative (AK7403), not byte-identical original evidence.
# Historical offline template requiring private originals; not a runnable public proof.
# No current implementation/adoption or live verification. See README.md.
# Metadata output remains PRIVATE until separately redacted; no raw prompts emitted.
# Emits a JSON stream. Pipe through jq -s . for a measurements.json-style array.
# Access to originals requires separate admission; this template was NOT executed.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
: "${PARENT_SESSION_FILE:?Supply admitted private parent JSONL}"
: "${HTML_CHILD_SESSION_FILE:?Supply admitted private HTML child JSONL}"
: "${CAD_CONTROL_SESSION_FILE:?Supply admitted private CAD control JSONL}"
: "${WINDOW_START:?Supply original UTC lower bound, exclusive}"
: "${WINDOW_END:?Supply original UTC upper bound, exclusive}"
for f in "$PARENT_SESSION_FILE" "$HTML_CHILD_SESSION_FILE" "$CAD_CONTROL_SESSION_FILE"; do
 [[ -f "$f" ]] || exit 1
 node "$ROOT/packages/pi-session-insights/bin/pi-session-insights.mjs" "$f" | jq '{kind:"owner_extractor",session_id,session_role,session_role_basis,session_header_cwd,uncertainties}'
 jq -s --arg start "$WINDOW_START" --arg end "$WINDOW_END" '
 def usage: {entryId:.id,timestamp,provider:.message.provider,model:.message.model,api:.message.api,input:.message.usage.input,cacheRead:.message.usage.cacheRead,cacheWrite:.message.usage.cacheWrite,output:.message.usage.output,estimatedCost:.message.usage.cost.total} | . + {prompt:(.input+.cacheRead+.cacheWrite)} | . + {cacheReadPercent:(if .prompt>0 then 100*.cacheRead/.prompt else null end)};
 .[0] as $h | [.[]|select(.type=="message" and .message.role=="assistant" and .timestamp>$h.timestamp)|usage] as $new |
 {kind:"bounded_usage_projection",header:$h,compactions:[.[]|select(.type=="compaction")|{id,timestamp,firstKeptEntryId,tokensBefore}],newResponseCount:($new|length),newResponseEstimatedCost:([$new[].estimatedCost]|add),newResponsePromptTokens:([$new[].prompt]|add),newResponseCacheReadTokens:([$new[].cacheRead]|add),firstNewResponses:$new[0:8],parentWindow:($new|map(select(.timestamp>$start and .timestamp<$end)))}' "$f"
done
