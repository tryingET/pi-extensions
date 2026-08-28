/**
 * summary: "Workflow execution coverage (executor semantics); split from workflow-execution.test.mjs."
 * read_when:
 *   - "changing executor semantics workflow executor behavior."
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorkflowExecutor } from "../../src/runtime/workflow-execution.ts";
import { createFakeDispatchResult, waitFor } from "./helpers.mjs";

test("workflow effect correlation requires an exact settled ASC receipt", async () => {
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-effect-receipt-"));
  let receiptMode = "missing";
  let attempt = 0;
  const executor = createWorkflowExecutor({
    sessionsDir,
    executor: {
      state: {},
      async execute(params) {
        attempt += 1;
        const result = createFakeDispatchResult({ status: "done", output: "review complete" });
        const attemptId = `attempt-${attempt}`;
        const sessionName = "workflow-reviewer";
        const consumerCorrelationId =
          receiptMode === "wrong-correlation" ? "wrong-handoff" : params.effectCorrelationId;
        Object.assign(result.details, {
          dispatchId: `dispatch-${attempt}`,
          attemptId,
          sessionName,
          effectCorrelationId: consumerCorrelationId,
        });
        if (receiptMode !== "missing") {
          const receiptPath = path.join(
            sessionsDir,
            `${sessionName}.${attemptId}.effect-receipt.json`,
          );
          const receipt = {
            schema: "asc.dispatch_effect_receipt.v1",
            dispatchId: result.details.dispatchId,
            attemptId,
            sessionName,
            consumerCorrelationId,
            disposition: "settled",
            receiptPath,
            recordedAt: new Date().toISOString(),
          };
          fs.writeFileSync(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
          result.details.effectReceipt = receipt;
        }
        return result;
      },
    },
  });
  const execute = () =>
    executor.execute({
      activeTeam: "full",
      model: "mock/model",
      cwd: "/repo",
      cognitiveToolContent: "SEALED DEEP REVIEW",
      effectCorrelationId: "vault-handoff-1",
      request: {
        mode: "chain",
        steps: [{ kind: "step", agent: "reviewer", objective: "Review the change" }],
      },
    });

  try {
    const missing = await execute();
    assert.equal(missing.status, "error");
    assert.match(missing.steps[0].displayOutput, /effect receipt did not verify/);

    receiptMode = "wrong-correlation";
    const wrongCorrelation = await execute();
    assert.equal(wrongCorrelation.status, "error");

    receiptMode = "exact";
    const exact = await execute();
    assert.equal(exact.status, "done");
    assert.equal(exact.steps[0].status, "done");
  } finally {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  }
});

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
  assert.equal(result.worktreeSummary, undefined);
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

test("workflow executor enforces parallel group concurrency without changing result order", async () => {
  let active = 0;
  let peakActive = 0;
  const started = [];
  const releases = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        const taskNumber = Number(params.objective.at(-1));
        started.push(taskNumber);
        active += 1;
        peakActive = Math.max(peakActive, active);
        await new Promise((resolve) => {
          releases[taskNumber] = resolve;
        });
        active -= 1;
        return createFakeDispatchResult({
          status: "done",
          output: `done: ${taskNumber}`,
        });
      },
    },
  });

  const execution = executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    request: {
      mode: "parallel",
      steps: [
        {
          kind: "parallel",
          concurrency: 2,
          tasks: [1, 2, 3, 4].map((taskNumber) => ({
            kind: "step",
            agent: "builder",
            objective: `Implement feature ${taskNumber}`,
          })),
        },
      ],
    },
  });

  await waitFor(() => started.length === 2);
  assert.deepEqual(started, [1, 2]);
  assert.equal(peakActive, 2);

  releases[2]();
  await waitFor(() => started.length === 3);
  assert.deepEqual(started, [1, 2, 3]);
  assert.equal(peakActive, 2);

  releases[1]();
  await waitFor(() => started.length === 4);
  assert.deepEqual(started, [1, 2, 3, 4]);
  assert.equal(peakActive, 2);

  releases[3]();
  releases[4]();
  const result = await execution;

  assert.deepEqual(
    result.steps.map((step) => step.displayOutput),
    ["done: 1", "done: 2", "done: 3", "done: 4"],
  );
  assert.match(result.aggregatedOutput, /- concurrency: 2/);
});

test("workflow executor stops queued parallel dispatches after an executor rejection", async () => {
  const started = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        started.push(params.objective);
        throw new Error("ASC execution seam unavailable");
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
            concurrency: 1,
            tasks: [1, 2, 3].map((taskNumber) => ({
              kind: "step",
              agent: "builder",
              objective: `Implement feature ${taskNumber}`,
            })),
          },
        ],
      },
    }),
    /ASC execution seam unavailable/,
  );

  assert.deepEqual(started, ["Implement feature 1"]);
});

test("workflow executor stops queued parallel dispatches after ASC fulfills an aborted result", async () => {
  const started = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        started.push(params.objective);
        return createFakeDispatchResult({
          status: "aborted",
          output: "cancelled by operator",
          failureKind: "aborted",
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
          concurrency: 1,
          tasks: [1, 2, 3].map((taskNumber) => ({
            kind: "step",
            agent: "builder",
            objective: `Implement feature ${taskNumber}`,
          })),
        },
      ],
    },
  });

  assert.equal(result.status, "aborted");
  assert.deepEqual(started, ["Implement feature 1"]);
  assert.deepEqual(
    result.steps.map((step) => step.status),
    ["aborted"],
  );
  assert.match(result.aggregatedOutput, /- executed_steps: 1\/3/);
  assert.match(result.aggregatedOutput, /- halted_early: true/);
});

test("workflow executor does not claim work when the cancellation signal is already aborted", async () => {
  const controller = new AbortController();
  controller.abort();
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

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    signal: controller.signal,
    request: {
      mode: "parallel",
      steps: [
        {
          kind: "parallel",
          concurrency: 1,
          tasks: [{ kind: "step", agent: "builder", objective: "Do not dispatch" }],
        },
      ],
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.status, "aborted");
  assert.deepEqual(result.steps, []);
  assert.match(result.aggregatedOutput, /- status: aborted/);
  assert.match(result.aggregatedOutput, /- executed_steps: 0\/1/);
  assert.match(result.aggregatedOutput, /- halted_early: true/);
});

test("workflow cancellation does not cross node boundaries in parallel mode", async () => {
  const started = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        started.push(params.objective);
        return createFakeDispatchResult({
          status: params.objective === "Cancel workflow" ? "aborted" : "done",
          output: params.objective,
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
        { kind: "step", agent: "builder", objective: "Cancel workflow" },
        { kind: "step", agent: "builder", objective: "Must remain queued" },
      ],
    },
  });

  assert.equal(result.status, "aborted");
  assert.deepEqual(started, ["Cancel workflow"]);
  assert.match(result.aggregatedOutput, /- executed_steps: 1\/2/);
  assert.match(result.aggregatedOutput, /- halted_early: true/);
});

test("late cancellation does not rewrite completed ASC step truth", async () => {
  const controller = new AbortController();
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute() {
        controller.abort();
        return createFakeDispatchResult({ status: "done", output: "completed" });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    signal: controller.signal,
    request: {
      mode: "parallel",
      steps: [{ kind: "step", agent: "builder", objective: "Complete final step" }],
    },
  });

  assert.equal(result.status, "done");
  assert.deepEqual(
    result.steps.map((step) => step.status),
    ["done"],
  );
});

test("cancellation with no queued parallel work does not rewrite completed ASC truth", async () => {
  const controller = new AbortController();
  let completed = 0;
  let started = 0;
  let release;
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        started += 1;
        await barrier;
        completed += 1;
        return createFakeDispatchResult({ status: "done", output: params.objective });
      },
    },
  });

  const execution = executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    signal: controller.signal,
    request: {
      mode: "parallel",
      steps: [
        {
          kind: "parallel",
          concurrency: 2,
          tasks: [1, 2].map((taskNumber) => ({
            kind: "step",
            agent: "builder",
            objective: `Complete task ${taskNumber}`,
          })),
        },
      ],
    },
  });

  await waitFor(() => started === 2);
  controller.abort();
  release();
  const result = await execution;

  assert.equal(completed, 2);
  assert.equal(result.status, "done");
  assert.deepEqual(
    result.steps.map((step) => step.status),
    ["done", "done"],
  );
});

test("queued signal cancellation preserves completed ASC truth while marking the partial group aborted", async () => {
  const controller = new AbortController();
  const started = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        started.push(params.objective);
        controller.abort();
        return createFakeDispatchResult({
          status: "done",
          output: "completed before cancellation",
        });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    signal: controller.signal,
    request: {
      mode: "parallel",
      steps: [
        {
          kind: "parallel",
          concurrency: 1,
          tasks: [1, 2].map((taskNumber) => ({
            kind: "step",
            agent: "builder",
            objective: `Queued task ${taskNumber}`,
          })),
        },
      ],
    },
  });

  assert.deepEqual(started, ["Queued task 1"]);
  assert.equal(result.status, "aborted");
  assert.deepEqual(
    result.steps.map((step) => step.status),
    ["done"],
  );
  assert.match(result.aggregatedOutput, /## Parallel group 1 — aborted/);
  assert.match(result.aggregatedOutput, /- executed_tasks: 1\/2/);
  assert.match(result.aggregatedOutput, /- halted_early: true/);
});

test("queued cancellation does not mask an ASC timed-out result", async () => {
  const controller = new AbortController();
  const started = [];
  const executor = createWorkflowExecutor({
    executor: {
      state: {},
      async execute(params) {
        started.push(params.objective);
        controller.abort();
        return createFakeDispatchResult({ status: "timed_out", output: "ASC timed out" });
      },
    },
  });

  const result = await executor.execute({
    activeTeam: "full",
    model: "mock/model",
    cwd: "/repo",
    cognitiveToolContent: "FRAMEWORK: workflow",
    signal: controller.signal,
    request: {
      mode: "parallel",
      steps: [
        {
          kind: "parallel",
          concurrency: 1,
          tasks: [1, 2].map((taskNumber) => ({
            kind: "step",
            agent: "builder",
            objective: `Timed task ${taskNumber}`,
          })),
        },
      ],
    },
  });

  assert.deepEqual(started, ["Timed task 1"]);
  assert.equal(result.status, "timed_out");
  assert.deepEqual(
    result.steps.map((step) => step.status),
    ["timed_out"],
  );
  assert.match(result.aggregatedOutput, /- halted_early: true/);
});
