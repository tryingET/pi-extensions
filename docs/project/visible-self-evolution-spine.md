---
summary: "DRY routing spine for visible-loop-driven self-evolution across ASC/self, agent_vent, pi-autoresearch, pi-society-orchestrator, and pi-little-helpers."
read_when:
  - "You are aligning vision or product-posture docs for agent self-awareness, self-evolution, visible loops, or AGI-ish improvement loops."
  - "You are deciding which package owns a proposed self-evolution capability."
type: "reference"
system4d:
  container: "Root-level routing spine for self-evolution capability placement in pi-extensions."
  compass: "Make recursive improvement empirical, visible, and owner-routed instead of self-ratifying."
  engine: "Observe friction -> classify owner -> run visible loop or bounded campaign -> verify outcome -> route durable learning through owner surfaces."
  fog: "The main risk is collapsing mirror, executor, evaluator, durable memory, and promotion authority into one local loop."
---

# Visible self-evolution spine

## Purpose

This note is the DRY root reference for turning agent self-awareness into safe self-evolution work.
Package vision and product-posture files should link here instead of copying the whole model.

The target shape is:

```text
self observes friction
-> diagnostic candidate with hypothesis, falsifier, metric, owner, and safe next test
-> visible-loop or bounded campaign executes the improvement with reviewable state
-> tests and live dogfood check the result
-> durable recurrence, evidence, learning, or ontology moves only through the owning surface
```

Short form:

```text
recursive improvement must be visible, empirical, and owner-routed
```

## Owner map

| Concern | Owner |
|---|---|
| Session mirror, self queries, diagnostics candidates, low-risk notifications, checkpoints/followups | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/vision.md) |
| Visible child sessions, `/visible-loop`, `/nexus-loop`, `/sidequest`, `/scoutpeer`, `/parallelquest` | [pi-little-helpers product posture](../../packages/pi-little-helpers/docs/project/product-posture.md) and [visible capability contract](../../packages/pi-little-helpers/docs/project/2026-05-05-visible-peer-capability-contract.md) |
| Canonical compaction summaries, `/compact-focus`, `/compact-handoff`, fresh-session handoff prompt shape | [pi-session-compaction](../../packages/pi-session-compaction/docs/project/vision.md) |
| Repeated local agent-friction memory, recurrence review, draft-only escalation text | [pi-agent-vent](../../packages/pi-agent-vent/docs/project/vision.md) |
| Measured candidate experiments, self-hosting evaluator locks, empirical closeout packets | [pi-autoresearch](../../packages/pi-autoresearch/docs/project/vision.md) |
| Above-seam coordination, fan-in gates, evidence projection from verified artifacts | [pi-society-orchestrator](../../packages/pi-society-orchestrator/docs/project/vision.md) |
| Durable task, evidence, decision, and direction authority | AK / society authority surfaces |
| Reusable procedures | Prompt Vault |
| Semantic / ontology changes | ROCS / ontology owner repos |
| Learning activation | KES / notes / selected learning owners |

## Minimal self-evolution candidate contract

A useful self-evolution candidate should name:

- `friction`: what hurt or failed;
- `hypothesis`: why it happened;
- `falsifier`: what would prove the diagnosis wrong;
- `metric`: what observable outcome should improve;
- `owner`: which package or authority surface owns the next action;
- `autonomyLevel`: observe, suggest, prefill, low-risk notify, visible-loop, bounded campaign, or durable owner mutation;
- `nextSafeTest`: the smallest verification or dogfood action;
- `nonAuthorizations`: what the current surface must not do.

This keeps self-evolution Popper-falsifiable, Deming/PDCA-checkable, OODA-visible, and cybernetic: the loop has a feedback signal rather than vibes.

## Many-of-the-greats translation

The prior many-of-the-greats review should be carried as design pressure, not copied into every package file.
Translate it through this DRY owner map:

| Lens / component | Root translation | Primary owner |
|---|---|---|
| Cybernetics / control loops | Record observation, desired state, error signal, suggested action, feedback signal, and open/closed outcome for self-improvement candidates. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md), with durable recurrence only through [pi-agent-vent](../../packages/pi-agent-vent/docs/project/product-posture.md) |
| Popper / falsifiability | Every self-improvement claim names a falsifier before implementation or durable follow-up. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md) |
| Deming / PDCA | Candidate flow is plan -> low-risk try -> validation/live dogfood check -> adopt/reject/route learning. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md), [pi-autoresearch](../../packages/pi-autoresearch/docs/project/product-posture.md) for measured campaigns |
| OODA / Boyd | Nontrivial self recommendations expose observed, oriented, decided, acted/deferred, and check signal. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md) |
| Minsky / specialist critics | Use lightweight boundary, evidence, UX-friction, validation, and owner-routing critics before escalation; spawn peers only when ambiguity remains. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md), [pi-little-helpers](../../packages/pi-little-helpers/docs/project/product-posture.md) for visible peer surfaces |
| Brooks / subsumption | Output autonomy level explicitly: observe, suggest, prefill, low-risk notify, visible-loop, bounded campaign, durable owner mutation. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md) |
| Simon / bounded rationality | Recommendations include cost, uncertainty, reversibility, and a good-enough stop condition when nontrivial. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md) |
| Hofstadter / reflection guard | Detect repeated self-analysis without external check and route to validation, scout/deep review, or stop. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md), [pi-little-helpers](../../packages/pi-little-helpers/docs/project/product-posture.md) for scout/visible execution |
| Outcome feedback | Mark suggestions helped, ignored, stale, wrong-owner, or unsafe so future ranking can improve. | [ASC/self](../../packages/pi-autonomous-session-control/docs/project/product-posture.md), with recurring pain retained by [pi-agent-vent](../../packages/pi-agent-vent/docs/project/product-posture.md) |

Package vision and posture files should link here and keep only the local commitments they own.

## Session-to-doc propagation gate

Self-evolution work often starts as session-only analysis: subagent reports, deep-review findings, compaction summaries, or operator corrections.
Before claiming a visible-loop-ready docs alignment, check whether any valuable session-only insight must be promoted into an owner surface.

Use this rule:

```text
valuable session-only insight
-> classify owner
-> promote the durable portion into that owner's vision/product-posture/runbook/task surface
-> leave raw session JSONL as historical capture only
```

A docs alignment is incomplete when it preserves the next implementation slice but loses the design rationale, falsifier, metric, owner map, or non-authorizations that make the slice safe to run in `/visible-loop`.

## Visible-loop role

`/visible-loop` is the operator-visible execution harness for bounded implementation/review loops.
It is useful when the work needs a visible child session, repeated prompt queue, deep review, or explicit checkpointing.
It does not make child output authoritative by itself.

Use `/visible-loop` for self-evolution only when the owner map and candidate contract are already clear enough that the loop can execute a bounded slice.
If the owner or metric is unclear, first ask `self`, use `context_plan`, or run a scout/deep review.

## Guardrails

A self-evolution loop is out of bounds when it:

- lets `self` write durable vent records, AK evidence, tasks, incidents, ontology, or KES directly;
- lets `pi-autoresearch` promote its own candidate without external approval;
- treats peer/intercom messages as measured evidence;
- treats local receipts or session mirror data as canonical truth;
- runs hidden daemonized improvement without budgets and stop conditions;
- records an improvement without a metric, falsifier, and verification signal.

## Canonical next frontier

The next safe frontier is not generic AGI autonomy. It is a typed, testable self-evolution candidate flow:

```text
self.evolution_candidate.v1
-> optional agent_vent preview for recurrence
-> visible-loop or pi-autoresearch campaign for implementation/evaluation
-> owner-routed evidence/learning only after verification
```

Package docs should use this note as the shared spine and keep local files focused on their own role.
