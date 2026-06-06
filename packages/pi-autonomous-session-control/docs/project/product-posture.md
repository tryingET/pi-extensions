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

- maturity: `internal alpha / execution-seam, typed self-evolution mirror, and trust-tier reflection guard proven`
- current strategic line: self diagnostic clarity, typed self-evolution candidates, session-local outcome feedback, guarded low-risk notifications, continuation/handoff quality, classifier-priority hardening, insight-promotion cues, repeated-reflection guards, external-check trust-tier hardening, execution-runtime parity, cross-package diagnostic-contract parity, and owner-boundary preservation
- release posture: package checks pass; live behavior has dogfooded direct `self -> pi.sendUserMessage` notification after reload, stateless `pi -p` diagnostic probe text visibility, explicit user-message routing with `self-evolution`/`checkpoint` words in the payload, explicit `Remember:` / `Mark as trap:` directives winning over diagnostic/self-evolution keywords in their content, focused regression coverage for ASC-generated `agent_vent action=preview` prefills using the live `packageName` facet with JSON-quoted caller-controlled values, focused regression/live `pi -p` coverage for mirror-only `self.insight_promotion_cue.v1` output including typed status normalization, fail-closed unresolved-promotion behavior, default non-authorization preservation, and explicit owner/target requirements for resolved deferrals, and focused regression plus fresh-process `pi -p` dogfood coverage for mirror-only `self.reflection_guard.v1` output that fails closed on repeated self-analysis until an explicit observed status is paired with a named positive external check signal, rejects negated/failed/required/query-only check prose, rejects bare caller-controlled boolean check claims, fails closed on contradictory observed/failed/unknown signals, normalizes bare required-state validation text to `externalCheckStatus="required"`, and exposes `externalCheckStatus` in operator-visible diagnostic text

## Current landed capability baseline

ASC currently owns:

- `self` as a mirror for touched files, commands, errors, loop/stall cues, context-pressure heuristics, file-budget advisories, handoff summaries, and action-state summaries;
- bounded memory for crystallized patterns, semantic-pressure candidates, traps, checkpoints, and followups;
- diagnostic-review queries such as `dogfood self`, `self-evolution`, and `what friction just happened?`, returning `self.diagnostic_candidate.v1`, `self.evolution_candidate.v1`, mirror-only `self.insight_promotion_cue.v1`, and mirror-only `self.reflection_guard.v1` payloads without durable writes, and omitting `agent_vent` activation/preview/record suggestions when current prompt/context constraints explicitly disallow `agent_vent`;
- session-local self-evolution feedback such as `self feedback: helpful`, `self feedback: wrong-owner`, and `self feedback summary`, returning `self.suggestion_feedback.v1` without writing owner surfaces;
- exact/verbatim visible recall for crystallized patterns when stateless dogfood needs to verify full remembered content from text rather than hidden structured details;
- guarded actions: editor prefill, low-risk `pi.sendUserMessage` notifications, diagnostic-review continuations, and operator-reviewed `agent_vent action=preview` prefills that use the live `packageName` tool facet and JSON-quote caller-controlled fields, with explicit user-message directives winning over diagnostic/action keywords inside the message payload;
- `dispatch_subagent` and the public `createAscExecutionRuntime` seam with prompt-envelope provenance, child extension/skill-profile policy, concurrency/session reservation, timeout/abort handling, and failure taxonomy;
- rewind/recovery behavior and runtime invariants for Pi-side session control.

## Product non-goals

ASC must not become:

- AK task/evidence/decision truth;
- a custom compaction-summary owner — [pi-session-compaction](../../../pi-session-compaction/docs/project/vision.md) owns that;
- a visible-loop launcher — [pi-little-helpers](../../../pi-little-helpers/docs/project/vision.md) owns `/visible-loop` and peer slash surfaces;
- a durable vent/diagnostic store — [pi-agent-vent](../../../pi-agent-vent/docs/project/vision.md) owns recurrence memory;
- a measured experiment/evaluator runtime — [pi-autoresearch](../../../pi-autoresearch/docs/project/vision.md) owns that;
- an above-seam workflow/evidence projector — [pi-society-orchestrator](../../../pi-society-orchestrator/docs/project/vision.md) owns that;
- a hidden manager that mutates owner surfaces from mirror-only evidence.

## Trust gates

A self/ASC recommendation is trustworthy only when:

1. **Mirror scope** — output says when it is session-local and not durable truth.
2. **Owner seam** — suggested actions name the owning package or authority surface.
3. **Risk posture** — low-risk notifications may send; commands, peer launches, compaction, durable records, commits, and owner writes are prefilled or deferred.
4. **Verification** — implementation changes still pass package checks and live reload dogfood when runtime behavior changes.
5. **Stateless dogfood prompt quality** — `pi -p` probes and fresh Ghostty continuation tabs must be prompted as stateless sessions with repo path, package owner, objective, expected behavior, validation, and non-authorizations included explicitly.
6. **No hidden escalation** — diagnostic candidates do not create vent records, AK tasks/evidence, issues, incidents, KES notes, ontology entries, or telemetry.

## Current strategic line

Prioritize self-awareness that reduces operator feedback loops without broadening authority.

The active self-evolution frontier is:

```text
self.evolution_candidate.v1 -> falsifier + metric + owner -> explicit action routing -> visible-loop or measured campaign -> owner-routed learning/evidence
```

ASC now implements the candidate/mirror portion and the first explicit action-routing guards. Execution/evaluation still routes through the owner map in [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md).
That root spine also carries the DRY many-of-the-greats translation; ASC owns only the mirror, candidate, action-routing, feedback, and reflection-guard status surfaces. External validation remains caller/owner-provided evidence, not something ASC infers from reflective query prose.

## Next product bets

### Bet 1 — Typed self-evolution candidate — landed first slice

`self.evolution_candidate.v1` now appears in diagnostic-review details and text output with friction, hypothesis, falsifier, metric, owner, autonomy level, next safe test, non-authorizations, trace, critic lenses, and decision budget. It remains mirror-only and does not write owner surfaces.

This is the first translation of the many-of-the-greats review: make self-improvement Popper-falsifiable, metric-bearing, owner-routed, and explicit about what ASC is not authorized to do.

### Bet 2 — Intent-collision hardening — landed first slice

Diagnostic/self-evolution queries are no longer hijacked by incidental action words such as `checkpoint`. Regression coverage proves dogfood/friction queries remain mirror-only unless the action directive is explicit.

Explicit crystallization/protection directives now also own their payload: `Remember:` and `Mark as trap:` win even when the remembered/trap text mentions `self-evolution`, `diagnostic_review`, or `checkpoint`. Exact/verbatim recall is available for stateless dogfood prompts that must verify stored memory from visible text. The reciprocal action-routing guard remains: explicit `notify operator` / `send user message:` directives win even when their payload mentions `self-evolution`, `checkpoint`, or other diagnostic/action words; risky directive and likely-secret gates still apply.

### Bet 3 — PDCA/OODA trace for nontrivial recommendations — landed first slice

Expose the compact trace behind self-improvement suggestions:

```text
observe -> orient -> decide -> act/defer -> check
plan -> do -> check -> act/adopt/reject
```

The trace should name the evidence seen, owner/boundary rule applied, chosen next move, action level, and check signal without turning ASC into a visible-loop launcher, evaluator, or durable authority.

### Bet 4 — Outcome feedback — landed first slice

ASC now has a bounded session-local feedback ledger for self suggestions: helpful, ignored, stale, wrong-owner, unsafe. Feedback returns `self.suggestion_feedback.v1`, exposes counts through `self feedback summary`, and explicitly states that no `agent_vent`, AK/evidence, KES, ontology, Prompt Vault, visible-loop, measured-campaign, issue, incident, or telemetry state was written.

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

The decision-budget fields remain on `self.evolution_candidate.v1`; the reflection guard supplies the closeout brake when analysis risks becoming self-ratifying. The latest hardening makes the status legible as well as fail-closed: operator-visible diagnostic text includes `externalCheckStatus`, bare required/pending/missing validation text normalizes to `required`, failed/blocked/incomplete text normalizes to `failed`, bare caller-controlled booleans are ignored, free-form positive check prose alone is insufficient, contradictory observed/failed/unknown signals resolve to a failed external-check status, successful `no regressions` wording is not treated as negation, and query-only success wording still cannot satisfy the guard. Provenance-bearing check evidence is now visible too: `self.reflection_guard.v1` exposes the positive named check signal, command/artifact provenance count, and missing-provenance cue so closeout can cite owner-appropriate verification instead of relying on reflective status alone. When the guard requires an external check, diagnostic-review suggestions now prioritize the concrete check/scout/stop path and suppress `agent_vent` activation/preview/record suggestions until check evidence exists. Session-local successful validation commands can now fill missing check provenance when the caller has already supplied the explicit observed status plus named positive check signal; this remains mirror-only provenance, not an owner evidence write. Future slices may improve typed aliases, but unresolved repetition must stay required-before-completion until an explicit positive external check is named and backed by owner-appropriate check provenance.

### Bet 8 — Insight promotion cue — landed first slice

When self or a subagent produces valuable analysis that only exists in session history, ASC now surfaces that as a propagation risk through `self.insight_promotion_cue.v1` inside diagnostic/self-evolution responses:

```text
session-only insight -> owner surface? -> promoted | explicitly deferred | lost-risk
```

The cue names source artifact, typed status, owner/target, required-before-completion, risk, next action, and non-authorizations. It defaults to `session_only_unpromoted` so loop closeout must promote the durable portion or explicitly defer it with owner/target and reason before claiming product-posture alignment. Explicit `promoted` context resolves only to a verification cue; explicit `explicitly_deferred` resolves only when a defer reason and explicit owner/target are present. Caller-provided completion overrides cannot downgrade unresolved promotion requirements, and caller-provided `nonAuthorizations` are merged with ASC's default guardrails instead of replacing them.

ASC still does not write owner docs itself unless the operator asked for that mutation and the owner surface is in scope. It only makes the missing promotion visible before a loop declares docs alignment complete. The main remaining gap is ergonomic rather than authority: future slices may add typed aliases or richer cue text, but they must preserve unknown/unresolved statuses as required-before-completion until an owner surface is promoted or an explicit owner/target plus reason is deferred.

### Bet 9 — Cross-package diagnostic contract parity — landed first slice

ASC-generated `agent_vent action=preview` commands now align with the live `agent_vent` schema by emitting `packageName` instead of the stale `package` facet. Focused regression coverage proves operator-reviewed diagnostic-record prefills stay preview-only, do not send hidden messages, omit `action: "record"`, avoid the legacy `package:` tool-call field, and JSON-quote caller-controlled summary/package values so copied commands do not become injection or schema-drift hazards.

The boundary remains unchanged: ASC suggests or prefills candidate payloads only. Toolbox still owns capability activation, and `pi-agent-vent` still owns preview validation, durable local vent records, recurrence review, redaction, and retention.
