---
summary: "AK6845/6846: root causes, bounded prompt-prefix corrections, independent inspection, and explicit remaining owner contracts."
type: "verification"
---
# Prompt prefix stability — 2026-10-09

## Scope and proof posture

Operator requested actual repair of recurring Anthropic signed-thinking prefix errors and avoidable cache churn, using atomic-completion, first principles, multi-order effects, and many-of-the-greats. XENO is unaffected: Pi/runtime and pi-extensions own this work. No package publication or unrelated cleanup is authorized.

AK6845 owns the extension correction; AK6846 owns the native Anthropic source candidate. Passing source/offline tests does not establish installed generation, server acceptance, cache savings, or terminal task/lifecycle authority. Append-only evidence must preserve user/tool history and fresh authority checks.

## Root cause, not provider folklore

1. `pi-society-startup-context` injected lifecycle-refreshed snapshots into the system prompt on every user turn. Timestamp/tier/freshness/task changes alter an early cached prefix even though these are observations, not durable instructions.
2. Ontology's disabled-development keyword hint conditionally returned a full-system append. Alternating keyword/nonkeyword prompts changed system bytes. Its opt-in development path also appends fresh metadata, but has accepted Decision89 observation semantics that cannot be silently retired.
3. Pi0.84.x retained signed thinking while installing changed system instructions. Its inspected Anthropic adapter lacked the documented prefix-mismatch binding control. The API rejects an incompatible signature; this is distinct from an ordinary cache miss.
4. Active tool/schema changes are genuine behavioral changes. Older/fallback providers may need a new cache prefix. Removing safety checks or lying about available tools to keep a cache hit is unacceptable.
5. During this pass the `pi` launcher symlink changed from the0.84.4 installation to an independently installed1.1.0. Existing processes do not hot-upgrade. The new host's built-in Opus5.5 metadata enables `supportsMidConvoEffort`, for which native `drop_block` and its beta already exist. That does not qualify other models or retrofit old sessions.

OpenAI accepting a changed request is not evidence of a cache hit. xAI likewise reports actual cached token usage separately. Prefix identity is necessary, not sufficient: first requests, expiry, eviction, routing, minimum cache length, model changes, and genuine tool changes remain legitimate misses. No universal zero-miss claim is made.

## Corrections

- Startup snapshots are persistent custom messages, not system overrides. The latest snapshot explicitly supersedes historical orientation and never grants continuing authority.
- Active replay-context evidence deduplicates unchanged packets. It honors context edits and ignores compacted/abandoned advice. In-memory last-packet state cannot decide freshness.
- Disabled/outside transitions append a one-time withdrawal marker when historical advice is active. They start no AK/git reads.
- Snapshot messages are bounded at32KiB UTF-8. Oversize bodies are withheld explicitly with a digest and bounded diagnostics; no truncated grant/decision is presented as complete.
- Default ontology reports are persistent advisory messages. Fixed routing guidance remains SYSTEM authority even with ontology tools inactive, through Pi1.1 structured composition; later native/append/replace-base modes are not masked. Intentional replace_final remains an explicit exception.
- Toolbox cache wording distinguishes native deferred/in-transcript tool transitions (which can preserve the prefix) from fallback serialization and active-only guidance (which can change it). Reuse is conditional, not guaranteed. Activation and finite leases are preserved.
- AK6846's isolated native Anthropic candidate adds server-side `drop_block` only for internally constructed native clients with final enabled/adaptive thinking; it merges required beta headers without discarding OAuth/fallback/custom features, preserves explicit error behavior and signed/redacted/text/tool history, and adds no retry. It is NOT installed: source/runtime generation and full-gate blockers require owner reconciliation.

## Independent inspection and verification

Initial inspection caught real regressions: repeated packet accumulation, guidance disappearing under the actual toolbox startup set, and removal of accepted observation functionality. The candidate was corrected before activation. Final independent inspection: `dispatch-1791578450469`; no blocking source defect found for the corrected pinned1.1 extension scope, with explicitly retained limitations.

- Startup declared package gate:55 tests across16 files plus typecheck, lint, structure and packaging passed. Real SDK/mock inference regression exercised205 unchanged prompts with zero added packet bytes, changed freshness/data, withdrawals, reload/resume, branches, compaction and new sessions.
- Toolbox package pre-push gate:48 tests passed.
- Ontology declared gate:139 passed,1 existing smoke skipped; all20 files passed, plus lint/typecheck, structure, budgets and packaging. Initial isolated borrowed-link blockers were repaired by offline/ignore-scripts installs in this session-owned scratch worktree and transitive packages; canonical shared installations were not altered for that repair.
- Native provider candidate:36 mock-fetch regressions passed; feature-selected tests fail against the original implementation. Full old-source gate has801 diagnostics identical to its baseline; no current release/runtime qualification is inferred.
- Canonical extension correction landed locally at `9058aec1043496b77a44a111484283940cf26c9b` through `scripts/land-canonical.sh`, with the host packages linked to the existing Pi1.1.0 installation; install health reports38 packages consistent (metadata/versions, not complete code integrity). No publication occurred.
- Live native Anthropic/Opus5.5 proof: exactly3 requests, all HTTP200, output cap1024. Initial usage: input4/cacheWrite4644/cacheRead0/output57; ordinary signed continuation: input4/cacheWrite85/cacheRead4644/output11; changed in-transcript instructions: input2/cacheWrite66/cacheRead4729/output42. Latencies2350/1810/2295ms. Signed histories and initial system/tool prefix hashes remained unchanged; the binding field and beta were observed. This is actual successful signed continuation and cache reuse, not proof of server-side block dropping after a deliberate mismatch.
- Separate installed SDK/startup-factory proof used real read-only git/AK collection (healthy/fresh, zero warnings,9.12s) and mocked inference to verify fast-to-full context append with stable system/history bytes. It was not a combined live-model/global-extension run; ontology behavior remains covered by offline registered-hook tests.
- Private retained live artifacts: `$TMPDIR/opus55-live-wK6iyv/{verify.mjs,evidence.jsonl,summary.json}`. Script SHA256 `107a448a38bf0c9deb6d1e9b977adf6531caaf57ff94cbfff56c9e9332c884db`; evidence SHA256 `8760e8b1437e44b8606417c225d0284b88a7151ca225e1ae9f09ca2cf6211163`. Low effort was requested but its transcript-level wire field was not captured by that recorder; do not claim it was observed.
- Initial cross-provider fixtures were invalid: xAI read-only auth prevented ordinary owner OAuth refresh; later the server explicitly rejected tester-supplied `tool_choice:none` with no tools. Native defaults succeeded. A Codex fixture injected an output-cap parameter deliberately omitted by its adapter and returned400. These are retained test-setup failures, not product/cache defects; no automatic retry was used.
- Corrected native xAI/Grok4.7 pair: HTTP200 twice, unchanged system/tool and initial-input prefix hashes, actual response history replayed. Warm total input10183/cached1152/output37; continuation total input10243/cached10112/output26 (98.7% cached). Latencies1679/1037ms; normalized uncached input9031/131. Native short retention and stable cache key, no tools/forced tool choice/unsupported cap. Evidence: `$TMPDIR/xai-cache-parent-final/{verify.mjs,evidence.jsonl,summary.json}`. This proves actual xAI cache reuse, not elimination of eviction/routing misses.
- Corrected native OpenAI-Codex/GPT6.1-Sol pair: HTTP200 twice with identical prefix hashes and actual response replay. Warm input8707/cached3584/output5; continuation input8730/cached3584/output5 (41.1% cached). Latencies1877/2293ms. An earlier valid shorter pair (~3847 input tokens) reported zero cache reads. Those observations falsify the assumption that request acceptance or fixed bytes guarantee a full immediate hit; token length, scheduling, retention and backend routing were not independently isolated. Evidence: `$TMPDIR/codex-cache-parent-final/{verify.mjs,evidence.jsonl,summary.json}`. No unknown fields were added, no wire output cap is supported by that endpoint, and no universal zero-miss claim is made.

## First principles

A cache reuses identical early request bytes; mutable observations belong after stable instructions. A signature authenticates particular reasoning/prefix context; accepting a changed prefix requires supported provider behavior, not signature rewriting. Authority and fresh state cannot be frozen for performance. Conversation history must remain append-only: changing earlier messages to deduplicate them can damage both cache reuse and signed continuity. Deduplication must consult the actual replay branch, not all historical entries. Bounds must reject uncertainty honestly rather than cut out important facts.

False constraints: snapshots need not be SYSTEM instructions; cache retention cannot compensate for changing keys; request acceptance does not prove discounted reuse; a fresh conversation cannot fix a prefix writer that changes again on its second turn.

## Many-of-the-greats: confrontation and decision

### Locality/cache engineering — Hennessy/Patterson lens

Strong claim: preserve the earliest stable prefix; move volatile material to append-only context. It sees repeated context serialization and duplicate packets as both computational and operational waste.

### Security/correctness — Saltzer/Schroeder/Lamport lens

Strong claim: fresh revocation, capability/current-world checks and honest uncertainty dominate cache optimization. It rejects freezing state, preserving unavailable tools, dropping tool/user evidence, or retrying uncertain effects for a benchmark win.

### Evidence — Feynman lens

Strong claim: final request hashes and provider-reported cached usage outrank source intent, mock equality, or successful HTTP status. It rejects a claimed live fix based on a different installation or tests with synthetic signatures.

### Simplicity — Gall/Gabriel lens

Strong claim: a narrow correct stable-prefix boundary beats a framework of provider-specific prompt workarounds. It rejects duplicate full packets per turn and destructive migration of an accepted observer simply to make tests green.

Fundamental confrontation: maximizing hit rate can preserve stale/unsafe authority; maximizing freshness by rewriting the whole prompt can destroy locality and signed continuity. These goals coexist only by separating stable directives from append-only observations and separately qualifying genuine authority/schema changes. Source completion and runtime completion remain irreducibly different evidence stages.

Decision: contextual dominance. Correctness controls semantics and lifecycle; locality controls representation of advisory data; empirical evidence controls claims; simplicity controls implementation size. Not every miss is a defect and not every successful request is an improvement.

## Multi-order effects

- Intended: stable directives + append-only fresh observations -> less avoidable prefix churn, without stale authority.
- Adverse reaction: maximizing cache-hit percentage encourages huge static boilerplate or freezing fresh state -> misleading benchmark success and unsafe decisions. Measure uncached tokens/cost/latency per useful task, not hit ratio alone.
- Initial implementation hazard: append a full packet every prompt -> context/storage growth -> compaction -> cache rebuilding and lost detail. Branch-derived dedup and a32KiB bound damp this feedback.
- Provider fallback hazard: enable drop_block indiscriminately -> incompatible proxy requests or concealed reasoning loss. Scope native controls and preserve explicit error behavior; report unsupported routes honestly.
- Operational delay: replace launcher while old sessions continue -> mixed generations -> an apparent fix that fails on resume. Verify loaded generation and restart only the authorized session; never kill unrelated readers.
- Architectural hazard: retire observation while moving metadata -> lost audit capability -> false absence proofs. Preserve accepted Decision89 functionality until its owner adopts a successor.

## Atomic-completion deferral contracts

| Finding | Hard constraint | Owner | Trigger | Review deadline | Blast radius | AK binding |
|---|---|---|---|---|---|---|
| Opt-in development ontology metadata still changes full system prompt | Accepted Decision89 requires exact append observation; silently changing/removing it breaks an accepted capability | pi-extensions ontology maintainer / Decision89 accountable owner | Accepted message-based observation successor or explicit retirement/migration/rollback decision |2026-10-12| Opt-in10-minute development runs can still incur prompt churn; default path is corrected | AK6847, first-class until-event deferral632 |
| Native controls for non-midconversation models and legacy source activation | Candidate0.84.x source differs from current1.1 launcher;801 pre-existing full-gate errors; replacement could downgrade an unqualified host | pi-mono provider/runtime maintainer | Coherent current source/install admission and passing required baseline/provider gates |2026-10-12| Older running sessions/non-midconversation models may still reject changed prefixes | AK6848, first-class until-event deferral633; candidate/evidence attached to AK6846 |

These are not generic 'later' notes. Neither task creation nor a date authorizes architecture changes, provider installation, publication or terminal closeout. No finding is abandoned; no claim that every possible cache miss is fixed is permitted.
