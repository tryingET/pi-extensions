---
summary: "Product posture for pi-session-compaction: custom compaction summaries, compact-focus, and fresh-session handoff prompts."
read_when:
  - "Before choosing the next pi-session-compaction product or implementation slice."
  - "When aligning compaction, handoff, reload, self-evolution, or visible-loop continuity work."
type: "reference"
system4d:
  container: "Package-local product posture for compaction continuity."
  compass: "Make fresh-session continuity reliable while preserving owner boundaries and avoiding double-compaction."
  engine:
    invariants:
      - "One custom compaction owner only."
      - "Summary/handoff content is continuity context, not canonical authority."
      - "ASC/self can contribute mirror cues but not own canonical compaction shape."
  fog:
    risks:
      - "Compaction summaries can overclaim truth after reload."
      - "Prompt/handoff shape can drift between ASC and compaction packages."
      - "Visible-loop/self-evolution runs can lose intent if compaction does not preserve the right packet."
---

# Product posture — `pi-session-compaction`

## Vision relation

The package north star lives in [vision.md](./vision.md). This posture file states the current product promise, maturity, trust gates, boundaries, and next bets.

For cross-package recursive-improvement routing, use the root [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md).

## Product promise

`pi-session-compaction` preserves enough truthful context across compaction/reload that an agent can continue without inventing state or re-asking the operator unnecessarily.

Short form:

```text
compact the conversation into a truthful continuation packet
```

## Primary users

- Operators who need compaction/reload not to erase intent.
- Agents resuming work after compaction or a fresh session.
- Visible-loop/self-evolution workflows that need continuity packets between iterations.
- ASC/self and other packages that need a canonical handoff prompt owner rather than duplicating prompt shape.

## Current product maturity

- maturity: `live compaction owner / internal alpha`
- current strategic line: single-owner compaction, focused handoff prompts, reload-safe continuity, and no double-compaction
- release posture: live package exposes `session_before_compact`, `/compact-focus`, `/compact-handoff`, and `session_compaction_handoff`; package checks should be run after changes

## Current landed capability baseline

The package currently owns:

- live `session_before_compact` handler registration behind fail-closed guards;
- input tracking for preserving slash commands and prompt context;
- model and preset resolution for custom summaries;
- files-touched manifests and essential prompt preservation;
- `/compact-focus` for selected compaction intent;
- `/compact-handoff` and `session_compaction_handoff` as the canonical fresh-session handoff prompt shape;
- fallback/cancel behavior when custom summarization cannot legally proceed;
- non-live branch-tree summary augmentation helpers.

## Product non-goals

`pi-session-compaction` must not become:

- an ASC/self mirror replacement;
- a visible-loop executor;
- a campaign/evaluator runtime;
- a durable diagnostic or learning store;
- an AK/KES/evidence/ontology writer;
- a second custom compaction owner alongside another installed override;
- a source of truth beyond continuity context.

## Trust gates

A compaction/handoff output is trustworthy only when:

1. **Single owner** — no other custom compaction override is active.
2. **Continuity scope** — output says what is done, in progress, unverified, blocked, and next.
3. **Source humility** — summaries point fresh sessions back to git, AK, package docs, and owner surfaces for truth.
4. **Prompt preservation** — essential user prompts and slash commands survive when needed.
5. **No hidden action** — compaction does not launch peers, execute visible loops, write evidence, record vents, or mutate tasks.
6. **Reload posture** — after install, `/reload` and live observation are required before claiming the active session uses the new handler.

## Current strategic line

Prioritize continuity quality over more automation.

For visible self-evolution, this package should ensure the compaction packet preserves:

```text
objective -> self-evolution candidate -> owner map -> current validation -> next safe action -> non-authorizations
```

It should not execute that next action itself.

## Next product bets

### Bet 1 — Self-evolution handoff clarity

Ensure `/compact-handoff` and `session_compaction_handoff` preserve typed self-evolution candidates, owner seams, falsifiers, metrics, validation status, and next safe test without making ASC or compaction the authority.

### Bet 2 — Visible-loop continuity packet

When `/visible-loop` or `/nexus-loop` work is active, preserve visible-loop run id, iteration, prompt queue posture, checkpoint/completion state, child report-back posture, and exact non-authorizations.

### Bet 3 — Valuable session-output preservation

Compaction and handoff summaries should distinguish ordinary transcript detail from strategic session-only insight that must survive reload: subagent findings, deep-review conclusions, many-of-the-greats lenses, operator corrections, falsifiers, metrics, owner routes, and non-authorizations.

The summary should say whether those insights were promoted into an owner surface, still need promotion, or were intentionally deferred. It must not imply that JSONL or compaction text is durable authority by itself.

### Bet 4 — Drift checks against ASC/self

Keep ASC/self handoff convenience text and compaction-owned handoff prompt shape aligned through docs/tests, while preserving the boundary that compaction owns canonical summary shape.

### Bet 4 — Live compaction dogfood

After behavior changes, install, reload, and observe a real compaction or handoff command before claiming active-session proof.
