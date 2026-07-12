---
summary: "Adopt canonical cognitive semantics for explorer, builder, reviewer, tester, researcher, and minimal while keeping skills, procedures, topology, execution defaults, and authority separate."
status: accepted
read_when:
  - "Changing ASC subagent profiles or orchestrator agent profiles."
  - "Adding roles to workflows, peers, or a future pi-agent-run-contracts package."
  - "Deciding whether a discipline such as RefactorOps belongs in a role."
system4d:
  container: "Cross-package cognitive-role semantics for pi-extensions."
  compass: "Make roles powerful and unambiguous without letting them become hidden execution or domain-policy containers."
  engine: "Adjudicate schools -> define canonical semantics -> preserve launcher defaults -> verify role boundaries."
  fog: "A role name can accidentally grant tools, absorb a skill, or conceal different semantics behind apparent convergence."
---

# ADR — Canonical agent role semantics

## Status

Accepted on 2026-07-12 by direct operator instruction to proceed with semantic reconciliation and revise builder, tester, and minimal using the stronger role/run-contract model.

Related RFC: [`../project/2026-07-12-rfc-agent-run-contracts.md`](../project/2026-07-12-rfc-agent-run-contracts.md).

## Decision

Adopt six canonical cognitive roles:

| Role | Cognitive responsibility |
|---|---|
| `explorer` | Map the problem space, relationships, uncertainty, constraints, and promising paths. |
| `builder` | Convert an objective and constraints into the simplest complete integrated outcome. |
| `reviewer` | Independently assess proposed work and rank evidence-backed findings. |
| `tester` | Attempt to falsify behavioral claims with discriminating checks and calibrated evidence. |
| `researcher` | Reduce uncertainty through credible, diverse, source-grounded synthesis. |
| `minimal` | Apply full precision and judgment with the least ceremony and output that preserves correctness. |

`scout` remains the public orchestrator compatibility name for canonical `explorer`. The profile name remains `scout`; its cognitive role id and instructions are `explorer`.

## Adjudication

The decision integrates the strongest compatible claims from six schools:

- **Unix single-purpose roles:** each role has one cognitive responsibility.
- **High-agency outcome ownership:** builder pursues the complete intended outcome rather than a superficial patch.
- **Scientific falsification:** tester seeks disconfirming evidence rather than ceremonial green checks.
- **Independent adversarial review:** reviewer judges supplied work without becoming its implementer.
- **Information foraging:** researcher follows and triangulates the strongest available sources.
- **Minimal-context precision:** minimal removes ceremony, not intelligence, care, or understanding.

The schools are contextually dominant rather than collapsed into one universal agent. Their differences are intentional:

```text
explorer   maps possibilities and uncertainty
researcher establishes decision-ready knowledge
reviewer   judges a proposed artifact or claim
tester     attempts to falsify behavioral claims
builder    constructs the requested outcome
minimal    removes nonessential process while retaining judgment
```

## Exact semantic requirements

### Builder

Builder must:

- target the complete intended outcome;
- prefer the simplest complete solution over both speculative frameworks and tiny debt-preserving patches;
- preserve relevant invariants and integrate with surrounding patterns;
- surface assumptions, achieved capability, validation status, and residual risk.

Builder must not embed RefactorOps, frontend design, DesignMD, repository routing, commit procedure, or any other domain discipline. Those remain skills or procedures selected independently.

### Tester

Tester must:

- seek falsification rather than confirmation;
- derive checks from requirements and invariants;
- probe boundaries, failures, state transitions, and adversarial cases;
- distinguish expected behavior, observed evidence, unexecuted proposals, and inference;
- produce a confidence-calibrated verdict.

Tester does not imply test-file mutation or any particular command/tool capability.

### Minimal

Minimal means minimum ceremony, not minimum intelligence. It must:

- retain full precision and judgment;
- use only context and output material to correctness;
- surface material assumptions and risks;
- complete the objective, report the essential result, and stop.

Thinking level remains an execution default owned by ASC and is not part of the cognitive role definition.

## Boundaries

Canonical role policy contains no:

- tools, models, thinking levels, timeouts, or budgets;
- mutation, commit, push, merge, evidence, or promotion authority;
- clean/fork/worktree topology;
- ACK/FINAL, continuation, settlement, or cleanup lifecycle;
- skill instructions such as RefactorOps;
- Prompt Vault procedure names or phase sequencing;
- final prompt-composition strategy.

Those remain owned by their existing surfaces.

## Compatibility and scope

This decision changes cognitive prompt text for roles already present on each surface. It does not expand public role availability:

- ASC remains `explorer | reviewer | tester | researcher | minimal | custom`.
- Orchestrator remains `scout | builder | reviewer | researcher`.
- Builder is not added to ASC in this slice.
- Tester and minimal are not added to orchestrator workflows or teams in this slice.
- Visible peer prompt construction is unchanged.
- No shared package is created yet.

This avoids conflating semantic convergence with capability expansion.

## Verification

Tests must prove:

1. role, execution-default, and compatibility-profile catalogs have identical keysets per package;
2. canonical role instructions project into existing runtime profile shapes;
3. ASC and orchestrator reviewer/researcher instructions are semantically identical by decision;
4. orchestrator `scout` projects canonical role id `explorer` while retaining public profile name `scout`;
5. builder contains no skill, tool, topology, lifecycle, or authority instructions;
6. tools and thinking defaults remain unchanged.

## Consequences

The role layer is now coherent enough to evaluate extraction into a dependency-neutral `pi-agent-run-contracts` library. Extraction remains a separate slice because it introduces package/publication and adapter decisions. A shared package may proceed only if it preserves the boundaries above and does not become a new extension or runtime owner.

## Rollback

Restore the previous prompt strings and descriptions while retaining the already-landed local role/default separation. No execution schema, tool default, topology, or persisted state migration is required.
