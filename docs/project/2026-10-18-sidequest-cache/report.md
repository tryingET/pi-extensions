---
summary: "AK7207: observed first-fork cache miss, later reuse, offline serialized-prefix evidence, causal limits and intervention tradeoffs."
read_when:
  - "Diagnosing /sidequest cache usage or proposing cache-affinity changes."
---

# AK7207 — /sidequest prompt-cache diagnosis

> **REDACTED historical derivative (AK7403), not byte-identical original evidence.**
> This preserves the AK7207 diagnosis, not current implementation/adoption or live proof.
> “Current”, “today” and executed-check statements below refer to the historical investigation, not this redaction. See [public-copy provenance](README.md).
> `T+…s` is elapsed time from the historical parent session header; equality labels are pseudonyms, not hashes.

## Concise answer

**The HTML sidequest really had a first-request cache miss, not a persistent cache failure.** Its first **new** response reports 144,389 uncached input tokens and zero cache reads; the next reports 144,256 cached tokens out of 148,968 prompt tokens (96.84%). The parent was reusing cache before and after that launch.

**`/sidequest` preserves persisted conversation history, not the parent's live provider connection or cache-affinity identity.** Current Pi creates a new session ID, uses that ID for Codex `prompt_cache_key`, and keeps conditional WebSocket continuation state in process memory. A fork does not transfer that state. This changes cache affinity; it does **not** prove reusable prefix content was invalidated or that a miss is inevitable.

**No exclusive cause of the first miss is proved.** Fork-boundary affinity/transport, backend routing/eviction and historical request transformations remain plausible, not reliably ranked by this evidence. The strongest established mechanism is the local separation of conversation copying from affinity/connection state—not its causal responsibility for cache0. Offline reconstruction preserves a very large early prefix; its first substantive parent/child divergence is a *late* missing-tool-result substitution. Under a prefix-local caching assumption, that substitution alone would not explain losing an otherwise reusable earlier prefix; historical final-wire equality is still unproved. A clean CAD process already had a partial first-request hit, and the parent itself had an earlier warm→zero→warm sequence without forking. Neither process creation nor fork identity is necessary for a miss.

**Disposition:** diagnostic report complete; remedy neither implemented nor verified. No live `/sidequest` experiment, production changes, installs/reloads, auth/config changes, landing, publication or cleanup. Future work needs exact owner admission and final-outbound-request evidence—not another assertion that equal visible text guarantees a hit.

## Goal, scope and method

- Given: explain the miss from first principles, compare alternatives, preserve correctness/privacy and recommend only.
- [A] Good outcome by this report: a reproducible symptom, bounded evidence, falsifiers and a minimal next proof; not a universal zero-miss promise.
- Claimed AK7207 as `diagnostic-session`; scope readback allowed only `docs/project/2026-10-18-sidequest-cache/**`, required this file. AK4738 and evidence6886/6887 were read independently of historical transcript assertions.
- Prompt Vault **root-cause** and **second-order** retrieved and dispatch-checked in this session: both `text_ok`. Root-cause is applied below to observations; second-order to proposed interventions, not used as retrospective proof.
- Context planning preceded cross-source collection. Semantic `explore_symbol_impact(sidequest)` failed with `SCI NEXUS handshake returned an invalid reference contract`; bounded native source inspection was the fallback, not a successful semantic lookup.
- Named session JSONL was first processed with package-owned `packages/pi-session-insights/bin/pi-session-insights.mjs`, then bounded `jq`. No broad personal-session content search. Historical text is observation, not authority.
- Independent provider/source inspection: ASC `inspection-provider-source`, read-only. This dispatch is research, **not** a sidequest reproduction; its own cache metrics are excluded from the comparison.

## Identity and evidence provenance

| Layer | Observed identity | Limit |
|---|---|---|
| Diagnostic process | PID redacted; `/proc/.../exe` → `/usr/bin/node`; current session above; environment `openai-codex/gpt-6-astra`; presence confirms terminal-bound Pi in `softwareco/owned/pi-extensions` | Presence says `piBin: pi`, not an immutable loaded-code digest. Process title is `pi`. |
| Current launcher | `LAUNCHER/pi` → `PI_PACKAGE/dist/bundle/cli.js` (installation-local locations redacted) | Resolving today's symlink does not prove historical process code. |
| Inspected installation | `@earendil-works/pi-coding-agent` 1.1.0 and nested `@earendil-works/pi-ai` 1.1.0 | Unbundled serializer used offline; corresponding bundle inspected independently. No claim of hot upgrade. |
| Bundled Codex adapter | `dist/bundle/chunks/openai-codex-responses-ZSLJZYOE.js`, SHA256 `93e6886094b4a1f869457d350a660d8ec3e0db937af64a70bbb7c9a0d775d9f4` | Source mechanism, not historical wire receipt. |
| Checkout | `2e33ad1981ad9b54a26a14d841eb837e5ab63154`; main ahead4/behind11 origin | Already dirty: ontology receipt modification/deletion/build artifact and unrelated orchestrator diaries. Preserved. |
| Configured extension sources | Canonical local package paths; little-helpers0.11.2, ASC0.7.0; `pi-multi-pass`1.10.0 | Configuration/manifests are not proof every existing closure equals current source. |
| Historical parent | `session-parent`; cwd `softwareco/owned`; request entries `openai-codex-2/gpt-6-astra`, API `openai-codex-responses` | Initial model-change entry names default Sol but actual responses name Astra. Do not use default as actual request identity. |
| HTML fork | `session-html-child`; same cwd/provider/model/API; header links exact parent | Account identity, wire transport, historical overlay and loaded host/package digest not captured. |
| Clean CAD control | `session-cad-control`; cwd `softwareco/contrib/pele`; `openai-codex/gpt-6-astra` | Deliberately clean agent-window, NOT a fork; different route/cwd, uncontrolled contrast. |

Global settings currently select transport `auto`; default model is `openai-codex/gpt-6.1-sol`, distinct from these actual responses. The current multi-pass implementation clones base-provider models into `openai-codex-2`, registers their same API, and can refresh a remote model overlay (`extensions/multi-sub.ts:2640–2678`). An alias is not proof of the same account across time, identical effective model capabilities or a fixed backend route. No credentials or account identifiers were read or retained.

A concrete omitted hook is configured `pi-better-openai`: `extensions/fast.ts:206–214` can inject `service_tier:priority`; `pro.ts:187–195` can transform eligible payloads. State is initialized from configuration at session start, not established by these saved response entries. Current multi-pass can refresh base-provider remote overlays. These are real reasons not to equate an unhooked reconstruction with historical final requests; their historical activation is unknown, not an asserted change.

Historical parent records an ASC session-start invalidation event naming the canonical package root; it is explicitly **not** loaded-generation attestation. Exact historical executable/package generation remains unknown. Presenting today's checkout/version as that proof would defeat the diagnosis.

### Retained artifacts

- [measurements.json](measurements.json): bounded persisted-usage observations, session headers, compaction boundaries and owner-extractor limitations.
- [measurements.sh](measurements.sh): historical offline extraction template requiring explicitly supplied private originals; emits a JSON stream, requiring `jq -s .` for array output. No raw prompt output, but metadata output is private until redacted.
- [offline-serialization.json](offline-serialization.json): structural order, original lengths, redacted content-equality labels, source-code SHA256s, normalized usage and historical assertions. **Offline reconstruction, not historical outbound capture or a new execution.**
- [offline-serialization.mjs](offline-serialization.mjs): historical offline template requiring private fixtures, entry-ID restoration and pinned source. The original invoked installed `buildSessionContext`, `convertToLlm` and Codex serializer; `onPayload` captured then threw before headers/transport. Synthetic credential only, `fetch` failed closed, zero network attempts asserted. No extension/auth/settings loading. The public template was not executed.
- [scratch-path.txt](scratch-path.txt): **redacted pointer, not a filesystem location**. The original described a private owned TMPDIR directory containing jq-derived fixtures, mode0700 directory/0600 files. Private fixtures are not published or accessed by this redaction.

## Measurable symptom and comparison matrix

`prompt = input + cacheRead + cacheWrite`; here `cacheWrite=0`. Values below are **request-associated normalized usage**, not concatenated text estimates. USD values are Pi's pricing estimates, not an invoice/subscription debit.

| Case / relative response time | Uncached input | Cache read | Prompt total | Read % | Estimated cost |
|---|---:|---:|---:|---:|---:|
| Parent first request, T+23.308s | 24,317 | 0 | 24,317 | 0 | 0.249070 |
| Parent warm before fork, T+6834.688s | 2,829 | 140,032 | 142,861 | 98.02 | 0.197872 |
| HTML child first **new** response, T+6977.393s | 144,389 | 0 | 144,389 | 0 | 1.462290 |
| HTML child next response, T+6982.021s | 4,712 | 144,256 | 148,968 | 96.84 | 0.202176 |
| Parent warm after fork, T+6990.504s | 914 | 142,720 | 143,634 | 99.36 | 0.164860 |
| Clean CAD first, T+48556.130s | 16,261 | 7,808 | 24,069 | 32.44 | 0.171868 |
| Clean CAD next, T+48560.422s | 1,989 | 23,936 | 25,925 | 92.33 | 0.051526 |

The HTML file contains 124 assistant entries, but only **28 new responses** after its birth. The first 96 assistant entries were inherited; counting the first assistant in the file would erroneously report the parent's 24,317-token initial request as the child's. All253 inherited non-header objects matched parent objects in the private offline projection.

The extractor separates entries by timestamp; the private offline cross-check additionally asserts unique entry IDs, no entries exactly at the birth timestamp, all253 inherited objects matching the parent, and all28 new assistant IDs absent from the parent. This validates this selected boundary, not a universal timestamp-only deduplication algorithm.

A counterexample already retained in the parent measurement slice: at T+50.045s it read39,424/39,722 prompt tokens; at T+128.043s (`entry-parent-early-miss`) it read0/42,246; at T+135.038s it read42,112/45,995. Same session/model/alias. Offline follow-up reconstructs equal instructions/key but a changed top-level tool list (41,539→44,663 bytes), coincident with persisted system update `entry-system-update` at T+125.865s. This is not a key-only controlled test or historical causal proof; it demonstrates a concrete competing serialization mechanism and that warm→zero→warm is not unique to forking.

Those28 new HTML responses accumulated 5,180,145 prompt tokens, 4,973,568 cached (96.01%) and $7.686638 estimated total. High aggregate hit percentage does not erase the first cold-prefix charge or the repeated discounted-input/output cost. Counts cover persisted assistant entries, not independently audited backend attempts or non-assistant auxiliary usage; hidden retries are not established.

| Planned contrast | Evidence/status | What it isolates |
|---|---|---|
| Warm parent vs same displayed model/account-route fork | Historical pair above; same alias, **actual account equality unverified** | Strong miss/hit contrast, not a randomized single-factor test |
| Clean vs fork | CAD and HTML differ cwd/alias/time/task/history | Falsifies universal process-cold claim; does not rank clean vs fork cost for equal work |
| Child first vs subsequent request | Direct persisted new-response measurements | First miss vs later reuse, not “sidequest caching broken” |
| Same CWD/tools vs one-factor change | Offline reconstructed parent/child instructions and tools equal; key-only replacement changes only key | Serialization mechanism only, no provider causality or cache-rate result |
| Short interval vs TTL | Parent request ending142.705s before child; warm parent afterward | Not consistent with a simple global outage; no controlled TTL test, no Codex backend TTL established |
| ASC reviewer6037/cache0 then resumed66895/cache60288 | Operator-supplied observation for `observation-reviewer-resume`; not re-audited as sidequest | Clean reviewer/resume only; excluded from causal fork evidence |

Response timestamps are not request-start/TTFT measurements. The 4.628s between child responses includes tool/orchestration work. No defensible latency savings or actual billed cost can be derived from that interval.

## What the cache display means

Installed shared Responses normalization (`pi-ai/dist/api/openai-responses-shared.js:434–460`):

```text
cacheRead = usage.input_tokens_details.cached_tokens || 0
cacheWrite = usage.input_tokens_details.cache_write_tokens || 0
input = max(0, usage.input_tokens - cacheRead - cacheWrite)
output = usage.output_tokens || 0
```

Thus input is **uncached**, not total input; `totalTokens` also includes output and is not the hit-rate denominator. Zero `cacheWrite` means no separately reported creation tokens, **not** that the backend created no cache. Reasoning is already included in output; do not add it again.

Stock footer (`dist/modes/interactive/components/footer.js:96–117,149–169`) uses cumulative `↑/↓/R/W` across recorded session entries, including inherited history, other branches and auxiliary usage. `CH` is the latest assistant entry's `cacheRead / prompt`, not lifetime hit rate. Its latest-entry scan is not a current-branch proof. Context occupancy is yet another metric. No screenshot/custom-footer observation was supplied, so this report identifies stock semantics and persisted metrics, not an unobserved exact rendered widget.

ASC differs: `extensions/self/subagent-spawn.ts:68–84,378–394` records the first usage event of **that dispatch invocation** and an aggregate over its events. A resumed child can therefore have a high-cache “first prompt” without that being its session's first-ever request. `uncachedTokens=input+cacheWrite`; display implementation is `subagent-runtime.ts:62–65`.

## Timeline — evidence versus inference

- **[E] Aug12:** AK4738 done; evidence6886 records457 tests;6887 records historical same-session read1536/73.25%, fork read0. Historical model `openai-codex/gpt-5.6-sol`. This qualified ASC prompt placement, not current sidequest backend semantics.
- **[E] Oct9–10:** the existing [prompt-prefix-stability report](../prompt-prefix-stability-2026-10-09.md) records startup/ontology prompt-stability corrections and explicit limits. Historical Codex pair retained only3584 cached of8730 continuation input despite equal captured prefixes; accepted requests/equal strings were already insufficient proof of full reuse.
- **[E] T+0.000s:** parent session begins; responses use the `-2` alias/Astra.
- **[E] T+4402.271s:** inherited compaction `entry-compaction-shared`, checkpoint present, `tokensBefore=265665`, `firstKeptEntryId=entry-first-kept-shared`. Both comparisons reconstruct from this checkpoint; no child-only compaction before its first request.
- **[E] T+6834.688s:** parent assistant `entry-parent-before` requests codemode; parent prompt reports140032 cache reads.
- **[E] T+6965.233s:** child header created with new ID, same cwd, parentSession link (public label `PRIVATE_SESSION/session-parent.jsonl`), copied history including that unresolved tool call.
- **[E] T+6968.703s:** child startup-context custom message appended. No new persisted system message before first child response.
- **[E] T+6977.393s:** child first new response cache0.
- **[E] T+6982.021s:** child next response cache144256.
- **[E] T+6985.817s:** parent's codemode result `entry-parent-tool-result` finally persists—after the fork snapshot.
- **[E] T+6990.504s:** parent continuation cache142720.
- **[I]** Fork occurred with an unresolved parent tool; current adapter supplies a synthetic result to make replay valid. Offline assertion verifies that mechanism, not execution of the absent tool in the child.
- **[A/unresolved]** Exact original wire payload, final hooks, account identity and whether either request used SSE or cached WebSocket continuation. No retained request capture was found in inspected named-session custom entry kinds; pi-telemetry deliberately excludes payloads. This is a bounded search limitation, not a claim no capture exists anywhere.

## Call path and serialized-prefix diagnosis

### Ownership and preservation

`pi-little-helpers/extensions/sidequestCommandHandlers.ts:70–110` obtains the saved session file and current cwd. `sidequestLaunch.ts` delegates argument preparation and guarded Ghostty launch. `sidequestLaunchAdmission.ts:145–167` constructs:

```text
pi --fork <sourceSessionFile> <current provider/model/thinking args> <new objective>
```

It can use `PI_SIDEQUEST_PI_BIN`; no automatic equivalence between launcher targets is implied. Company provenance is resolved separately from session mode, particularly for unscoped cwd. No company-switch authority follows from a fork.

Installed `dist/core/session-manager.js:1374–1420` creates a **new UUID/header**, sets target cwd/parentSession, copies **all non-header entries**, then constructs a new manager. Active-branch/compaction replay selects model context afterward. Copying stored history also copies historical usage and extension custom state; it does not serialize an open socket, provider response cache or every in-memory extension lease. Manual slash launch is not ASC dispatch; ASC is adjacent research/execution infrastructure, not this launch owner.

### Actual serializer exercised offline

The diagnostic fixture calls the current installed Codex serializer with the persisted branch immediately preceding each selected response. It captures the serializer's request object, not hand-concatenated session prose. It preserves role conversion, reasoning signatures, parsed/re-serialized tool arguments, compaction checkpoint and tool schemas. Synthetic credential is never sent. Current built-in Astra capability metadata is used with provider alias retained; historical remote overlays and request/context hooks are **not** reconstructed.

Request property order observed:

```text
model, store, stream, instructions, input, text, include,
prompt_cache_key, tool_choice, parallel_tool_calls, tools, reasoning
```

This is JSON object order, **not** a documented backend tokenization order. Instructions and tool schemas are distinct fields. A changed later affinity field can affect routing regardless of its byte position.

| Segment | Reconstructed evidence |
|---|---|
| Instructions | Equal in all4 cases:66,330 bytes, redacted equality label `content-equality-052` |
| Top-level tools/order | Equal:44,663 bytes, redacted equality label `content-equality-031`; names/order retained in artifact |
| Parent-before input vs child-first | All142 parent input items equal;775,867-byte JSON common prefix. Child appends parent response, synthetic result, objective/startup material. |
| Parent-after vs child-first | First144 items equal;782,528 common JSON bytes. First different item `input[144]`, `custom_tool_call_output`, same call identity. Parent742 bytes, redacted equality label `content-equality-201`; child114 bytes, redacted equality label `content-equality-205`. Child output is adapter literal `No result provided`. |
| Child-first vs child-second | Same instructions/tools/key; all147 first input items retained,786,697 common JSON bytes; new response/results appended |
| Cache-affinity key | Both36 bytes, different redacted equality labels: parent `content-equality-003`; child `content-equality-202` |
| Controlled key-only reconstruction | Substituting parent session ID changes only `prompt_cache_key`. No backend call, no measured cache improvement. |

System-section equality labels replace the original hashes separately: project_context19,962 bytes; skills33,076; cwd55; ontology_workflow726; plus preamble/tools/rules/docs/addendum/MCP. All share the same reconstructed leading checkpoint. The reconstruction exhibits no early AGENTS/CWD/skills/tool-schema divergence under its selected inputs. Historical final-request divergence remains unresolved, including configured request transformations; this does not eliminate H2/H3. Semantic discovery reports bind only their current prompt run; inherited advisory messages are not fresh authority. Current startup snapshots are persistent custom messages rather than blanket early-system replacements. Their timestamps and freshness changes can alter suffixes legitimately.

### Provider-specific constraints

Installed `dist/core/sdk.js:277–286` supplies manager session ID and configured transport. Codex adapter `:169–181,373–430` clamps the session-derived cache key to64 Unicode code points (these UUIDs are36), sends `store:false`, instructions, serialized input, encrypted reasoning inclusion, tool and reasoning settings. It permits an `onPayload` replacement, so serialized pre-hook equality alone is insufficient.

With explicit `auto` or `websocket-cached`, cached WebSocket continuation can send `previous_response_id` and only appended input when prior request prefix/output and other fields exactly match. It is keyed in memory by session ID and account, not copied in JSONL (`:648–653,784–797,867–955,1121–1235`). A fresh child cannot inherit that connection state. SSE normally sends full context without a previous-response reference. Local socket idle5min/max55min policy is **not provider prompt-cache TTL**. Backend caching can still work without local continuation.

SSE uses session-derived `session-id`/`x-client-request-id`; WebSocket has analogous identifiers, account header and its own beta. Neither arbitrary session-ID reuse nor matching headers proves same server route. No conversation-reference transport was observed in the ordinary body; conditional previous-response state must be recorded at the actual final transport seam to know what was sent.

Codex sends no explicit `prompt_cache_retention`/cache TTL. `cacheRetention:none` removes its session-derived affinity; it does not prove the backend disabled caching. Ordinary OpenAI Responses retention fields, Anthropic cache creation/breakpoints and xAI behavior are different contracts and must not be imported here. Backend routing, partitioning, tokenization and eviction remain opaque.

Tool additions can be anchored as `additional_tools`/tool-search results for capable models; removals/redeclarations can force a new top-level tool list. Same tool names alone do not prove schema/order equality. Same-provider/model reasoning signatures are replayed; cross-provider/model history transformations can drop/convert them. Tool arguments are parsed then `JSON.stringify`-serialized; missing results are synthesized (`transform-messages.js:125–208`). Thus visible text is not a request-prefix witness.

## Competing hypotheses and falsification matrix

`+` consistent; `−` inconsistent with the stated *strong* hypothesis; `0` nondiscriminating; `?` not measured. Survival is not proof.

| Evidence | H1 affinity/connection boundary contributes | H2 early serialized prefix changed | H3 boring model/account/config change | H4 measurement only/copied totals | H5 expiry/eviction/backend routing |
|---|---|---|---|---|---|
| Child first NEW usage0, next144256 | + | + | + | − | + |
| Parent warm immediately before/after | + | 0 | 0 | 0 | − for global outage; + for per-route eviction |
| Same persisted cwd/model/alias | 0 | 0 | − for displayed model/cwd switch; ? account/overlay | 0 | 0 |
| Reconstructed early instructions/tools and huge input prefix equal | + | − locally; ? historical hooks | 0 | 0 | + |
| Key differs; socket state cannot be transferred by file copy | + mechanism | 0 | 0 | 0 | + |
| Clean process partial first hit | − for “new process guarantees miss” | 0 | + uncontrolled | 0 | + |
| Late synthetic tool-result divergence | 0 | No early divergence in reconstruction; historical ? | 0 | 0 | 0 |
| Same-parent warm→zero→warm, reconstructed tool-list change | − for fork/key change being necessary | + competing mechanism | + | − sole measurement explanation | + |

**Survivor set:** H1/H2/H3/H5 remain unresolved. H4 as sole explanation is rejected by timestamp-separated persisted usage with the child-boundary identity cross-check; misleading cumulative displays remain a separate detection risk. H1 is plausible but not ranked above the alternatives by this evidence, and not a diagnosed provider defect. No evidence supports claiming all sidequest cache misses are expected or unavoidable.

Decisive falsifiers: final-wire capture showing equal affinity/transport state but a changed early prefix weakens H1; stable final-prefix/key/route with inconsistent results points to backend behavior; equal-content matched trials where only permitted affinity differs can test its contribution. A single zero/hit pair cannot disentangle stochastic backend placement. Stop before inventing a root when that evidence ends.

## Causal graph and counterfactuals

```text
/sidequest → file snapshot + new session ID → new affinity identifiers ──?──→ first miss
          → new process → no parent's cached WebSocket continuation ──?──→ first miss
          → fork during tool execution → absent result → synthetic suffix result
first child request → potentially populated backend state → later large cache read
inherited usage + unlabelled ratios → mistaken attribution / unnoticed cold-fork charge
```

- **Proven local link:** fork → new ID because host explicitly creates it. Counterfactual: preserving an ID would remove this identity difference, but would also defeat independent session identity; not an authorized or safe fix.
- **Proven local link:** new process → no parent's in-memory continuation. Counterfactual: exporting a separate supported continuation mechanism could remove that condition, but no such fork transfer exists in this path. A backend prefix hit is still possible without it.
- **Unproved causal link:** changed affinity/lost continuation → cache0. Counterfactual not run; identical early strings do not settle routing/retention. These are conditions/candidate mechanisms, not an exclusive root.
- **Proven reconstruction link:** pending tool at snapshot → synthesized missing result. Counterfactual: snapshot after the result would include it. This changes late content/correctness; under prefix-local reuse the earlier prefix could still be reused. Historical final-prefix equality and backend behavior remain unproved, so it does not establish the full-miss cause.
- **Separate correctness concern:** “No result provided” is not failed execution or permission to retry. Parent tools may already have external effects before their result persists; a child could duplicate a non-idempotent action. No duplicate action was observed here. A future pending-tool marker must preserve **outcome unknown**, and settlement must account for detached/background effects rather than merely waiting for a message.
- **Inferred link:** first child request warmed reusable backend state → next hit. Strongly consistent with the near-prefix-size read count, not a direct observation of cache creation/storage identity.

**Actionable stopping point:** locally, the fork contract separates conversation inheritance from provider-session state and lacks a final-wire/cache-attribution witness. Changing that contract needs host/provider ownership. The backend root remains a hypothesis; no production root fix is justified yet.

## Detection failure — separate from runtime cause

The user's symptom can look global because “context inherited” and “cache inherited” are conflated; footer totals include copied usage, ASC's “first” means first in that invocation, and successful launch/HTTP acceptance says nothing about cached-token usage. Persisted sessions retain content/usage but not complete final requests, account equality, transport deltas or immutable loaded generation. Consequently the needed causal comparison cannot be recovered exactly after the fact.

Proposed detection fix: opt-in, per-request **content-free** records of logical session versus request ordinal, copied/new boundary, model/API/route equality token, transport/full-vs-delta state, system/tool/input-segment hashes and lengths/order, cache-key digest, loaded-code digest, start/TTFT/end, retry count, provider input/cached/write/output counts, and estimated cost separately from billed/subscription observations. Record after final transformations and WebSocket delta selection. Do not log bearer headers, account IDs, response IDs, raw prompts or encrypted reasoning. Short bounded retention and local-only access; hashes can themselves be sensitive/linkable.

## Second- and third-order analysis of proposed interventions

### Frame

[A] Good outcome: after a separately admitted pilot, lower **total cost and time per correct completed task**, without stale authority, lost tool results or company leakage. Near horizon: next diagnostic session/days. Medium: several weeks of agent delegation behavior; no speculation beyond that.

Actors: operator/account owner **pays**; controllers and spawned agents are **measured**; provider routes/evicts and charges; host/extension maintainers bear compatibility burden; company/source owners bear authority/privacy risk; reviewers and task receivers judge correctness. Evidence below is marked `[I]` mechanism inference or `[A]` behavioral prediction, not measured performance.

| Move/order | Consequence and adapting actor | Favorable/adverse |
|---|---|---|
| Diagnostic attribution first —1 | [I] Operator sees new-child cost, early divergence and uncertainty separately; maintainer stops blaming launch success/failure for cache results | Favorable |
| —2 | [A] Controllers select fewer redundant forks or lean clean workers where inherited context is irrelevant | Favorable |
| —2 | [A] Agents optimize the dashboard; dump hashes of everything, add logging latency or expose correlatable sensitive structure | Adverse |
| —3 | [A] New telemetry becomes a shadow authority/retention store unless source-owner boundaries and TTL are enforced | Adverse |
| Reduce unnecessary replay/fan-out —1 | [I] Smaller clean tasks avoid replaying144k input when it is irrelevant; warm continuation avoids parallel startup cost when concurrency is unnecessary | Favorable |
| —2 | [A] Agents substitute serial work/short summaries for independent inspection; missing context or reduced challenge can increase errors and rework | Adverse |
| —3 | [A] Cheap-looking serial tasks accumulate giant histories, trigger compaction and lose useful provenance; savings can reverse at task completion | Adverse |
| Provider-scoped cache-family affinity, only if proved —1 | [A] Could increase cross-fork prefix reuse without sharing logical session IDs | Favorable, unverified |
| —2 | [A] Controllers spawn more because fork cost appears low; payer incurs more cached-input, output, orchestration and verification cost | Adverse |
| —2 | [A] Maintainers freeze AGENTS, snapshots, semantic guidance or tools to protect hit rate; source owners lose fresh revocation/isolation guarantees | Adverse, unacceptable |
| —3 | [A] Shared hot affinity concentrates traffic/routing contention; retries/latency can rise, encouraging more redundant agents and costly fan-out | Adverse |
| Fork only at a settled checkpoint —1 | [I] Avoids this synthetic missing-result suffix and gives the child complete tool evidence | Favorable for correctness; cache benefit unproved |
| —2 | [A] Operator waits for slow tools; work loses useful parallelism and time-to-result worsens | Adverse |
| —3 | [A] Agents work around waits with separate summaries/clean spawns; duplicate work can return unless launch UX reports the tradeoff | Adverse |

### Loops, delays, gaming and substitution

- **R, cheap-fork loop:** better perceived hit rate → more forks → more successful-looking cached requests → stronger incentive to fork. Delay: days; saturates at context/concurrency/account capacity, not at zero cost.
- **B, resource loop:** fan-out → output/review cost and route contention → quota/latency pressure → fewer useful tasks. Delay: task settlement or billing period; early CH gains conceal it.
- **R, prompt-inflation loop:** reward cache% → retain more static boilerplate → larger cached denominator → higher% → more boilerplate. It increases paid cached tokens/context pressure and delays compaction costs; a high hit rate is not the goal.
- **B, correctness loop:** freeze state/tools → stale-authority or tool failure → rework/security response → forced refresh/reset. Delay until revocation/tool change is encountered; downside outweighs marginal input savings.
- **B, observation loop:** bounded attribution → cause-specific changes → less unnecessary instrumentation. Without expiry it instead becomes an R storage/privacy burden.
- Goodhart: do not reward hit ratio alone. Measure uncached **and cached** input, output, total estimated cost, wall/TTFT, useful completion and rework; independently audit safety. Never pad a prompt to exceed a caching threshold or launch warmers solely to make CH green.
- Substitution: less parallelism saves requests but may displace independent inspection; smaller clean prompts save replay but can displace necessary task context. Make those costs visible to the receiver.

### Consensus contrast and redesign

First-level view: “fork copies context; make its key/prefix stable and the charge disappears.” This analysis differs: prefix content, affinity and connection continuation are separate; some reuse already occurs, discounted tokens still cost, and forced stability can corrupt authority/tool truth.

**Decision: redesign to measurement-first, not shared-ID or frozen-prefix optimization.** Smallest step is attribution plus launch guidance describing history inheritance and pending-result state. A future affinity pilot must be provider/account/company scoped, bounded in requests/cost/concurrency, preserve distinct session IDs and fresh observations, and expire automatically. Roll back on correctness/privacy regression, no total-cost/latency gain, increased retry load or any evidence that context is suppressed for a benchmark. Reverting an isolated instrumentation/pilot option must not alter stored history or silently retry an indeterminate request.

## Proposed fixes and exact proof before implementation

| Proposal — not implemented | Owner / removes | Required proof |
|---|---|---|
| Detection/wording: history inheritance ≠ guaranteed cache; first-new-request vs inherited usage labels | little-helpers UX + Pi footer/ASC owners; removes attribution ambiguity | Fixture with copied usage, new first response, resume, branch and compaction; displayed denominator and scope match provider fields; no double counting |
| Observe final payload structurally, including transport delta and effective route equality | Pi host/provider owner; removes causal blind spot | Synthetic serializer tests plus separately admitted real TUI capture; no raw content/credentials; final transport observation linked to normalized usage and immutable host/package identity |
| Pending-tool snapshot indication or settled-fork option | little-helpers/host session owner; removes incomplete-evidence ambiguity, not proven cache root | Real interactive fork during a controlled slow tool and after settlement; child tool-result integrity, no duplicate tool execution, unchanged operator desktop focus; new cache outcome assessed separately |
| Conditional cache-family affinity, **only after hypothesis test** | Pi Codex adapter/provider owner, account/company isolation approval; may remove unnecessary affinity separation | Same model/effective account/tools/CWD/context with one factor changed, supported real `/sidequest` launch, final-wire hashes/headers classified, bounded randomized repeats if nondeterministic; no guaranteed-hit claim |
| Prefer warm continuation or smaller clean helper when context inheritance is unnecessary | Controller/task owner; reduces replay/fan-out cost without transport changes | Matched useful-task completion, total cost/latency and independent-inspection quality, not raw CH% |

For scale only: reclassifying140,032 first-child input tokens from uncached($10/M) to cached($1/M) would reduce the Pi estimate by **$1.260288**, from$1.462290 to$0.202002 including unchanged output. This is a counterfactual pricing calculation, **not** achievable savings proof. All28 responses still cost$7.686638 estimated despite96.01% aggregate input reuse. Clean CAD has different work/history and is not a cost benchmark against HTML.

Future decisive live matrix: one warm parent continuation; first and second real fork turns; clean same-model/account/CWD/tools control; then a single admitted key or tool/CWD factor. Capture fresh company/semantic observations without freezing them; record their position/digest. Do not wait out an invented TTL: first establish a provider-supported retention claim. Start with the smallest pair; only repeat if stochastic behavior prevents discrimination. Stop on decisive evidence, admission refusal, privacy failure, identity drift or indeterminate launch. Any actual UI automation must use the isolated nested-compositor workflow, never the operator's focus; `pi -p` is not a substitute for a TUI-only `/sidequest` launch.

## Holds and remaining owner clarification

Historical package-text source: [pi-little-helpers README](../../../packages/pi-little-helpers/README.md) (line references below are from the original inspection, not a current-source attestation):

- **Lines78–90:** `task-session-build.mjs` emits `sidequestGhostty.ts` into `dist/task-session/shared-ghostty.js`; a rebuild changes aggregate identity. “Runtime, activation, CI and landing remain HOLD for this reconciliation.” Explicit bounded AK6626/6867 exceptions do not release shared-resolver/task-session reconciliation.
- **Lines338–343:** activation/verification checklist is future owner-admitted, **not permission** to install/reload/run CI/land the source proposal; authored stagger/pending-transport successors need separate effect inspection and admitted execution. The subsequent checklist explicitly includes `/sidequest`.
- Authority readbacks: Decision151 accepted/unblocked architecture; AK5480 is done for its Pi slice, not global publication/canary acceptance. AK6867 is done for a bounded observer callback correction; its result still states full CI packaging blocked by Decision151 build hold. Neither releases this investigation into a new live proof.

**Applicability:** no blanket ban on an operator's ordinary use of an already-loaded `/sidequest` was established. The held shared source/build/publication path and unadmitted verification checklist must not be treated as cleared by ordinary launch availability. Parent controller explicitly continued **read-only/offline only**, without HOLD override or broader live authorization. Therefore no new live reproduction was attempted; this is an admission limit, not a claim the tool necessarily refuses ordinary use.

Minimum clarification: pi-extensions/little-helpers owner confirms a bounded unchanged-runtime interactive comparison is allowed despite the reconciliation checklist, identifies exact loaded generation and whether any shared resolver effect path is excluded; Pi/provider owner admits temporary content-free final-request observation and any one-factor cache-affinity trial. No task-session build, enrollment, install, global configuration, identity reuse or canonical landing is needed or authorized by this report.

## Verification and limitations

- Offline reconstruction ran successfully; zero network attempts; all253 inherited objects equal; same-key-only substitution assertion passes; synthetic result and matching parent call assertion pass. Source hashes retained.
- Extraction initially failed on a zero-token historical assistant record (division by zero); corrected to `null` ratio when denominator is zero and rerun successfully. This is diagnostic-script repair, not a production fix. Blank/unknown usage must not be scored as a miss.
- No raw request secrets/private prompts were retained in report artifacts. The private jq projections remain sensitive and owned; no cleanup outside scope.
- No full package CI/prepack was run: runtime source unchanged, known build/publication HOLD, and canonical dirty checkout preserved. Diagnostic syntax/JSON/assertion checks are the relevant bounded proof; they are not provider live verification.
- Independent work-product inspection `inspection-diagnosis` found two blocking overstatements in the first draft: it omitted the retained same-session miss counterexample and prioritized affinity beyond the evidence; it also needed stronger reconstruction/historical limits. Both were corrected, with the counterexample reconstructed offline. Nonblocking feedback added boundary identity assertions, explicit unknown-outcome/non-idempotent retry risk and truthful metadata-output wording. This is substantive correction, not an initial clean inspection. Recheck under the same dispatch resolved both original blockers with no remaining blocking overclaim in the inspected scope. Historical normalized usage was read directly by this investigator; inspectors did not independently reread private sessions or execute the scripts.
- Remaining unknowns: historical final wire payload/hook state, actual account equality, effective overlay, selected socket/SSE route, retries, backend tokenization/placement/retention, actual billing and TTFT. These prevent an exclusive root-cause or verified-remedy claim.

### Public-copy checks and historical recipe limits

Only syntax/integrity checks are public-copy recipes, from the repo root:

```bash
node --check docs/project/2026-10-18-sidequest-cache/offline-serialization.mjs
bash -n docs/project/2026-10-18-sidequest-cache/measurements.sh
sha256sum -c docs/project/2026-10-18-sidequest-cache/SHA256SUMS
sha256sum -c docs/project/2026-10-18-sidequest-cache/design/SHA256SUMS
```

Neither historical extraction nor reconstruction was rerun for AK7403. The scripts are offline templates needing private originals and separately admitted access, not runnable public proofs. `measurements.sh` requires explicit input files and window bounds, and its JSON stream requires `jq -s .` to form an array; its output still requires redaction. The serializer template needs pinned installed source, private jq-derived fixtures and restored entry IDs. `scratch-path.txt` is not a usable path. A future refresh must first use the package session extractor, then bounded jq projections, and compare source digests. Source or session drift must not silently be presented as the same experiment.

### Documentation read coverage

Current installed Pi docs fully read across this investigator and independent researcher: README; extensions; SDK; sessions; session-format; message-types; how-pi-works; compaction; providers; models; custom-provider; configuration; settings; security; TUI; environment-variables. Pertinent session SDK example and provider-event example inspected; actual dist and bundled Codex implementation checked rather than treating latest checkout/docs as runtime proof. Repo/package instructions, engineering.local and compact lane policy, launch ownership ADR, historical AK4738 cache-locality report, current prefix-stability report and package hold text were read. No external provider guarantee was invented from these sources.
