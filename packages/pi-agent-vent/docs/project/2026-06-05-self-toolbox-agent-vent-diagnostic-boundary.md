---
summary: "Boundary contract for self diagnostic candidates, toolbox activation, and agent_vent local diagnostic records."
read_when:
  - "Changing ASC self diagnostic-review output."
  - "Changing toolbox agent_vent bundle discovery or activation guidance."
  - "Changing agent_vent preview/record behavior or diagnostic authority wording."
system4d:
  container: "Cross-package diagnostic handoff boundary."
  compass: "Make recurring friction visible without turning diagnostics into authority."
  engine: "self mirrors candidate -> toolbox activates bundle -> agent_vent previews/records local diagnostics -> human decides owner escalation."
  fog: "Diagnostic candidates and local records can be mistaken for tasks, evidence, incidents, telemetry, or ASC state."
---

# Self, toolbox, and agent_vent diagnostic boundary

## Purpose

This note documents the intended handoff between three Pi extension surfaces:

1. `self` from `pi-autonomous-session-control` notices current-session friction and can return a typed `self.diagnostic_candidate.v1` payload.
2. `toolbox` from `pi-toolbox-discovery` can discover or activate the already-registered `agent_vent` tool on demand.
3. `agent_vent` from `pi-agent-vent` can preview or record minimized local diagnostic records in its append-only local store.

The chain is deliberately not an escalation pipeline. It is a low-cost local diagnostic path for repeated bugs, tool failures, workflow friction, context loss, missing affordances, and similar agent-experience problems.

## Ownership contract

| Surface | Owns | Does not own |
|---|---|---|
| `self` | Moment-level mirror of the current session; candidate diagnostic payloads; suggested next local actions. | Durable vent records, recurrence truth, AK evidence/tasks, GitHub issues, incidents, telemetry, or owner routing. |
| `toolbox` | Bundle discovery, risk posture, and active-tool-set changes for already-registered tools. | Registering missing owner tools, validating vent quality, storing diagnostics, or deciding escalation. |
| `agent_vent` | Local JSONL diagnostic records, preview quality checks, redaction, recurrence grouping, review state, curation, draft-only text, export, and retention lifecycle. | AK evidence/tasks, GitHub issues, real incidents, external telemetry, ASC/self state, publication, or owner-system lifecycle. |

## Safe handoff sequence

Use this sequence when a session notices recurring or high-friction behavior worth possible local memory:

```ts
self({ query: "What friction just happened?" })
toolbox({ action: "activate", bundle: "agent_vent" })
agent_vent({ action: "preview", summary: "...", category: "...", tool: "...", packageName: "..." })
agent_vent({ action: "record", summary: "...", category: "...", tool: "...", packageName: "..." })
```

Rules:

- `self` may prefill or suggest an `agent_vent` payload, but it must not write the record internally.
- `toolbox` activation only makes the `agent_vent` tool callable; it does not create or preview a diagnostic record.
- `agent_vent action=preview` sanitizes the would-be record and runs the anti-junk quality check without writing the store.
- `agent_vent action=record` writes only if the local quality check accepts the payload.
- `self.diagnostic_candidate.v1` exposes separate `agentVentSuggestionAllowed` and `agentVentRecordAllowed` permissions. Plain `no agent_vent` / `no-agent_vent` constraints suppress activation, preview, and record guidance. Record-only `no agent_vent record` / `no-agent_vent-record` constraints preserve non-mutating preview guidance while marking durable recording forbidden.
- ASC category `context_alignment` is accepted by `agent_vent` as a compatibility alias and normalized to canonical category `other`; the alias does not add a new canonical category.
- The toolbox bundle currently exposes only its `default` diagnostic profile. Keep a call read-only by choosing `agent_vent` actions such as `preview`, `review`, or `stats`; do not invent `profile=read`.
- Generic low-signal summaries such as `done` are rejected for `record`; use `preview` to inspect issues and warnings before writing.
- Human/operator judgment still decides whether any recurrence should become an AK task, GitHub issue, incident review, evidence record, publication, or owner-surface handoff.

## Copy wording for boundaries

Recommended short wording:

> Diagnostic review is mirror/local only: `self` can propose a candidate, `toolbox` can activate the `agent_vent` capability, and `agent_vent` can preview or write local diagnostic memory. None of these actions create AK evidence/tasks, GitHub issues, incidents, external telemetry, publication, owner routing, or ASC/self state.

Use stronger wording when a durable local write happened:

> A local `agent_vent` record was written to the operator's Pi diagnostic store. This is recurrence memory for review, not canonical evidence, task truth, issue state, incident declaration, telemetry, publication, or owner-system mutation.

## Review and escalation posture

`agent_vent` recurrence groups and candidate incidents mean “worth human review,” not “incident declared.” Draft outputs are paste-ready text only. Exports are diagnostic projections only. If a human decides a local recurrence deserves owner action, use the owning surface directly and record evidence there according to that owner’s rules.
