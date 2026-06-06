---
summary: "North-star vision for pi-session-compaction as the single owner of custom compaction and fresh-session handoff summaries."
read_when:
  - "Defining or revisiting pi-session-compaction direction."
  - "Changing /compact-focus, /compact-handoff, session_before_compact, or fresh-session handoff behavior."
  - "Deciding whether compaction behavior belongs in pi-session-compaction or ASC/self."
type: "reference"
system4d:
  container: "Package-local north-star direction for custom Pi session compaction."
  compass: "Preserve continuity across compaction/reload without making summaries into canonical authority."
  engine:
    invariants:
      - "Exactly one custom session_before_compact owner should be active."
      - "Compaction summaries preserve objective, constraints, decisions, status, next steps, touched files, and essential prompts."
      - "Fresh-session handoff shape belongs here; ASC/self may provide mirror cues only."
  fog:
    risks:
      - "Multiple compaction owners can produce conflicting summaries."
      - "A summary can be mistaken for git, AK, evidence, or package truth."
      - "ASC/self can drift into owning canonical handoff prompts by convenience."
---

# Vision — `pi-session-compaction`

## North star

`pi-session-compaction` should be the single, reliable continuity layer for Pi compaction and fresh-session handoff prompts.

Short form:

```text
preserve continuity; do not create authority
```

The package should make compaction and reload survivable by carrying forward the smallest truthful packet of objective, constraints, decisions, status, next steps, touched files, and essential prompts. It should not become task truth, evidence truth, execution orchestration, or a replacement for owner-specific docs and databases.

## Self-evolution role

Self-evolution loops put unusual pressure on context continuity. This package owns the compaction/handoff part of that loop:

- `session_before_compact` summary shape;
- `/compact-focus` focused compaction instructions;
- `/compact-handoff` and `session_compaction_handoff` fresh-session prompt shape;
- preservation of user prompts, slash commands, touched-file manifests, and status packets needed after reload.

It does not own ASC/self diagnostics, `/visible-loop`, measured candidate evaluation, agent_vent recurrence memory, orchestrator evidence projection, or durable AK/KES/ontology truth.
Use the root [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md) for the DRY owner map.

## Desired end-state behavior

A mature compaction/handoff flow should:

1. preserve the current objective and latest explicit user intent;
2. distinguish facts, inferences, decisions, rejected paths, done/in-progress/unverified/blocked state;
3. preserve exact file paths and essential commands without copying huge logs;
4. keep mandatory reading and next actions clear for fresh sessions;
5. identify owner surfaces for work that should not be inferred from the summary;
6. fail closed or fall back visibly when a custom summarizer cannot produce the requested shape;
7. avoid double-registration with other compaction owners.

## Non-goals

`pi-session-compaction` must not become:

- ASC/self operational mirror;
- a visible-loop or peer-session launcher;
- an autoresearch evaluator or campaign owner;
- a durable diagnostic recurrence store;
- an AK/KES/Oracle/ontology writer;
- a hidden executor after compaction;
- a second owner of package-local product posture or live task truth.

## Relationship to current posture

This document names the destination. Use [product-posture.md](./product-posture.md) for current maturity, next bets, and trust gates; use [README](../../README.md) and [AGENTS](../../AGENTS.md) for package-local implementation status and validation commands.
