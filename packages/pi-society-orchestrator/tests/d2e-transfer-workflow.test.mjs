import assert from "node:assert/strict";
import test from "node:test";
import {
  D2E_TRANSFER_COMPLETE_SCHEMA,
  D2E_WORKFLOW_TEMPLATE_NAMES,
  D2ETransferError,
  executeD2ETransferWorkflow,
} from "../src/runtime/d2e-transfer-workflow.ts";

const repo = "/repos/frankensqlite";
const packetKey = "decision-87-generation-stable-sidecar-safe-vfs-open";

function fixtures(overrides = {}) {
  return {
    packet: {
      packet: {
        id: 74,
        repo_scope: repo,
        packet_key: packetKey,
        lifecycle_state: "assessed",
        source_ref: "https://example.test/repo/blob/317d2795/design-packet.md",
        entity_version: 1,
      },
      links: [
        {
          link_kind: "decision",
          target_ref: "decision:87",
          authority_mode: "canonical",
        },
        { link_kind: "task", target_ref: "task:4381", authority_mode: "canonical" },
      ],
    },
    task: {
      id: 4381,
      repo,
      status: "claimed",
      claimed_by: "operator-session",
      lease_expires_at: "2030-01-01T00:00:00.000Z",
      entity_version: 4,
    },
    decision: {
      decision: {
        id: 87,
        repo_scope: repo,
        state: "unblocked",
        outcome: "accepted",
        updated_at: "2026-07-31T17:05:19.450Z",
      },
      linked_tasks: [{ decision_id: 87, task_id: 4381, link_role: "post_adr_execution" }],
    },
    ...overrides,
  };
}

function fakeExec(data, calls = []) {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    const kind = args[0];
    return { stdout: JSON.stringify(data[kind]), stderr: "", code: 0 };
  };
}

function request(mode, templateName = "layer12-040-direction-to-execution-ak-native") {
  return {
    templateName,
    mode,
    repo,
    packetKey,
    taskId: 4381,
    decisionId: 87,
    objective: "Implement only the explicitly authorized Decision 87 owner task",
  };
}

test("all three exact D2E templates share the bounded workflow gate", () => {
  assert.deepEqual(
    [...D2E_WORKFLOW_TEMPLATE_NAMES],
    [
      "direction-to-execution",
      "repo-direction-to-execution",
      "layer12-040-direction-to-execution-ak-native",
    ],
  );
  assert.ok(Object.isFrozen(D2E_WORKFLOW_TEMPLATE_NAMES));
});

test("proposal mode performs exact readback but never calls the workflow executor", async () => {
  const calls = [];
  let workflowCalls = 0;
  const data = fixtures({
    task: {
      ...fixtures().task,
      status: "pending",
      claimed_by: null,
      lease_expires_at: null,
      active_deferral: {
        state: "active",
        trigger_ref: "operator-authorization:decision-87-implementation",
      },
    },
  });

  const result = await executeD2ETransferWorkflow({
    request: request("proposal"),
    exec: fakeExec(data, calls),
    workflowExecutor: {
      async execute() {
        workflowCalls += 1;
        throw new Error("proposal must not execute");
      },
    },
    workflowExecution: {
      activeTeam: "full",
      model: "mock/model",
      cwd: repo,
      cognitiveToolContent: "controlled",
    },
    now: () => Date.parse("2026-08-01T00:00:00Z"),
  });

  assert.equal(result.kind, "proposal");
  assert.equal(result.receipt.schema, "D2E_TRANSFER_PROPOSAL_V1");
  assert.equal(result.receipt.read_only, true);
  assert.equal(result.receipt.applied, false);
  assert.equal(result.receipt.applied_ready, false);
  assert.equal(result.receipt.authorization.blocker, "active_task_deferral");
  assert.equal(workflowCalls, 0);
  assert.deepEqual(
    calls.map((call) => call.args.slice(0, 2)),
    [
      ["packet", "show"],
      ["task", "show"],
      ["decision", "show"],
    ],
  );
});

test("applied mode fails closed with a stable authorization error for incomplete state", async () => {
  const data = fixtures({
    task: {
      ...fixtures().task,
      status: "pending",
      claimed_by: null,
      lease_expires_at: null,
      active_deferral: { state: "active" },
    },
  });

  await assert.rejects(
    executeD2ETransferWorkflow({
      request: request("applied"),
      exec: fakeExec(data),
      now: () => Date.parse("2026-08-01T00:00:00Z"),
    }),
    (error) => {
      assert.ok(error instanceof D2ETransferError);
      assert.equal(error.code, "D2E_TRANSFER_AUTHORIZATION_REQUIRED");
      assert.match(error.message, /active_task_deferral/);
      return true;
    },
  );
});

test("applied mode rejects packet/task/decision identity drift before workflow execution", async () => {
  const base = fixtures();
  const cases = [
    {
      data: fixtures({
        packet: { ...base.packet, packet: { ...base.packet.packet, packet_key: "other" } },
      }),
      code: "D2E_TRANSFER_PACKET_MISMATCH",
    },
    {
      data: fixtures({ task: { ...base.task, id: 999 } }),
      code: "D2E_TRANSFER_TASK_MISMATCH",
    },
    {
      data: fixtures({
        decision: {
          ...base.decision,
          decision: { ...base.decision.decision, outcome: "rejected" },
        },
      }),
      code: "D2E_TRANSFER_DECISION_MISMATCH",
    },
  ];

  for (const fixture of cases) {
    let workflowCalls = 0;
    await assert.rejects(
      executeD2ETransferWorkflow({
        request: request("applied"),
        exec: fakeExec(fixture.data),
        workflowExecutor: {
          async execute() {
            workflowCalls += 1;
            throw new Error("must not execute");
          },
        },
        workflowExecution: {
          activeTeam: "full",
          model: "mock/model",
          cwd: repo,
          cognitiveToolContent: "controlled",
        },
        now: () => Date.parse("2026-08-01T00:00:00Z"),
      }),
      (error) => error instanceof D2ETransferError && error.code === fixture.code,
    );
    assert.equal(workflowCalls, 0);
  }
});

test("complete applied fixture executes the existing workflow seam and emits D2E_TRANSFER_COMPLETE_V1", async () => {
  const workflowCalls = [];
  const workflowExecutor = {
    async execute(input) {
      workflowCalls.push(input);
      return {
        mode: "chain",
        status: "done",
        steps: [{ index: 0, agent: "builder", status: "done", displayOutput: "implemented" }],
        aggregatedOutput: "done",
      };
    },
  };

  const result = await executeD2ETransferWorkflow({
    request: request("applied", "repo-direction-to-execution"),
    exec: fakeExec(fixtures()),
    workflowExecutor,
    workflowExecution: {
      activeTeam: "implement",
      model: "mock/model",
      cwd: repo,
      cognitiveToolContent: "controlled",
    },
    now: () => Date.parse("2026-08-01T00:00:00Z"),
  });

  assert.equal(result.kind, "complete");
  assert.equal(result.receipt.schema, D2E_TRANSFER_COMPLETE_SCHEMA);
  assert.equal(result.receipt.applied, true);
  assert.equal(result.receipt.authorization.granted, true);
  assert.equal(result.receipt.packet.key, packetKey);
  assert.equal(result.receipt.task.id, 4381);
  assert.equal(result.receipt.decision.id, 87);
  assert.deepEqual(result.receipt.workflow, { mode: "chain", status: "done", step_count: 1 });
  assert.equal(workflowCalls.length, 1);
  assert.equal(workflowCalls[0].request.steps[0].agent, "builder");
  assert.match(workflowCalls[0].request.steps[0].objective, /Exact packet: decision-87/);
  assert.match(workflowCalls[0].request.steps[0].objective, /Exact AK task: 4381/);
  assert.match(workflowCalls[0].request.steps[0].objective, /Exact AK decision: 87/);
  assert.match(workflowCalls[0].request.steps[0].objective, /Operator objective:/);
});
