---
summary: "RFC for a shared declarative agent-run vocabulary without coupling session posture, skills, procedures, execution topology, or authority."
read_when:
  - "Changing agent profiles, dispatch contracts, visible peer roles, or orchestration nodes."
  - "Evaluating whether to create pi-agent-run-contracts."
type: "rfc"
system4d:
  container: "Cross-package contract design for Pi agent invocation."
  compass: "Unify declarative vocabulary while preserving runtime-owner boundaries and exact behavior."
  engine: "Characterize -> separate dimensions locally -> reconcile semantics -> extract only proven common contracts."
  fog: "A universal mode object can hide incompatible execution and authority semantics behind shared names."
---

# RFC: Agent-run contracts without a universal runtime

**Status:** characterization, local separation, and semantic reconciliation complete; shared-package extraction pending
**Date:** 2026-07-12

Accepted semantic decision: [`../decisions/2026-07-12-canonical-agent-role-semantics.md`](../decisions/2026-07-12-canonical-agent-role-semantics.md).

## Problem

Several packages carry overlapping role vocabulary:

- ASC defines `explorer`, `reviewer`, `tester`, `researcher`, and `minimal` profiles containing prompt text, tools, and thinking defaults.
- `pi-society-orchestrator` defines `scout`, `builder`, `reviewer`, and `researcher` profiles containing prompt text and tools, then passes a composed custom prompt through ASC.
- `pi-little-helpers` accepts `scout | reviewer` for clean visible peers and constructs separate fork, scout, and candidate launch envelopes.
- `pi-modes` defines persistent session-level prompt posture.

The shared words conceal different contracts. Prompt policy, tool defaults, context inheritance, worktree isolation, report-back, mutation posture, lifecycle, evidence, and promotion authority are not interchangeable.

## Target architecture

```text
pi-modes                    persistent session posture
pi-agent-run-contracts      shared declarative run/role vocabulary
skills                      domain operating disciplines
Prompt Vault                reusable procedures
ASC                         isolated child execution
pi-little-helpers           visible peer topology
pi-society-orchestrator     graphs, loops, routing, fan-in
pi-autoresearch             empirical campaigns
```

`pi-agent-run-contracts` is a possible later pure library, not an extension and not part of this RFC's implementation slice. Creating it before role semantics converge would freeze accidental differences.

## Contract axes

A future portable request may describe independent axes:

```ts
interface AgentRunSpecV1 {
  schema: "pi.agent-run.v1";
  posture?: SessionPostureRef;
  role: RolePolicyRef;
  skills?: SkillProfileRef[];
  procedure?: ProcedureRef;
  task: TaskEnvelope;
  execution: ExecutionTopology;
  authority: AuthorityEnvelope;
  lifecycle: LifecyclePolicy;
}
```

These fields are declarations, not receipts or proof of enforcement.

| Axis | Owner |
|---|---|
| Persistent base-prompt posture | `pi-modes` |
| Cognitive role vocabulary | future pure contract library after convergence |
| Domain discipline | skills such as `refactorops` |
| Reusable cognitive procedure | Prompt Vault |
| Isolated child lifecycle | ASC |
| Visible clean/fork/worktree topology | `pi-little-helpers` |
| Graphs, loops, routing, and fan-in | `pi-society-orchestrator` |
| Measurement and candidate decisions | `pi-autoresearch` |

## Invariants

1. A role cannot grant tools, mutation, continuation, peer launch, promotion, or owner-surface authority.
2. A skill remains distinct from a role. Refactoring is `role + refactorops + topology + authority`, not a `refactoring` mode.
3. Launchers retain final prompt assembly and all transport, lifecycle, isolation, and enforcement behavior.
4. Visible peer boot protocol, exact `PEER_ACK`/`PEER_FINAL` behavior, worktree lineage, and cleanup stay `pi-little-helpers` owned.
5. ASC prompt-envelope ordering, task contract, capacity, session identity, timeout, settlement, and receipts stay ASC owned.
6. Orchestrator cognitive-procedure composition and graph semantics stay orchestrator owned.
7. Existing public profile names, enumerable object shape, and flat fields remain exact compatibility projections until an explicit migration decision.
8. Unsupported requested capabilities fail closed rather than being silently approximated.

## Characterized current composition

### ASC

```text
optional Prompt Vault envelope
-> selected profile/custom system prompt
-> dispatch task contract
-> isolated child runtime
```

ASC profile records currently combine cognitive role instructions with tools and thinking defaults. The first local separation introduces parallel `SUBAGENT_ROLE_POLICIES` and `SUBAGENT_EXECUTION_DEFAULTS` catalogs while preserving the exact enumerable `SUBAGENT_PROFILES` object shape, strings, tools, and thinking values.

### Orchestrator over ASC

```text
orchestrator role policy
---
Prompt Vault cognitive procedure
---
optional context and extra sections
-> ASC custom profile
-> ASC task contract and execution runtime
```

Orchestrator profile records similarly combine role instructions and tool defaults. The first separation introduces parallel `AGENT_ROLE_POLICIES` and `AGENT_EXECUTION_DEFAULTS` catalogs while preserving the exact enumerable `AGENT_PROFILES` object shape, custom-prompt route, strings, and tools.

### Visible peers

```text
launcher identity and boot protocol
-> role label and objective/context
-> topology-specific mutation policy
-> report-back and DoD
-> anti-goals
-> visible Pi process/worktree lifecycle
```

The visible-peer prompt builders are already protected by package tests covering clean context, inherited fork context, candidate worktree boundaries, boot ordering, ACK/FINAL, mutation policy, scope, DoD, and cleanup. This RFC does not move or rewrite those prompts.

## Characterization oracle

The behavior-preservation gate is:

- exact whole-object legacy shape plus prompt/tool/thinking tests for ASC profiles;
- exact whole-object legacy shape plus prompt/tool tests for orchestrator profiles;
- existing `pi-little-helpers` peer-spawn and candidate-peer prompt-order/boundary tests;
- existing orchestrator `buildCombinedSystemPrompt` and ASC prompt-envelope/task-contract tests;
- package-local `npm run check` for all touched runtime owners.

The initial behavior-preserving slice failed on any role-text, tool-set, prompt-order, topology, authority, or lifecycle change. The accepted semantic decision now authorizes only the documented role-text/description changes; the remaining execution and authority dimensions stay unchanged.

## Migration sequence

1. **Characterize — complete:** lock profile projections and launcher composition.
2. **Separate locally — complete:** expose cognitive role policy separately from execution defaults without changing public shape or outputs.
3. **Reconcile semantics — complete:** adopt canonical `explorer`, `builder`, `reviewer`, `tester`, `researcher`, and `minimal`; retain orchestrator `scout` as the compatibility name for `explorer`.
4. **Decision gate — partly complete:** cognitive semantics and role/skill/procedure boundaries are accepted; customization/provenance, schema evolution, package ownership, and publication order remain extraction decisions.
5. **Extract only proven common data — pending:** scaffold a dependency-neutral `pi-agent-run-contracts` library only after its remaining package contract is accepted; reviewer and researcher now provide two intentionally identical consumer semantics.
6. **Adapt incrementally:** preserve old profile/tool schemas as aliases while launchers resolve portable declarations into launcher-owned effective plans.
7. **Expose receipts separately:** never use a requested run spec as evidence that a launcher enforced or completed it.

## Rejected approaches

### Put all roles in `pi-modes`

Rejected because a session base-prompt posture is not a child execution role and `replace_final` could erase launcher context.

### Make ASC the universal role owner

Rejected for now because visible-peer packages should not depend on the full headless execution runtime merely to share vocabulary.

### Make orchestrator the universal role owner

Rejected because it would invert the dependency from lower execution surfaces into the higher coordination layer.

### Create another extension

Rejected. A declarative schema/catalog needs no tool registration, UI, process, state, or mutation owner.

### Extract the library immediately

Rejected until characterization and semantic reconciliation prove which data is truly common.

## Stop conditions

Stop local refactoring and open a separate decision if any next step requires:

- changing public tool schemas or profile behavior;
- changing prompt precedence or text;
- changing tool availability or thinking defaults;
- changing peer boot/report-back or worktree behavior;
- changing skill discovery or activation;
- changing authority, evidence, cleanup, or promotion semantics;
- introducing package dependencies or publication-order requirements.

## Rollback

The local separation is additive. Rollback removes the parallel role-policy and execution-default catalogs plus their characterization tests; legacy profile object shapes and runtime callers remain unchanged throughout this slice.
