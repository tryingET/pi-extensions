import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkflowExecutor,
  WorkflowExecutionError,
} from "../src/runtime/workflow-execution.ts";

function createFakeDispatchResult({
  status = "done",
  output,
  exitCode = status === "done" ? 0 : 1,
  elapsed = 25,
  failureKind,
}) {
  return {
    ok: status === "done",
    text: `[custom] ${status}`,
    details: {
      status,
      fullOutput: output,
      displayOutput: output,
      exitCode,
      elapsed,
      failureKind,
      timedOut: status === "timed_out",
      aborted: status === "aborted",
    },
  };
}

test("workflow executor runs chain steps through the ASC-backed subagent executor and preserves step truth", async () => {
  const calls = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        calls.push({
          objective: params.objective,
          cwd: params.cwd,
          agent: params.agentProfile.name,
        });

        if (params.objective.includes("Review")) {
          return createFakeDispatchResult({
            status: "error",
            output: "review failed",
            failureKind: "assistant_protocol_error",
            exitCode: 1,
          });
        }

        return createFakeDispatchResult({
          status: "done",
          output: `ok: ${params.objective}`,
          exitCode: 0,
        });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo/fallback",
    cognitiveToolContent: "FRAMEWORK: workflow",
    request: {
      mode: "chain",
      cwd: "/repo/request",
      steps: [
        { kind: "step", agent: "scout", objective: "Map the auth flow" },
        {
          kind: "step",
          agent: "reviewer",
          objective: "Review the change set",
          cwd: "/repo/step-override",
        },
      ],
    },
  });

  assert.equal(result.mode, "chain");
  assert.equal(result.status, "error");
  assert.deepEqual(calls, [
    {
      objective: "Map the auth flow",
      cwd: "/repo/request",
      agent: "scout",
    },
    {
      objective: "Review the change set",
      cwd: "/repo/step-override",
      agent: "reviewer",
    },
  ]);
  assert.deepEqual(
    result.steps.map((step) => ({
      index: step.index,
      agent: step.agent,
      status: step.status,
      failureKind: step.failureKind || null,
    })),
    [
      { index: 0, agent: "scout", status: "done", failureKind: null },
      {
        index: 1,
        agent: "reviewer",
        status: "error",
        failureKind: "assistant_protocol_error",
      },
    ],
  );
  assert.match(result.aggregatedOutput, /## Workflow summary/);
  assert.match(result.aggregatedOutput, /- mode: chain/);
  assert.match(result.aggregatedOutput, /- status: error/);
  assert.match(result.aggregatedOutput, /- executed_steps: 2\/2/);
  assert.match(result.aggregatedOutput, /- failure_kinds: assistant_protocol_error=1/);
  assert.match(result.aggregatedOutput, /## Step 1 — scout — done/);
  assert.match(result.aggregatedOutput, /Objective: Map the auth flow/);
  assert.match(result.aggregatedOutput, /## Step 2 — reviewer — error/);
  assert.match(result.aggregatedOutput, /Failure kind: assistant_protocol_error/);
});

test("workflow executor stops a chain after the first failing node", async () => {
  const calls = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        calls.push(params.objective);

        if (params.objective.includes("Review")) {
          return createFakeDispatchResult({
            status: "error",
            output: "review failed",
            failureKind: "assistant_protocol_error",
            exitCode: 1,
          });
        }

        return createFakeDispatchResult({
          status: "done",
          output: `done: ${params.objective}`,
          exitCode: 0,
        });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    request: {
      mode: "chain",
      steps: [
        { kind: "step", agent: "scout", objective: "Map the auth flow" },
        { kind: "step", agent: "reviewer", objective: "Review the auth patch" },
        { kind: "step", agent: "builder", objective: "Implement the auth patch" },
      ],
    },
  });

  assert.equal(result.status, "error");
  assert.deepEqual(calls, ["Map the auth flow", "Review the auth patch"]);
  assert.deepEqual(
    result.steps.map((step) => ({ index: step.index, agent: step.agent, status: step.status })),
    [
      { index: 0, agent: "scout", status: "done" },
      { index: 1, agent: "reviewer", status: "error" },
    ],
  );
  assert.match(result.aggregatedOutput, /- executed_steps: 2\/3/);
  assert.match(result.aggregatedOutput, /- halted_early: true/);
  assert.equal(result.aggregatedOutput.includes("Implement the auth patch"), false);
});

test("workflow executor preserves input order for parallel groups", async () => {
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        if (params.objective.includes("B")) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        return createFakeDispatchResult({
          status: "done",
          output: `done: ${params.objective}`,
          exitCode: 0,
        });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    request: {
      mode: "parallel",
      steps: [
        {
          kind: "parallel",
          tasks: [
            { kind: "step", agent: "builder", objective: "Implement feature A" },
            { kind: "step", agent: "builder", objective: "Implement feature B" },
          ],
        },
      ],
    },
  });

  assert.equal(result.status, "done");
  assert.deepEqual(
    result.steps.map((step) => ({ index: step.index, output: step.displayOutput })),
    [
      { index: 0, output: "done: Implement feature A" },
      { index: 1, output: "done: Implement feature B" },
    ],
  );
  assert.match(result.aggregatedOutput, /## Parallel group 1 — done/);
  assert.match(result.aggregatedOutput, /### Task 1 — builder — done/);
  assert.match(result.aggregatedOutput, /### Task 2 — builder — done/);
});

test("workflow executor renders parallel failure fan-in without hiding raw step failures", async () => {
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        if (params.objective.includes("Review")) {
          return createFakeDispatchResult({
            status: "error",
            output: "review failed",
            failureKind: "assistant_protocol_error",
            exitCode: 1,
          });
        }

        return createFakeDispatchResult({
          status: "done",
          output: `done: ${params.objective}`,
          exitCode: 0,
        });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    request: {
      mode: "parallel",
      steps: [
        {
          kind: "parallel",
          tasks: [
            { kind: "step", agent: "builder", objective: "Implement feature A" },
            { kind: "step", agent: "reviewer", objective: "Review feature A" },
          ],
        },
      ],
    },
  });

  assert.equal(result.status, "error");
  assert.deepEqual(
    result.steps.map((step) => ({
      index: step.index,
      agent: step.agent,
      status: step.status,
      failureKind: step.failureKind || null,
    })),
    [
      { index: 0, agent: "builder", status: "done", failureKind: null },
      {
        index: 1,
        agent: "reviewer",
        status: "error",
        failureKind: "assistant_protocol_error",
      },
    ],
  );
  assert.match(result.aggregatedOutput, /- step_statuses: done=1, error=1/);
  assert.match(result.aggregatedOutput, /## Parallel group 1 — error/);
  assert.match(result.aggregatedOutput, /- failure_kinds: assistant_protocol_error=1/);
  assert.match(result.aggregatedOutput, /### Task 2 — reviewer — error/);
  assert.match(result.aggregatedOutput, /Failure kind: assistant_protocol_error/);
});

test("workflow executor fails closed on team validation before execution starts", async () => {
  let calls = 0;
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute() {
        calls += 1;
        return createFakeDispatchResult({ status: "done", output: "unexpected" });
      },
    },
  });

  await assert.rejects(
    executor.execute({
      activeTeam: "quality",
      model: "mock/model",
      cwd: "/repo",
      cognitiveToolContent: "FRAMEWORK: workflow",
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "builder", objective: "Implement a fix" }],
      },
    }),
    (error) => {
      assert.ok(error instanceof WorkflowExecutionError);
      assert.equal(error.code, "workflow_validation_failed");
      assert.deepEqual(
        error.issues?.map((issue) => issue.code),
        ["team_disallows_agent"],
      );
      return true;
    },
  );

  assert.equal(calls, 0);
});

test("workflow executor fails closed on worktree requests until WF-4 lands", async () => {
  let calls = 0;
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute() {
        calls += 1;
        return createFakeDispatchResult({ status: "done", output: "unexpected" });
      },
    },
  });

  await assert.rejects(
    executor.execute({
      activeTeam: "full",
      model: "mock/model",
      cwd: "/repo",
      cognitiveToolContent: "FRAMEWORK: workflow",
      request: {
        mode: "parallel",
        steps: [
          {
            kind: "parallel",
            worktree: true,
            tasks: [{ kind: "step", agent: "builder", objective: "Implement feature A" }],
          },
        ],
      },
    }),
    (error) => {
      assert.ok(error instanceof WorkflowExecutionError);
      assert.equal(error.code, "workflow_worktree_not_yet_supported");
      return true;
    },
  );

  assert.equal(calls, 0);
});
