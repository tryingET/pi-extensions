---
summary: "Pi-side design handoff for exposing AK closeout/readiness/close-frame surfaces without making Pi own AK lifecycle state."
read_when:
  - "You are adding Pi UX around AK strategy closeout, closeout-gate, open-frame-status, or close-frame surfaces."
  - "You are deciding whether pi-society-orchestrator may run AK lifecycle writes."
  - "You are continuing agent-kernel SF4/IW8 owner handoff task 2689."
type: "design-handoff"
task_id: 2689
source_frame: "agent-kernel SF4/IW8"
source_handoff: "/home/tryinget/ai-society/softwareco/owned/agent-kernel/docs/project/2026-05-09-sf4-iw8-pi-ux-handoff-after-close-frame.md"
system4d:
  container: "Pi-side design handoff for displaying AK closeout/readiness/close-frame surfaces inside pi-society-orchestrator without moving AK lifecycle authority into Pi."
  compass: "Make the operator path visible and safe: Pi presents AK truth, asks for explicit routes, and refuses implicit lifecycle/source-owner mutation."
  engine: "Read AK machine payloads -> classify active/route-wait/closeout/apply posture -> render safe UX affordances -> stop before writes unless a later explicit gate exists."
  fog: "The main risk is making Pi appear to own AK lifecycle state or exposing a one-click close action that bypasses typed authorization, evidence, and source-owner gates."
---

# AK Close-Frame Operator UX Handoff

## Verdict

`pi-society-orchestrator` is the right Pi package to design the operator UX around AK closeout/readiness/close-frame flows, because the UX composes multiple lower-plane owners:

- AK owns task, evidence, direction, closeout readiness, and lifecycle mutation truth.
- Pi owns operator-workbench presentation and command affordances.
- Prompt Vault, ROCS, KES, stewardship/publication, templates, Oracle/DSPx, and other systems keep their own owner gates.

This design does **not** implement code, install/reload Pi, run `ak strategy close-frame --apply`, close SF4, archive IW8, or mutate any source-owner surface.

## Product problem

The AK side now has a first-class close-frame command family:

```text
ak strategy open-frame-status
ak strategy closeout-status
ak strategy closeout-gate --plan
ak strategy close-frame --plan
ak strategy close-frame --apply
```

Those surfaces are truthful but currently terminal-oriented. Pi should make their state visible and actionable without recreating AK's lifecycle rules in extension code.

The UX failure to avoid is a generic-looking `proceed` or one-click close button that hides whether the current state is:

- active execution;
- route wait;
- closeout ready but lifecycle unauthorized;
- apply unsupported because of active task posture;
- source-owner gated.

## Ownership contract

### AK remains canonical

Pi must read AK state from AK commands or their stable machine payloads. Pi must not persist, infer, or repair AK lifecycle state itself.

Canonical readbacks for the UX:

| UX question | AK source |
|---|---|
| Current frame/wave and route posture | `ak strategy open-frame-status --repo <repo> <SF> --implementation-wave <IW> -F json` |
| Whether generic proceed is legal | `route_wait_context.generic_proceed_allowed` |
| Active task anchor | `active_execution_task` |
| Closeout readiness and blockers | `ak strategy closeout-status --repo <repo> <SF> --implementation-wave <IW> -F json` |
| Operator lifecycle choices | `ak strategy closeout-gate --repo <repo> <SF> --implementation-wave <IW> --plan -F json` |
| Prospective lifecycle writes and apply blockers | `ak strategy close-frame --repo <repo> <SF> --implementation-wave <IW> --plan -F json` |

### Pi owns presentation and guardrails

Pi may:

- render a status card or `/runtime-status` section for AK route posture;
- show closeout readiness, blockers, and non-actions;
- offer copyable AK commands for explicit operator-controlled next steps;
- disable or downgrade generic proceed when AK says route-wait;
- explain why a lifecycle write is blocked.

Pi must not:

- run `close-frame --apply` without a later explicit write-path design and operator gate;
- invent a local closeout state cache;
- treat session memory or docs as more authoritative than AK readbacks;
- weaken AK's typed authorization/evidence requirements;
- mutate Prompt Vault, ROCS, KES, stewardship/publication, templates, Oracle/DSPx, or AK lifecycle state by implication.

## UX state model

### 1. Active execution

Input condition:

```text
route_guidance.posture = active_execution
route_wait_context.generic_proceed_allowed = true
```

Operator copy:

```text
Current AK task can continue. Generic proceed is scoped to task <id>.
```

Allowed affordances:

- show task id/title;
- offer `ak task show <id>`;
- offer package/local continue action only if the current Pi command is already scoped to that task.

### 2. Route wait

Input condition:

```text
route_guidance.posture = route_wait
route_wait_context.generic_proceed_allowed = false
```

Operator copy:

```text
Generic proceed is insufficient. Choose an explicit route before lifecycle or owner-surface work.
```

Allowed affordances:

- show legal route choices from AK payload;
- show non-authorizations;
- offer read-only status/plan commands;
- refuse implicit lifecycle/source-owner actions.

### 3. Closeout ready but not authorized

Input condition:

```text
closeout_ready = true
ready_for_operator_gate = true
separate_gates.lifecycle_state_mutation != authorized
```

Operator copy:

```text
Closeout readiness is satisfied, but lifecycle mutation still needs an explicit operator gate.
```

Allowed affordances:

- show `closeout-status` satisfied rows;
- show `closeout-gate --plan` choices;
- keep apply actions disabled unless a later explicit apply workflow exists.

### 4. Close-frame apply unsupported

Input condition:

```text
close-frame --plan apply_supported = false
```

Operator copy:

```text
Close-frame apply is not currently supported. Resolve blockers first.
```

Required display fields:

```text
blockers
execution_task_posture
requires
writes
non_actions
separate_gates
```

## Proposed first Pi slice

First implementation slice should be read-only and package-local:

```text
Add an AK close-frame/status section to /runtime-status or a nearby orchestrator inspector.
```

Minimum behavior:

1. detect repo scope from the current Pi workspace/cwd or explicit argument;
2. run AK readbacks with bounded timeout and stderr capture;
3. render route posture, active task, closeout readiness, close-frame apply support, blockers, and non-actions;
4. show copyable commands for safe next reads;
5. never run write commands.

Out of first slice:

- `close-frame --apply` execution;
- DB preflight automation;
- evidence creation;
- task lifecycle mutation;
- Prompt Vault/Pi/KES/ROCS/template/stewardship/Oracle/DSPx mutation.

## Future write-path gate

A future Pi-assisted write path would need a separate decision/design because it would compose multiple critical gates:

```text
DB preflight
safe execution-task posture
typed operator authorization ref
evidence:<id> ref
direction check before/after
projection refresh after
explicit source-owner non-actions
```

Until that exists, Pi should only display AK's plan/apply contract and point operators at AK commands.

## Package placement

Recommended package owner:

```text
packages/pi-society-orchestrator
```

Reason:

- It already owns coordination/control-plane behavior over AK, Vault, ROCS, and ASC seams.
- `/runtime-status` is already the package-local operator-visible runtime inspector.
- The concern is not generic context overlay alone; it is a governed workflow/status composition over AK readbacks.

Potential secondary package:

```text
packages/pi-context-overlay
```

Only if a later slice wants a lightweight passive overlay. It should consume the same AK-derived status contract and not own workflow actions.

## Validation expectation for a future implementation task

A code implementation should verify:

- route-wait disables generic proceed affordance;
- active execution shows the active task and safe next read commands;
- closeout-ready-but-unauthorized is visually distinct from closed/done;
- `apply_supported=false` displays blockers and does not offer write action;
- installed package smoke does not regress `/runtime-status` wording;
- package checks pass through the monorepo validation surface.

## Non-actions in this design task

This document does not authorize:

```text
Pi extension code mutation
Pi live install/reload
ak strategy close-frame --apply
SF4 closeout
IW8 closure/archive
AK evidence writes except task evidence for this design
Prompt Vault mutation
ROCS mutation
KES/knowledge promotion
steward/publication mutation
template propagation
Oracle/DSPx mutation
```

## Stop condition

Stop after this design handoff unless the operator explicitly authorizes a package-local implementation task. The next truthful step is either:

1. open a pi-society-orchestrator implementation task for read-only `/runtime-status` integration; or
2. park the handoff and return to AK product posture/lifecycle review.
