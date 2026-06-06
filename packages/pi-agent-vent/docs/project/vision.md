---
summary: "Product and technical vision for pi-agent-vent."
read_when:
  - "Defining or revisiting project direction."
  - "Deciding whether a venting/review/escalation feature belongs in pi-agent-vent."
system4d:
  container: "Project north-star statement for local agent frustration capture and operator review."
  compass: "Turn recurring agent pain into reviewable maintenance signal without authority drift."
  engine: "Capture minimized vent -> group recurrence -> review in an operator inbox -> draft owner-surface escalation only after human choice."
  fog: "The package fails if vents become noisy, privacy-risky, silently escalated, or mistaken for real incidents/tasks/evidence."
---

# Vision

`pi-agent-vent` turns repeated agent frustration into a small, local maintenance inbox.

Agents regularly encounter the same brittle workflows, missing affordances, tool/runtime failures, context-loss patterns, and long-lived bugs. Those observations usually disappear into chat history or final-answer omissions. This package gives them a safe local place to say “this keeps hurting,” then helps an operator review the pattern before deciding whether any owner surface should act.

The product promise is:

```text
capture local pain -> make recurrence visible -> let a human decide escalation
```

## Product principles

- **Local first:** records stay on the operator machine by default.
- **Minimal by default:** summarize friction; do not copy secrets, private user payloads, or long logs.
- **Review before escalation:** vent records become an operator-reviewable inbox, not automatic tasks or incidents.
- **Advisory, not authoritative:** candidate incidents are review prompts, not incident declarations.
- **Human-owned escalation:** AK tasks, GitHub issues, evidence, incidents, and publication belong to their owner surfaces.
- **Cheap to inspect:** `/agent_vent summary`, `/agent_vent list`, and `/agent_vent path` should explain the state quickly.
- **Coherent naming:** user-facing runtime surfaces should prefer `agent_vent`; package/release filesystem names may remain `pi-agent-vent` where ecosystem conventions require kebab-case.

## Product shape

A healthy workflow looks like:

```text
agent notices recurring friction
-> agent_vent records a minimized local vent
-> recurrence groups reveal repeated pain
-> operator reviews, acknowledges, dismisses, merges, or drafts escalation
-> owner system receives a human-approved draft only when appropriate
```

For self-evolution loops, `agent_vent` is the recurrence-memory surface after ASC/self has produced a diagnostic candidate.
It is not the loop executor, evaluator, or escalation authority.
Use the root `docs/project/visible-self-evolution-spine.md` spine and the cross-package [self/toolbox/agent_vent diagnostic boundary](./2026-06-05-self-toolbox-agent-vent-diagnostic-boundary.md) for the DRY owner map.

Near-term product work should make the review step better rather than broadening authority. Useful next surfaces include:

- `/agent_vent review` for an operator-facing review queue;
- explicit local review states such as `new`, `acknowledged`, `dismissed`, and `escalation_drafted`;
- recurrence-group merge/dedupe flows;
- export/delete/retention controls;
- package/tool owner routing hints;
- draft-only GitHub/AK/incident text generation that never submits automatically.

## Technical principles

- Use the `engineering-core` `pi-ts` lane.
- Keep runtime dependencies minimal; prefer Node built-ins and Pi host APIs.
- Keep durable state schema-versioned, local-first, append-friendly, and privacy-reviewed.
- Put pure recurrence/redaction/store/review behavior in testable JS modules.
- Keep the extension entrypoint small and explicit.
- Preserve template-aligned package metadata and root release automation compatibility.
- Integrate with `pi-toolbox-discovery` for discovery/activation and with ASC/`self` only as a companion boundary, not by storing vent state in ASC.

## Enduring invariant

```text
agent_vent surfaces pain; humans and owner systems decide authority.
```
