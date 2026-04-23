---
summary: "Live-host verification note for the first bounded `workflow_execute` slice after reload: prove one real read-only chain against the package repo and capture the exact tool call plus aggregated result."
read_when:
  - "After wiring `workflow_execute` into the extension and needing one live-host proof beyond package tests and installed-package smoke."
  - "When checking whether the first bounded workflow-composition slice has been exercised through a real Pi session after reload."
type: "reference"
system4d:
  container: "Package-local live verification note for `workflow_execute` in pi-society-orchestrator."
  compass: "Prove the reloaded extension can surface `workflow_execute` through a real Pi session and successfully run one bounded read-only chain against the package repo."
  engine: "Run one exact live command -> inspect the emitted session JSONL -> record the exact tool payload and the aggregated outcome."
  fog: "The main risk is confusing package-local tests with live host proof, or treating a packaging/import check as equivalent to a real reloaded-session tool run."
---

# Live `workflow_execute` smoke — 2026-04-23

## Goal

After wiring `workflow_execute` into `extensions/society-orchestrator.ts` and reloading Pi, prove one real bounded repo task through the live host surface.

The smoke stays intentionally narrow:
- current repo only
- read-only chain
- no file mutation
- no worktree mode

## Live command

From `packages/pi-society-orchestrator/`:

```bash
pi --no-tools \
  --session-dir /tmp/pi-orch-workflow-live-session-RUPbSd \
  --append-system-prompt "You must call the workflow_execute tool exactly once with the requested payload. Do not use any other tool. After the tool call, respond with one short sentence only." \
  -p "Call workflow_execute exactly once with request { mode: 'chain', steps: [ { kind: 'step', agent: 'scout', objective: 'Inspect the current package repo and identify the main workflow-composition entry points.' }, { kind: 'step', agent: 'reviewer', objective: 'Review the discovered workflow-composition surface and summarize the main runtime risks in 3 bullets.' } ] }. Use the current cwd as the workflow repo. After the tool call, respond with one short sentence only."
```

## Observed proof

Session JSONL inspection shows:
- the assistant emitted exactly one `workflow_execute` tool call
- the tool payload resolved `cwd` to the package repo
- the request ran in `mode: "chain"`
- both steps completed with `status: done`
- the tool returned structured aggregated workflow output

Observed tool payload excerpt:

```text
name: workflow_execute
request.mode: chain
request.cwd: /home/tryinget/ai-society/softwareco/owned/pi-extensions/packages/pi-society-orchestrator
steps:
  1. scout    — Inspect the current package repo and identify the main workflow-composition entry points.
  2. reviewer — Review the discovered workflow-composition surface and summarize the main runtime risks in 3 bullets.
```

Observed tool result excerpt:

```text
✓ Workflow (chain) — done — 2 step(s) executed

## Workflow summary
- mode: chain
- status: done
- executed_steps: 2/2
- step_statuses: done=2
```

Observed scout output established the real entry points as:
- `extensions/society-orchestrator.ts`
- `workflow_execute` -> `src/runtime/workflow-execution.ts` + `src/runtime/workflow.ts`
- `loop_execute` / `/loop` / `/loops` -> `src/loops/engine.ts`
- shared execution substrate -> `src/runtime/subagent.ts`

Observed reviewer output completed successfully as the second step and returned the requested aggregated review section.

Final assistant response after the tool call:

```text
Done.
```

## Interpretation

This does **not** replace package-local contract tests or installed-package smoke.
It proves the complementary thing those surfaces do not:
- after reload,
- in a real Pi session,
- the live extension exposed `workflow_execute`,
- accepted a real tool payload,
- and completed one bounded repo-local chain successfully.

## Verdict

The first live-host bounded proof for `workflow_execute` is present.

Current evidence stack now includes:
1. package-local workflow contract + execution tests
2. installed-package release smoke
3. one live-host read-only `workflow_execute` chain after reload
