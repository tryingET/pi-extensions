---
summary: "Product posture for pi-autonomous-session-control: session mirror, execution seam, self diagnostics, and guarded action affordances."
read_when:
  - "Before choosing the next ASC/self, dispatch_subagent, rewind, or self-evolution implementation slice."
  - "When deciding whether a capability belongs in ASC/self, pi-session-compaction, pi-little-helpers, agent_vent, pi-autoresearch, or pi-society-orchestrator."
type: "reference"
system4d:
  container: "Package-local product posture for Pi-side autonomous session control."
  compass: "Improve agent self-awareness and execution reliability without making ASC durable authority or a generic orchestrator."
  engine:
    invariants:
      - "ASC/self mirrors session-local evidence and routes safe actions."
      - "Execution helpers stay bounded, typed, and fail-closed."
      - "Durable diagnostics, compaction, visible loops, empirical proof, and evidence projection stay with their owners."
  fog:
    risks:
      - "A mirror can be mistaken for task/evidence truth."
      - "Convenient self actions can bypass operator or owner gates."
      - "ASC can accidentally absorb compaction, visible-loop, orchestration, or diagnostic-store ownership."
---

# Product posture — `pi-autonomous-session-control`

## Vision relation

The package north star lives in [vision.md](./vision.md). This posture file states the current product promise, maturity, boundaries, and next bets for ASC/self.

For cross-package recursive-improvement routing, use the root [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md).

## Product promise

ASC makes Pi agents more self-aware and operationally reliable by exposing a session mirror, bounded execution seams, guarded recovery, and low-risk action affordances.

Short form:

```text
see the session; route the next move; keep authority elsewhere
```

## Primary users

- Pi agents checking what they actually did before continuing.
- Operators who need concise handoff, loop, and friction summaries.
- Package/orchestrator code that needs the supported ASC execution runtime instead of private imports.
- Self-evolution workflows that need diagnostic candidates and safe action routing before visible-loop or measured-campaign execution.

## Current product maturity

- maturity: `internal alpha / execution-seam, typed self-evolution mirror, and UI-aware guarded action delivery proven`
- current strategic line: self diagnostic clarity, typed self-evolution candidates, session-local outcome feedback, guarded low-risk notifications, continuation/handoff quality, classifier-priority hardening, fail-closed insight-promotion closeout cues, repeated-reflection guards, external-check trust-tier hardening, branch-local machine-readable live-runtime proof, execution-runtime parity, cross-package diagnostic-contract parity, UI/no-UI action-delivery truthfulness, validation-cleanup resilience, nested visible-loop prevention, and owner-boundary preservation
- release posture: package checks pass; live behavior has dogfooded direct `self -> pi.sendUserMessage` notification after reload, stateless `pi -p` diagnostic probe text visibility, explicit user-message routing with `self-evolution`/`checkpoint` words in the payload, slash-command-looking operator notifications failing closed to UI-aware `operator_submit_required` editor prefill or no-UI `operator_manual_submit_required` copy/submit instructions instead of hidden `pi.sendUserMessage` injection, action delivery details now exposing actual `prefillPerformed` / `userMessageSent` state for guarded action routes, absolute-path status such as `/tmp` staying a low-risk notification instead of a false slash-command route, explicit `Remember:` / `Mark as trap:` directives winning over diagnostic/self-evolution keywords in their content, focused regression coverage for ASC-generated `agent_vent action=preview` prefills using the live `packageName` facet with JSON-quoted caller-controlled values, focused regression/live `pi -p` coverage for mirror-only `self.insight_promotion_cue.v1` output including typed status normalization, fail-closed unresolved-promotion behavior, default non-authorization preservation, explicit owner/target requirements for resolved deferrals, explicit promotion target plus provenance-source requirements for resolved `promoted` claims, single-line sanitized closeout cue text, retry-backed cleanup of package runtime temp directories, package `npm run check`, focused self tests, and docs strict checks, focused regression plus fresh-process `pi -p` dogfood coverage for mirror-only `self.reflection_guard.v1` output that fails closed on repeated self-analysis until an explicit observed status is paired with a named positive external check signal, rejects negated/failed/required/query-only check prose, rejects bare caller-controlled boolean check claims, fails closed on contradictory observed/failed/unknown signals, normalizes bare required-state validation text to `externalCheckStatus="required"`, and exposes `externalCheckStatus` in operator-visible diagnostic text, and focused regression plus fresh-process `pi -p` coverage for `self.live_runtime_proof_guard.v1` including wrong-owner install rejection, unordered receipt rejection, objective-claim detection, visible `proofSequenceStatus`, visible `ownerBindingFailures`, slash `/reload completed` receipt recognition, spoofed `source: "session.*"` rejection through typed evidence origins, lifecycle/caller order-domain fail-closed behavior, package `npm run check`, `pi install`, and owner-bound ordered positive proof
- live-runtime ledger posture: the implementation now records exact successful package-check/install tool executions at finalized `tool_execution_end`, reconstructs bounded typed receipts from the active Pi session branch after reload/tree navigation, records host reload, and requires an explicit `dogfood self: live runtime proof probe` result followed by a later status query. Caller-selected owners and caller receipts cannot satisfy non-host tiers. Each tier and later status read recompute a bounded runtime-source fingerprint; source drift, observed package `write`/`edit` calls, and non-reload session starts invalidate an active run. These receipts are local session mirrors, not tamper-evident or canonical evidence; another local extension/process with equivalent permissions remains outside this guard's security boundary.

## Current landed capability baseline

ASC currently owns:

- `self` as a mirror for touched files, commands, errors, latest operator intent/current objective cues, loop/stall cues, context-pressure heuristics, file-budget advisories, handoff summaries, and action-state summaries;
- bounded memory for crystallized patterns, semantic-pressure candidates, traps, checkpoints, followups, and fresh same-cwd `self.continuation_candidate.v1` entries, plus mirror-only `self.memory_lifecycle_status.v1` visibility into last load status and scoped counts;
- diagnostic-review queries such as `dogfood self`, `self-evolution`, and `what friction just happened?`, returning `self.diagnostic_candidate.v1`, `self.evolution_candidate.v1`, mirror-only `self.insight_promotion_cue.v1`, mirror-only `self.reflection_guard.v1`, and mirror-only `self.live_runtime_proof_guard.v1` payloads without durable writes, and omitting `agent_vent` activation/preview/record suggestions when current prompt/context constraints explicitly disallow `agent_vent` or reflection requires an external check;
- session-local self-evolution feedback such as `self feedback: helpful`, `self feedback: wrong-owner`, and `self feedback summary`, returning `self.suggestion_feedback.v1` without writing owner surfaces;
- exact/verbatim visible recall for crystallized patterns when stateless dogfood needs to verify full remembered content from text rather than hidden structured details;
- guarded actions: editor prefill, low-risk `pi.sendUserMessage` notifications, diagnostic-review continuations, operator-submitted Level-4 `/visible-loop --count 1 --delegate-commit` prefills for self-evolution routing, explicit Level-4 owner-bridge launches through the pi-little-helpers `/visible-loop` bridge, nested visible-loop launch deferral when a visible-loop child asks to continue self-evolution (the controller should launch one `/visible-loop --count N --delegate-commit` run for serial iterations), operator-submitted Level-5 `/autoresearch ...` prefills for measured campaign routing, explicit Level-5 `/autoresearch ...` launch requests that still prefill the slash command for operator submission through Pi's slash parser, safe continuation aliases (`continue safely`, `next autonomous step`) over the existing suggested-next-move membrane, fresh same-cwd explicit continuation candidates winning over stale mirror-derived next moves after reload/compaction, and operator-reviewed `agent_vent action=preview` prefills that use the live `packageName` tool facet and JSON-quote caller-controlled fields, with explicit user-message directives winning over diagnostic/action keywords inside the message payload;
- `dispatch_subagent` and the public `createAscExecutionRuntime` seam with prompt-envelope provenance, child extension/skill-profile policy, concurrency/session reservation, timeout/abort handling, and failure taxonomy;
- rewind/recovery behavior and runtime invariants for Pi-side session control.

## Product non-goals

ASC must not become:

- AK task/evidence/decision truth;
- a custom compaction-summary owner — [pi-session-compaction](../../../pi-session-compaction/docs/project/vision.md) owns that;
- a visible-loop implementation owner — [pi-little-helpers](../../../pi-little-helpers/docs/project/vision.md) owns `/visible-loop`, peer slash surfaces, and the extension-originated `/visible-loop` bridge;
- a durable vent/diagnostic store — [pi-agent-vent](../../../pi-agent-vent/docs/project/vision.md) owns recurrence memory;
- a measured experiment/evaluator runtime — [pi-autoresearch](../../../pi-autoresearch/docs/project/vision.md) owns that and the `/autoresearch` slash-command parser;
- an above-seam workflow/evidence projector — [pi-society-orchestrator](../../../pi-society-orchestrator/docs/project/vision.md) owns that;
- a hidden manager that mutates owner surfaces from mirror-only evidence.

## Trust gates

A self/ASC recommendation is trustworthy only when:

1. **Mirror scope** — output says when it is session-local and not durable truth.
2. **Owner seam** — suggested actions name the owning package or authority surface.
3. **Risk posture** — low-risk notifications may send, including status text about compaction/reload; actual commands, peer launches, compaction commands, durable records, commits, and owner writes are prefilled or deferred. Slash-command routes such as `/visible-loop` and `/autoresearch` default to operator submission through Pi's slash-command parser; explicit launch directives may send the whole slash command only to the owning package's narrow extension bridge. ASC reports whether editor prefill or user-message delivery actually happened. Delivery-state fields are mirror/runtime receipts, not proof that an owner command completed. Active live behavior claims require separate owner-bound, ordered package-check, install, reload, and post-reload `self` dogfood proof tiers in `self.live_runtime_proof_guard.v1`.
4. **Verification** — implementation changes still pass package checks and live reload dogfood when runtime behavior changes; validation-wrapper flakes such as leftover `.tmp-self-tests` cleanup are product reliability issues, not harmless CI noise.
5. **Stateless dogfood prompt quality** — `pi -p` probes and fresh Ghostty continuation tabs must be prompted as stateless sessions with repo path, package owner, objective, expected behavior, validation, and non-authorizations included explicitly.
6. **No hidden escalation** — diagnostic candidates do not create vent records, AK tasks/evidence, issues, incidents, KES notes, ontology entries, or telemetry.

## Current strategic line

Prioritize self-awareness that reduces operator feedback loops without broadening authority.

The active self-evolution frontier is:

```text
self.evolution_candidate.v1 + candidateId -> execution-ready gate -> candidate-bound visible implementation and/or measured evaluation -> host-observed verification -> bound feedback -> owner-routed learning/evidence
```

ASC now assigns each candidate a bounded session-local id, scopes candidate/feedback ledgers to the active session/tree, distinguishes caller claims from host-observed or validation-corroborated evidence, allowlists self-evolution owner routes, and carries candidate identity into explicit action routes. Exact continuation aliases prefill `/visible-loop ... --candidate <id>`; pi-little-helpers resolves the correlated self tool result, requires a canonical typed owner artifact bound to that candidate/owner, and owns the execution envelope/config and host-correlated closeout gate. Autoresearch prefills carry only the same candidate id, owner, and typed owner-artifact path instead of raw candidate prose or a hard-coded benchmark. Missing, invented, caller-claim-only, unknown-owner, stale-session, nested-loop, reflection-blocked, multiline/directional, instruction-like, or unresolved-promotion routes fail closed without prefill or hidden launch; pi-little-helpers additionally rejects missing, mismatched, symlinked, stale, or cross-session artifact/config launch inputs. Execution/evaluation still routes through the owner map in [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md).
That root spine also carries the DRY many-of-the-greats translation; ASC owns only the mirror, candidate, action-routing, feedback, reflection-guard, and live-runtime proof-status surfaces. External validation and active runtime behavior remain caller/owner-provided evidence, not something ASC infers from reflective query prose or install/reload text alone.

## Next product bets

### Bet 1 — Typed self-evolution candidate — landed first slice

`self.evolution_candidate.v1` now appears in diagnostic-review details and text output with candidate id, evidence readiness/confidence, friction, hypothesis, falsifier, metric, owner, autonomy level, next safe test, non-authorizations, trace, critic lenses, decision budget, and closeout guards. Candidates are retained only in a bounded session-local mirror ledger; no owner surface is written.

This is the first translation of the many-of-the-greats review: make self-improvement Popper-falsifiable, metric-bearing, owner-routed, and explicit about what ASC is not authorized to do.

### Bet 2 — Intent-collision hardening — landed first slice

Diagnostic/self-evolution queries are no longer hijacked by incidental action words such as `checkpoint`. Mutating/sending self-evolution actions now require anchored directive shapes; negated or quoted `notify operator`, launch, and diagnostic-record prose cannot trigger action routing. Regression coverage proves dogfood/friction queries remain mirror-only unless the action directive is explicit.

Explicit crystallization/protection directives now also own their payload: `Remember:` and `Mark as trap:` win even when the remembered/trap text mentions `self-evolution`, `diagnostic_review`, or `checkpoint`. Exact/verbatim recall is available for stateless dogfood prompts that must verify stored memory from visible text. The reciprocal action-routing guard remains: explicit `notify operator` / `send user message:` directives win even when their payload mentions `self-evolution`, `checkpoint`, or other diagnostic/action words; risky directive and likely-secret gates still apply.

### Bet 3 — PDCA/OODA trace for nontrivial recommendations — landed first slice

Expose the compact trace behind self-improvement suggestions:

```text
observe -> orient -> decide -> act/defer -> check
plan -> do -> check -> act/adopt/reject
```

The trace should name the evidence seen, owner/boundary rule applied, chosen next move, action level, and check signal without turning ASC into a visible-loop launcher, evaluator, or durable authority.

### Bet 4 — Outcome feedback — landed first slice

ASC now has a bounded session-local feedback ledger for self suggestions: helpful, ignored, stale, wrong-owner, unsafe. Feedback uses an anchored outcome label, auto-binds to the latest emitted candidate when appropriate, rejects invented candidate ids, and returns `self.suggestion_feedback.v1` with explicit bound state. Counts remain available through `self feedback summary`; no `agent_vent`, AK/evidence, KES, ontology, Prompt Vault, visible-loop, measured-campaign, issue, incident, or telemetry state is written.

This is intentionally lighter than durable recurrence memory: if repeated feedback becomes useful enough to preserve, route it through `agent_vent` preview/record or the owning evidence/learning surface explicitly.

### Bet 5 — Autonomy-level membrane — landed first slice

Make the Brooks/subsumption layer explicit in self outputs:

```text
observe -> suggest -> prefill -> low-risk notify -> visible-loop -> bounded campaign -> durable owner mutation
```

ASC may observe, suggest, prefill, and send low-risk notifications. Visible loops, measured campaigns, durable writes, evidence, tasks, ontology, KES, and recurrence records stay with their owners.

### Bet 6 — Specialist critic lenses — landed first slice

Add lightweight internal critic fields for high-impact diagnostic recommendations:

- owner-boundary critic;
- evidence sufficiency critic;
- operator-friction critic;
- validation critic;
- owner-routing critic.

These are explanation lenses, not spawned peers by default. Escalate to `/scoutpeer`, `/visible-loop`, or `dispatch_subagent` only when the owner/risk/metric remains ambiguous and the operator or owning surface authorizes that path.

### Bet 7 — Decision budget and reflection guard — landed first slice

For nontrivial self-analysis, include expected cost, uncertainty, reversibility, and a good-enough stop condition. Diagnostic/self-evolution responses now include mirror-only `self.reflection_guard.v1`: repeated self-analysis without an explicit observed status paired with a named positive external check signal stays `external_check_required`, routes to a concrete check, scout/deep review, focused regression, or stop, and ignores caller completion overrides. Required, failed, negated, unknown, and query-only check prose stays unresolved; only the paired trust-tier signal resolves to `external_check_observed`, while still forbidding hidden peer/visible-loop/campaign launches and durable owner writes.

The decision-budget fields remain on `self.evolution_candidate.v1`; the reflection guard supplies the closeout brake when analysis risks becoming self-ratifying. The latest hardening makes the status legible as well as fail-closed: operator-visible diagnostic text includes `externalCheckStatus`, bare required/pending/missing validation text normalizes to `required`, failed/blocked/incomplete text normalizes to `failed`, bare caller-controlled booleans are ignored, free-form positive check prose alone is insufficient, contradictory observed/failed/unknown signals resolve to a failed external-check status, successful `no regressions` wording is not treated as negation, and query-only success wording still cannot satisfy the guard. Current-session Pi reload lifecycle events are now tracked as machine-readable mirror evidence for the reload tier only; non-reload starts are ignored, slash-command receipts such as `/reload completed` are recognized, caller-provided `source: "session.*"` text cannot become trusted session origin, reload alone cannot prove active behavior, and mixed caller sequence plus host timestamp ordering remains unresolved until one order-token domain is supplied. Provenance-bearing check evidence is now visible too: `self.reflection_guard.v1` exposes the positive named check signal, command/artifact provenance count, and missing-provenance cue so closeout can cite owner-appropriate verification instead of relying on reflective status alone. When the guard requires an external check, diagnostic-review suggestions now prioritize the concrete check/scout/stop path and suppress `agent_vent` activation/preview/record suggestions until check evidence exists. Session-local successful validation commands can fill missing check provenance when the caller has supplied the explicit observed status plus named positive check signal; this remains mirror-only provenance, not an owner evidence write. Diagnostic continuation no longer sends an imperative recursive follow-up, and every candidate-bound visible-loop/autoresearch route checks the reflection guard before prefill or owner-bridge delivery. Unresolved repetition therefore remains required-before-completion instead of bypassing the guard through a second action path.

### Bet 8 — Insight promotion cue — landed first slice

When self or a subagent produces valuable analysis that only exists in session history, ASC now surfaces that as a propagation risk through `self.insight_promotion_cue.v1` inside diagnostic/self-evolution responses:

```text
session-only insight -> owner surface? -> promoted | explicitly deferred | lost-risk
```

The cue names source artifact, typed status, owner/target, required-before-completion, risk, next action, and non-authorizations. It defaults to `session_only_unpromoted` so loop closeout must promote the durable portion or explicitly defer it with owner/target and reason before claiming product-posture alignment. Explicit `promoted` context resolves only to a verification cue; explicit `explicitly_deferred` resolves only when a defer reason and explicit owner/target are present. Caller-provided completion overrides cannot downgrade unresolved promotion requirements, and caller-provided `nonAuthorizations` are merged with ASC's default guardrails instead of replacing them.

ASC still does not write owner docs itself unless the operator asked for that mutation and the owner surface is in scope. It only makes the missing promotion visible before a loop declares docs alignment complete. The latest ergonomic hardening makes the cue more visible in diagnostic-review text by naming owner, target, risk, next action, and non-authorization count alongside status and required-before-completion, so closeout does not depend on hidden response details. Promotion/defer fields are now treated as caller-controlled closeout claims: visible cue text is single-line sanitized, `promoted` resolves only with an explicit promotion target plus provenance source, and incomplete `promoted`/`explicitly_deferred` claims stay required-before-completion. The live-runtime proof hardening slice is now landed as `self.live_runtime_proof_guard.v1`: package checks, `pi install`, `/reload`, and post-reload `self` dogfood are separate owner-bound and ordered proof tiers; install-only, wrong-owner, unordered, reload-only, caller-prose-only, and missing dogfood claims fail closed before active behavior is claimed. It also preserves the distinction between wrapper reliability debt and product code debt: temp-cleanup flakes are fixed in `scripts/quality-gate.sh`, while the broader file-budget overages remain intentionally deferred through AK task `3506` / deferral `155` rather than hidden in session prose. This loop closes the prior machine-readability gap with a branch-local `asc.live_runtime_proof_event.v1` ledger. The accepted first-slice command surface is deliberately narrow: canonical-package `npm run check`, canonical-path `pi install <package-root>`, Pi `session_start(reason=reload)`, and the exact `dogfood self: live runtime proof probe` tool result. The probe cannot certify itself; only a later `self` status query can observe the completed four-tier run. Finalized tool input/result state is used, caller owner overrides and caller receipts cannot satisfy non-host tiers, `/tree` reconstructs from the active branch, and long unrelated histories do not evict ledger events before filtering. A bounded hash of the package manifest and shipped runtime source is bound to every tier and recomputed on later status reads, so Bash/external source drift as well as observed package `write`/`edit` calls invalidates the run; non-reload startup/resume/new/fork also invalidates stale proof.

The ledger remains a mirror-only closeout aid, not an evidence writer, reload executor, release gate, or cryptographic attestation. Pi custom session entries are branch-replayable but locally forgeable/editable by another extension or process with equivalent permissions, so output names `provenanceTrust=local_session_mirror_not_tamper_evident`. Automated new-instance reconstruction and adversarial tests prove the implementation seam; this posture does not claim a real operator `/reload` activation receipt for the current source revision until that live step is performed. The next frontier should be selected from actual live two-query dogfood friction after activation rather than inventing another proof classifier in advance.

### Bet 9 — Cross-package diagnostic contract parity — landed first slice

ASC-generated `agent_vent action=preview` commands now align with the live `agent_vent` schema by emitting `packageName` instead of the stale `package` facet. Focused regression coverage proves operator-reviewed diagnostic-record prefills stay preview-only, do not send hidden messages, omit `action: "record"`, avoid the legacy `package:` tool-call field, and JSON-quote caller-controlled summary/package values so copied commands do not become injection or schema-drift hazards.

The boundary remains unchanged: ASC suggests or prefills candidate payloads only. Toolbox still owns capability activation, and `pi-agent-vent` still owns preview validation, durable local vent records, recurrence review, redaction, and retention.

### Bet 10 — Latest-intent mirror — landed first slice

`self` handoff and current-objective queries now include a mirror-only latest operator intent/current objective cue when supplied by caller context. This reduces stale handoffs and wrong-slice continuation without making ASC the task authority. The self-contained handoff prompt also includes a pi-session-compaction-owned `session_compaction_handoff(...)` call shape so ASC mirror cues can flow into the canonical continuity owner without ASC owning compaction. The cue explicitly remains non-authoritative: fresh sessions must still verify transcript, git, AK, and owner surfaces before acting. Direct session-history inference stays deferred until Pi exposes a branch-current operator-intent surface that cannot confuse abandoned branches or extension-injected custom messages with user intent.
