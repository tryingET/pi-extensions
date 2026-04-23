---
summary: "Copy/paste-ready examples for the first bounded `workflow_execute` slice: read-only chain, safe parallel discovery, and bounded worktree isolation."
read_when:
  - "You need concrete operator-facing `workflow_execute` examples after the first workflow-composition slice lands."
  - "You want a small implementation-facing example for the explicit workflow adapter over ASC."
type: "reference"
system4d:
  container: "Operator-facing example set for `workflow_execute` in pi-society-orchestrator."
  compass: "Show the smallest truthful invocation patterns for the first bounded workflow-composition slice."
  engine: "Start from read-only chain -> expand to safe parallel discovery -> constrain worktree usage to eligible mutation cases."
  fog: "The main risk is treating examples as authority or using worktree mode casually when plain chain/parallel would be safer."
---

# `workflow_execute` examples

This package's first bounded workflow-composition slice exposes one explicit tool:

- `workflow_execute`

Use it when the task naturally decomposes into a small chain or parallel group of agent steps over the ASC-backed subagent executor.

Interpretation note:
- treat this as **caller-authored / operator-authored orchestration**
- the request payload names the topology explicitly
- the agent executes the requested steps, but does not quietly redefine the graph at this boundary
- if a future planner, DSPy program, or DSPx workflow proposes a graph, it still becomes a `workflow_execute` run only after that graph is materialized explicitly as the request

## 1. Read-only chain

Use for dependent inspection/review passes.

```js
workflow_execute({
  request: {
    mode: "chain",
    steps: [
      {
        kind: "step",
        agent: "scout",
        objective: "Inspect the current repo and identify the main workflow-composition entry points.",
      },
      {
        kind: "step",
        agent: "reviewer",
        objective: "Review the discovered workflow-composition surface and summarize the main runtime risks in 3 bullets.",
      },
    ],
  },
})
```

## 2. Safe parallel discovery

Use for independent read-only tasks that can run concurrently.

```js
workflow_execute({
  request: {
    mode: "parallel",
    steps: [
      {
        kind: "parallel",
        tasks: [
          {
            kind: "step",
            agent: "scout",
            objective: "Find the main workflow runtime files and explain their role.",
          },
          {
            kind: "step",
            agent: "researcher",
            objective: "Find the tests covering workflow execution and summarize what they prove.",
          },
        ],
      },
    ],
  },
})
```

## 3. Parallel worktree isolation

Use only when tasks may mutate files and must be isolated in separate git worktrees.

```js
workflow_execute({
  request: {
    mode: "parallel",
    cwd: "/absolute/path/to/repo",
    steps: [
      {
        kind: "parallel",
        worktree: true,
        tasks: [
          {
            kind: "step",
            agent: "builder",
            objective: "Implement feature A in isolation.",
          },
          {
            kind: "step",
            agent: "reviewer",
            objective: "Audit the interface changes in isolation.",
          },
        ],
      },
    ],
  },
})
```

## Relation to loops and DSPx

- `loop_execute` is for predefined phase-driven cognitive frameworks
- `workflow_execute` is for explicit chain/parallel graphs supplied at the orchestrator boundary
- DSPy/DSPx concerns are different again: they are about program/runtime evolution, optimization, replay, and empirical evaluation rather than just choosing the next agent step topology

## Guardrails

- Prefer `mode: "chain"` when later steps depend on earlier findings.
- Use `parallel` only for truly independent tasks.
- Set `worktree: true` only on eligible parallel groups.
- Keep task-level `cwd` unset when using worktrees unless the task still resolves to the shared repo cwd.
- Active team restrictions still apply; incompatible agents fail closed before execution starts.
- The workflow summary is orchestrator-owned aggregation, not canonical task/evidence authority.
