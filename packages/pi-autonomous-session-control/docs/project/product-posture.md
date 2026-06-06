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

- maturity: `internal alpha / execution-seam and self-mirror proven`
- current strategic line: self diagnostic clarity, guarded low-risk notifications, continuation/handoff quality, execution-runtime parity, and owner-boundary preservation
- release posture: package checks pass; live behavior has dogfooded direct `self -> pi.sendUserMessage` notification after reload

## Current landed capability baseline

ASC currently owns:

- `self` as a mirror for touched files, commands, errors, loop/stall cues, context-pressure heuristics, file-budget advisories, handoff summaries, and action-state summaries;
- bounded memory for crystallized patterns, semantic-pressure candidates, traps, checkpoints, and followups;
- diagnostic-review queries such as `dogfood self`, `self-evolution`, and `what friction just happened?`, returning candidate diagnostics without durable writes;
- guarded actions: editor prefill, low-risk `pi.sendUserMessage` notifications, diagnostic-review continuations, and operator-reviewed `agent_vent action=preview` prefills;
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

The next self-evolution frontier is:

```text
self.evolution_candidate.v1 -> falsifier + metric + owner -> visible-loop or measured campaign -> owner-routed learning/evidence
```

ASC should implement the candidate/mirror portion and route execution/evaluation through the owner map in [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md).
That root spine also carries the DRY many-of-the-greats translation; ASC owns only the mirror, candidate, action-routing, and feedback parts of that model.

## Next product bets

### Bet 1 — Typed self-evolution candidate

Add a stable `self.evolution_candidate.v1` diagnostic shape with friction, hypothesis, falsifier, metric, owner, autonomy level, next safe test, and non-authorizations.

This is the first translation of the many-of-the-greats review: make self-improvement Popper-falsifiable, metric-bearing, owner-routed, and explicit about what ASC is not authorized to do.

### Bet 2 — Intent-collision hardening

Diagnostic/self-evolution queries must not be hijacked by incidental action words such as `checkpoint`. Add regression coverage so dogfood/friction queries remain mirror-only unless the action directive is explicit.

### Bet 3 — PDCA/OODA trace for nontrivial recommendations

Expose the compact trace behind self-improvement suggestions:

```text
observe -> orient -> decide -> act/defer -> check
plan -> do -> check -> act/adopt/reject
```

The trace should name the evidence seen, owner/boundary rule applied, chosen next move, action level, and check signal without turning ASC into a visible-loop launcher, evaluator, or durable authority.

### Bet 4 — Outcome feedback

Add a small feedback path for self suggestions: helpful, stale, wrong-owner, unsafe, ignored. Keep it mirror/local unless deliberately recorded through `agent_vent` or another owner surface.

### Bet 5 — Autonomy-level membrane

Make the Brooks/subsumption layer explicit in self outputs:

```text
observe -> suggest -> prefill -> low-risk notify -> visible-loop -> bounded campaign -> durable owner mutation
```

ASC may observe, suggest, prefill, and send low-risk notifications. Visible loops, measured campaigns, durable writes, evidence, tasks, ontology, KES, and recurrence records stay with their owners.

### Bet 6 — Specialist critic lenses

Add lightweight internal critic fields for high-impact diagnostic recommendations:

- owner-boundary critic;
- evidence sufficiency critic;
- operator-friction critic;
- validation critic;
- owner-routing critic.

These are explanation lenses, not spawned peers by default. Escalate to `/scoutpeer`, `/visible-loop`, or `dispatch_subagent` only when the owner/risk/metric remains ambiguous and the operator or owning surface authorizes that path.

### Bet 7 — Decision budget and reflection guard

For nontrivial self-analysis, include expected cost, uncertainty, reversibility, and a good-enough stop condition. Detect repeated self-analysis without external validation and route to a concrete check, scout/deep review, or stop instead of continuing philosophical reflection.

### Bet 8 — Insight promotion cue

When self or a subagent produces valuable analysis that only exists in session history, ASC should surface that as a propagation risk:

```text
session-only insight -> owner surface? -> promoted | explicitly deferred | lost-risk
```

ASC should not write the owner docs itself unless the operator asked for that mutation and the owner surface is in scope. It should, however, make the missing promotion visible before a loop declares docs alignment complete.

### Bet 9 — Cross-package diagnostic contract parity

Keep ASC-generated `agent_vent action=preview` commands aligned with the live `agent_vent` schema and toolbox activation path without letting ASC write vent records internally.
