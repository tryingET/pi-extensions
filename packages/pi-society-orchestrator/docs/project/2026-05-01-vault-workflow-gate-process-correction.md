---
summary: "Process correction for workflow-grade Prompt Vault template execution failures: fail closed, route to owner surfaces, and loop back before continuing."
read_when:
  - "A workflow-grade Prompt Vault template cannot execute through vault_execute_template."
  - "An operator asks why a Prompt Vault gate failure was bypassed."
  - "You need the discovery/design -> architecture/UX/AX -> implement -> execute-loop -> verify -> commit shape for vault workflow gates."
type: "process-correction"
system4d:
  container: "Prompt Vault workflow-grade dispatch gate inside pi-society-orchestrator."
  compass: "A missing execution binding is a design stop, not permission to continue with ad hoc manual interpretation."
  engine: "Discover owner/binding gap -> design lawful owner route and UX/AX message -> implement the smallest guardrail -> execute/loop if it fails -> verify -> commit."
  fog: "The main failure mode is treating retrieved workflow prose as execution after the orchestrator gate correctly failed closed."
---

# Process correction — Prompt Vault workflow-gate failures

## Trigger

This correction applies when an operator asks to run/apply/execute a Prompt Vault template and `vault_execute_template` reports that the selected template is workflow-grade but has no executable orchestrator binding.

That result is not a nuisance error. It is the system preserving the boundary between:

- Prompt Vault as durable procedure owner;
- the package/runtime that owns executable state and side effects;
- the orchestrator bridge that may dispatch only known executable bindings.

## Correct lifecycle

Use this loop before continuing with product work:

```text
discovery/design
-> architecture / UX / AX
-> implement
-> execute
-> if it does not work, loop back to discovery/design
-> verify
-> commit
```

## What went wrong in the lane-op campaign

The selected template was `pi-autoresearch-setup`.

Facts:

- Prompt Vault retrieval worked.
- `vault_execute_template` failed closed because it has no generic workflow executor for one-shot workflow templates.
- `pi-autoresearch` already has a package-owned Prompt Vault decision runner for `pi-autoresearch-setup`, `pi-autoresearch-next-hypothesis`, and `pi-autoresearch-finalize`.

The process error was continuing with native surfaces without first naming and fixing the gate/owner-route UX. The correct response was to stop, identify the owner route, make the agent/operator-facing route explicit, then resume.

## Architecture decision for this correction

Do not turn `vault_execute_template` into a generic workflow executor.

Instead:

1. keep fail-closed dispatch posture for workflow-grade templates without a bridge binding;
2. permit only template-specific, immutable, owner-reviewed bindings—not a generic prose executor;
3. for known package-owned workflow templates without a binding, report the exact lawful owner route;
4. tell the agent/operator not to interpret retrieved workflow prose as execution;
5. leave actual execution with the owner package until a specific executable bridge is designed.

The first accepted template-specific bridge is `deep-review.v1`: Prompt Vault classifies it as `workflow_execute`, prompt-plane V2 seals and authorizes the exact content, the Vault handoff is durably persisted before execution, and the orchestrator injects those sealed bytes into one explicit reviewer workflow. Completion fails closed unless ASC's private persisted effect receipt verifies as `settled` and cites that exact Vault handoff correlation. This does not create a generic workflow binding for other templates.

## UX/AX contract

When a known workflow-grade template has no orchestrator binding, `vault_execute_template` should answer with:

- the fail-closed reason;
- the process invariant;
- the owner package;
- the lawful tool route;
- a minimal example call;
- a no-bypass instruction.

For the current `pi-autoresearch` templates:

| Template | Owner route |
|---|---|
| `pi-autoresearch-setup` | `autoresearch_runtime_status({ action: "setup", ... })` |
| `pi-autoresearch-next-hypothesis` | `autoresearch_runtime_run(...)` or `autoresearch_runtime_loop(...)` with `decisionGoal` |
| `pi-autoresearch-finalize` | `autoresearch_runtime_status({ action: "finalize", ... })` or `autoresearch_runtime_finalize(...)` |

## Verification target

Regression tests should prove all cases:

1. generic workflow template: still fails closed and says no owner route is registered;
2. known `pi-autoresearch-setup` template: fails closed but reports the lawful owner route and process-loop wording;
3. `deep-review` executes only through its exact immutable workflow binding, sealed Vault bytes, durable handoff identity, and correlated executor result.

## Non-goals

This correction does not:

- insert or update Prompt Vault templates;
- add a generic workflow engine;
- make `pi-society-orchestrator` own `pi-autoresearch` setup/finalize execution;
- auto-run candidate peers, AK mutations, KES promotion, or campaign finalization.
