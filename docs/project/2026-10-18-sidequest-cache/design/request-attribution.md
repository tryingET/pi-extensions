---
summary: "Proposed native transport-attempt observation and privacy-bounded cache attribution contract for AK7208."
read_when:
  - "Reviewing provider observation, cache metrics, or diagnostic storage design."
---

# Design A — request and cache attribution

> **REDACTED historical derivative (AK7403), not byte-identical original evidence.**
> Historical AK7208 proposal only; no current implementation/adoption or live proof.
> Source statements refer to the historical inspection. See [public-copy provenance](../README.md).

Proposal only. No instrumentation or provider call was added.

## Boundary and non-goals

Observe **what this client attempted to send**, after final payload mutations and transport-specific transformation. Never name that server receipt, backend token-prefix identity or cache residency. Do not infer provider-internal routing, eviction, billing or correctness from hashes.

Current installed path (`P` = Pi1.1.0 coding-agent package; `AI=P/node_modules/@earendil-works/pi-ai/dist`):

- `P/dist/core/extensions/runner.js:1066–1093`: ordered `before_provider_request` transform chain.
- `AI/api/openai-codex-responses.js:173–185,247–283`: hook precedes transport selection; SSE JSON serialization/compression/retry afterward.
- Same file`:1146–1161,1172–1205,1226–1232`: cached-WebSocket delta, previous-response reference, envelope and `socket.send`; recovery can send a different frame without repeating the hook.
- Same file`:259–296`: HTTP-response metadata observation, not WebSocket dispatch.
- `P/dist/core/extensions/types.d.ts:679–705`: current hooks have no common attempt ID.

**Proposed native seam:** immutable `transport_dispatch_observed` plus response/terminal observations, generated inside each provider adapter immediately adjacent to its real send operation. The names are design placeholders, not available APIs. Compute redaction/digests in the trusted host/adapter; expose only the bounded record to diagnostic consumers. Do not wrap global fetch/WebSocket or request hooks and call the result authoritative.

## Event lifecycle

```text
logical_request_open
  → attempt_prepared (post-hooks, selected transport and body representation)
  → send_invoked | cancelled_before_send
  → response_started? → usage_observed? → attempt_terminal
  → another explicitly correlated attempt? (existing retry/fallback policy only)
  → logical_request_terminal
```

Distinguish invocation from transport acceptance and server acknowledgment. A crash between prepare and send leaves an uncertain interval; missing terminal is **unknown**, not no-effects. Instrumentation shall not add retries, change retry policy, duplicate sends or mark a model run successful.

For WebSocket, hash the exact serialized `response.create` frame and separately the semantic instruction/tool/input segments represented by it. Record full-vs-delta mode and **presence only** of previous-response reference. Never store the opaque reference. For SSE, hash semantic JSON and, where applicable, compressed bytes separately with encoding metadata. JSON order is not model tokenization order. No token-LCP count unless a matching tokenizer/serialization contract is independently supplied.

## Minimal proposed record (design, not implemented schema)

| Group | Fields / semantics |
|---|---|
| Envelope | schema version; campaign-local logical request handle; attempt ordinal; process-generation handle; monotonic event time plus optional coarse wall time |
| Session attribution | campaign-local session and parent handles; snapshot digest handle; `first_new_child_request` derived from immutable fork boundary; invocation ordinal separate from session ordinal |
| Coverage | adapter identity/version/source digest; observation phase; `final_send_argument`, `pre_transport_only` or `unsupported`; complete/lost-event flags; loaded extension-generation identity available/unknown |
| Route | provider/API/model; effective capability/config digest excluding secrets; campaign HMAC of verified account routing identity or `unknown`; endpoint origin classification without query/userinfo; transport and retry/fallback reason enum |
| Affinity | campaign-HMAC of effective cache key or absent; cache-retention control present/value from allowlist or unknown; previous-response-reference present boolean; no actual references |
| Payload structure | total bytes; encoding; ordered segment classes, bounded item counts, roles/types; section and schema/order digests; input item digests/lengths; explicit overflow/omitted count; synthetic missing-result count |
| Observation semantics | attempt invoked/acknowledged/terminal; full-input/delta-input; reconstruction versus native observation; cancellation/failure class, never raw error bodies |
| Usage | provider-reported input/cached/cache-write/output presence and values; normalized uncached/cache-read/cache-write/output; adapter mapping version; unknown if absent; terminal provider receipt class |
| Timing/cost | request preparation, send, first-content and completion monotonic timestamps; estimated price table identity; estimated amount; billing/subscription amount unknown unless separately attested |

No raw content, tool arguments/results, secrets, credential fingerprints, bearer/header values, personal filesystem paths, account IDs, response IDs or reasoning/signature data. Tool/schema **names** are optional sensitive metadata, omitted by default; equality and order can use keyed digests instead. A service-tier enum can be retained when non-sensitive and required to explain cost/route differences. Arbitrary custom-provider fields are not logged by default.

### Equality and privacy

- One randomly generated secret HMAC key per **explicitly authorized diagnostic campaign** permits equality across its parent/child samples. Never publish the key, use an account token as the key, or reuse a global salt.
- Header/account comparison is computed by the source owner from the resolved routing identity already needed by the adapter; diagnostics never fetch or refresh credentials. Unknown equality stays unknown. Same provider alias is insufficient.
- Domain-separate HMAC inputs by field class; include schema version. An opaque route-equality handle permits comparison without emitting the underlying identity. Digests remain potentially sensitive/linkable; this is privacy reduction, not anonymity.
- Preserve actual outbound ordering in one digest and separately derive semantic segment digests. Do not sort/change the request to make comparisons easier.
- A bounded segment list may omit the earliest divergent detail. Emit `coverage:partial` and omitted counts; never claim complete prefix equality after truncation. For large payloads use a streaming digest and bounded hierarchical segment digest tree, **not** a retained plaintext payload.
- Capability identity covers effective model overlay, service tier, reasoning, transport/retention controls, final hook ordering/version and actual declared tool schema/order. Unattested generations are explicit unknowns.

## Accounting and display

For the inspected Responses adapter, `input_tokens` includes cached/write tokens. Normalized uncached input is `max(0,total_input-cache_read-cache_write)`; denominator is the sum of those three, excluding output. Preserve both raw-count presence and normalized values so absent fields are not confused with reported0.

Proposed display, not exact UI implementation:

```text
Fork request 1 (new): input144389 / read0 / write0; read0%; estimated $1.46229
Inherited usage: excluded from new-work totals
Evidence: normalized provider usage; final-attempt request coverage unavailable
```

Later request2 would show96.84%, not overwrite the fact that request1 was cold. `/session` historical totals may remain available, labelled distinctly; do not silently change established historical accounting. ASC first-invocation statistics stay separate. Branch changes, compaction, auxiliary usage and hidden/recovered attempts are separately classified.

Aggregate only events with known accounting semantics. If two attempts have provider usage, retain both and avoid double-counting cumulative provider records. If a failed attempt has unknown usage, show known subtotal **plus unmeasured attempts**, not a zero-cost total. Do not deduce cache creation from `cacheWrite=0`, invoice amounts from metadata prices, or TTFT from message timestamps.

## Storage and failure behavior

Proposed starting policy for owner approval: off by default; explicit campaign; local owner-only directory0700/files0600; no network exporter; maximum32MiB campaign record storage and10,000 bounded events; maximum4 campaigns/128MiB aggregate per runtime namespace, including orphaned/incomplete campaigns. Campaign authorization expires at most24h from creation, whether or not a close event occurs; record/key retention target is at most24h from creation. These are **proposed caps**, not current configuration.

A campaign owns a journaled process-identity-bound lease refreshed while collection is active; lease expiry stops new emission/admission and triggers liveness reconciliation, not deletion or a claim of process death. Crash/restart reconciles only its known namespace, never automatically resumes collection, and counts orphaned storage against quota. At authorization expiry, close collection; do not extend expiry because a writer disappeared. Dispose records and per-campaign HMAC key only when ownership and inactivity are proved. Destroy persistent key material with the closed campaign; in-memory references are released without promising secure zeroization by a garbage-collected runtime. If live writers/custody prevent safe disposal at the retention deadline, restrict access, refuse new campaigns in that namespace and report the overdue owner obligation. No automatic key rotation may silently make cross-request comparisons incomparable.

At capacity, mark capture incomplete and stop collection; do not silently overwrite a supposedly complete comparison or block model work. Retention/disposal applies only to campaign-owned closed files with proven inactive writer. Do not delete foreign data or active journals. Evidence retention beyond the cap/TTL requires explicit owner selection of a sanitized aggregate; raw requests never become retained evidence. If disposal cannot be proved safe, disable access/collection and report the retained privacy obligation rather than claiming deletion.

Observation failures must not mutate model payloads, crash the agent, delay stream consumption indefinitely, or cause retries. Bounded asynchronous emission with sequence numbers/loss markers; do not let slow user extensions execute inside the send critical path. Strict experiments preflight collector health before a request and invalidate a trial if correlation/coverage is lost afterward; they do not replay it automatically. Overhead must be measured against instrumentation-off controls, including large prompts and slow disks.

## Detection acceptance and falsifiers

- Fail A1 if the first inherited assistant entry is reported as the child's first new request, or resumed ASC is reported as a new session.
- Fail A2 if a later hook changes the body, WebSocket delta/retry differs, or another adapter lacks observation and the record still claims complete final-send coverage.
- Fail A3 if planted canary secrets/private text/IDs appear in records, errors, headers, crash output or retained evidence.
- Fail A4 if missing usage becomes0, output enters the input hit denominator, cache creation is inferred from0writes, or estimates are labelled billed amounts.
- A matching native digest establishes local equality under its exact coverage, not a promised backend hit. Continued miss with equal known request/route fields keeps backend and unmeasured factors open.

## Actor reactions and redesign

First order: operator can distinguish first-fork overhead and locate divergence; maintainer avoids blind cache-key fixes. Second order: controllers may optimize displayed percentages, maintainers may overcollect to explain every miss, reviewers may trust a digest as certification. Third order: prompt inflation raises cached spend; diagnostics become a private-data archive or authority surrogate. Countermeasures: no hit-rate target, omit content at source, cap/expire campaigns, independent task-quality judgment, explicit evidence coverage. Remove the collector if overhead/privacy costs exceed diagnostic value; no downgrade of fresh authority or tool correctness is an acceptable compensation.
