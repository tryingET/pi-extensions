---
summary: "Product and technical vision for pi-autonomous-session-control."
read_when:
  - "Defining or revisiting project direction."
system4d:
  container: "Project north-star statement."
  compass: "Build a reliable pi extension package with low maintenance overhead."
  engine: "Translate goals into concrete implementation slices."
  fog: "Real user workflows may reshape priorities."
---

# Vision — `pi-autonomous-session-control`

## North star

ASC should be Pi's local execution-plane mirror: it helps the agent perceive its current session, route safe next actions, launch bounded helper execution, and recover from runtime friction without becoming durable authority.

Short form:

```text
mirror the session; route the action; do not own the truth
```

## Self-evolution role

For recursive-improvement work, ASC owns the first mile:

- session-local perception and handoff cues;
- `self` diagnostic candidates;
- checkpoints, followups, traps, and bounded memory;
- low-risk `pi.sendUserMessage` notifications;
- editor prefill for operator-reviewed next moves;
- public execution seams such as `dispatch_subagent`.

ASC does not own durable diagnostic recurrence, AK evidence, ontology, KES learning, Prompt Vault procedures, candidate promotion, or `/visible-loop` execution state.
Use the root [visible self-evolution spine](../../../../docs/project/visible-self-evolution-spine.md) for the DRY owner map.

## Product boundaries

Project purpose for this repository is scoped to extension delivery and maintenance.
It aligns with, but is distinct from, organization purpose documented in [Organization operating model](../org/operating_model.md).
For the project-level concept map, see [Project foundation model](foundation.md).

Related owner docs:

- [product posture](./product-posture.md)
- [self continuation harness suggestions](./self-continuation-harness-suggestions.md)
- [self/toolbox/agent_vent diagnostic boundary](../../../pi-agent-vent/docs/project/2026-06-05-self-toolbox-agent-vent-diagnostic-boundary.md)
- [pi-little-helpers visible peer capability contract](../../../pi-little-helpers/docs/project/2026-05-05-visible-peer-capability-contract.md)
