---
summary: "Product and technical vision for pi-agent-vent."
read_when:
  - "Defining or revisiting project direction."
system4d:
  container: "Project north-star statement for local agent frustration capture."
  compass: "Turn recurring agent pain into reviewable local signal without authority drift."
  engine: "Observe friction -> record minimized vent -> group recurrence -> human decides escalation."
  fog: "The package fails if vents become noisy, privacy-risky, or mistaken for real incidents."
---

# Vision

`pi-agent-vent` makes recurring agent frustration visible.

The package gives Pi agents a small, local, privacy-aware outlet for “this keeps going wrong” observations. Its purpose is to preserve weak-but-useful signal that would otherwise disappear between sessions: brittle workflows, long-lived bugs, repeated tool failures, context loss, and missing affordances.

## Product principles

- **Local first:** records stay on the operator machine by default.
- **Minimal by default:** summarize friction; do not copy secrets, private user payloads, or long logs.
- **Advisory, not authoritative:** candidate incidents are review prompts, not incident declarations.
- **Human escalation:** AK tasks, issues, evidence, and real incidents belong to their owner surfaces.
- **Cheap to inspect:** `/agent_vent summary`, `/agent_vent list`, and `/agent_vent path` should explain the state quickly.

## Technical principles

- Use the `engineering-core` `pi-ts` lane.
- Keep runtime dependencies at zero beyond Pi-provided extension imports and Node built-ins.
- Put pure recurrence/redaction/store behavior in testable JS modules.
- Keep the extension entrypoint small and explicit.
- Preserve template-aligned package metadata and root release automation compatibility.
