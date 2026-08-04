// summary: verifies bounded ASC execution observations and best-effort dispatch_subagent event projection.
// read_when:
//   - changing ASC observation schemas, event-bus projection, or observer privacy boundaries.

import assert from "node:assert/strict";
import test from "node:test";
import {
  ASC_EXECUTION_OBSERVATION_EVENT,
  ASC_EXECUTION_OBSERVATION_SCHEMA,
  projectAscExecutionGroupTerminal,
  projectAscExecutionResult,
  projectAscExecutionUpdate,
} from "../execution.ts";
import { registerDispatchSubagentTool } from "../extensions/self/subagent.ts";

const context = {
  producer: "loop_execute",
  cwd: "/workspace/private-repo",
  group: { id: "transcendent-123", kind: "loop", label: "TRANSCENDENT loop" },
  phase: {
    name: "first-100x",
    index: 2,
    count: 8,
    agent: "builder",
    cognitiveTool: "nexus",
  },
};

test("ASC progress observations expose bounded telemetry without prompt or output content", () => {
  const observation = projectAscExecutionUpdate(
    {
      text: "sensitive update text",
      details: {
        status: "running",
        progressPhase: "running",
        progressSequence: 7,
        lastActivityAt: 123_456,
        latestTool: "edit\nwith-control",
        dispatchId: "dispatch-123",
        attemptId: "attempt-456",
        profile: "custom",
        objective: "secret objective",
        sessionFile: "/secret/session.jsonl",
        taskContract: {
          objective: "secret objective",
          deliverable: "secret deliverable",
          acceptanceCriteria: [],
          constraints: [],
          evidenceRequired: [],
          stopConditions: [],
          allowedPaths: ["secret/**"],
          forbiddenPaths: [],
          boundary: "secret boundary",
        },
        fullOutput: "secret assistant output",
        stderr: "secret stderr",
        usage: {
          turns: 5,
          input: 10,
          output: 20,
          cacheRead: 3,
          cacheWrite: 1,
          cost: 0.01,
          contextTokens: 33,
        },
      },
    },
    context,
    1700000000000,
  );

  assert.equal(observation?.schema, ASC_EXECUTION_OBSERVATION_SCHEMA);
  assert.equal(observation?.event, "dispatch_progress");
  assert.equal(observation?.progress.latestTool, "edit with-control");
  assert.equal(observation?.phase?.index, 2);
  assert.equal(observation?.progress.usage?.turns, 5);

  const serialized = JSON.stringify(observation);
  for (const forbidden of [
    "sensitive update text",
    "secret objective",
    "secret deliverable",
    "/secret/session.jsonl",
    "secret assistant output",
    "secret stderr",
    "secret/**",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("ASC terminal observations preserve status and effect disposition without result bodies", () => {
  const observation = projectAscExecutionResult(
    {
      ok: false,
      text: "sensitive terminal body",
      details: {
        status: "timed_out",
        failureKind: "timed_out",
        elapsed: 601_098,
        fullOutput: "secret full output",
        displayOutput: "secret display output",
        effectReceipt: {
          schema: "asc.dispatch_effect_receipt.v1",
          dispatchId: "dispatch-123",
          attemptId: "attempt-456",
          sessionName: "builder",
          consumerCorrelationId: "phase-attempt",
          disposition: "effect_indeterminate",
          receiptPath: "/private/receipt.json",
          recordedAt: "2026-08-04T00:00:00.000Z",
        },
      },
    },
    context,
    1700000000000,
  );

  assert.deepEqual(observation?.terminal, {
    ok: false,
    status: "timed_out",
    failureKind: "timed_out",
    effectDisposition: "effect_indeterminate",
    elapsedMs: 601_098,
  });
  assert.equal(JSON.stringify(observation).includes("sensitive"), false);
  assert.equal(JSON.stringify(observation).includes("receipt.json"), false);
});

test("ASC group terminal projection remains distinct from one dispatch terminal", () => {
  const observation = projectAscExecutionGroupTerminal(
    { ...context, phase: undefined },
    { ok: true, status: "done", effectDisposition: "settled", elapsedMs: 2_000 },
    1700000000000,
  );
  assert.equal(observation?.event, "group_terminal");
  assert.equal(observation?.group.id, "transcendent-123");
  assert.equal(observation?.terminal.ok, true);
  assert.equal(observation?.terminal.effectDisposition, "settled");
});

test("ASC projector rejects ambiguous group identity, cwd, and producer/kind combinations", () => {
  const update = { text: "running", details: { status: "running" } };
  assert.equal(projectAscExecutionUpdate(update, { ...context, cwd: "relative" }), undefined);
  assert.equal(
    projectAscExecutionUpdate(update, {
      ...context,
      producer: "dispatch_subagent",
    }),
    undefined,
  );
  assert.equal(
    projectAscExecutionUpdate(update, {
      ...context,
      group: { ...context.group, id: "x".repeat(161) },
    }),
    undefined,
  );
});

test("dispatch_subagent emits no-throw progress and terminal observations", async () => {
  const emitted = [];
  let registeredTool;
  const pi = {
    events: {
      emit(name, event) {
        emitted.push({ name, event });
      },
    },
    registerTool(tool) {
      registeredTool = tool;
    },
  };
  const runtime = {
    state: { sessionsDir: "/sessions" },
    cancel() {
      return { ok: false, status: "not_running" };
    },
    async execute(_request, _ctx, onUpdate) {
      onUpdate?.({
        text: "running",
        details: {
          status: "running",
          profile: "reviewer",
          dispatchId: "dispatch-event",
          attemptId: "attempt-event",
          progressSequence: 2,
          progressPhase: "running",
          lastActivityAt: 123,
        },
      });
      return {
        ok: true,
        text: "done",
        details: {
          status: "done",
          profile: "reviewer",
          dispatchId: "dispatch-event",
          attemptId: "attempt-event",
          elapsed: 20,
        },
      };
    },
  };

  registerDispatchSubagentTool(pi, runtime);
  const result = await registeredTool.execute(
    "tool-call-1",
    { profile: "reviewer", objective: "private objective" },
    undefined,
    undefined,
    { cwd: "/repo" },
  );

  assert.equal(result.details.status, "done");
  assert.deepEqual(
    emitted.map((entry) => [entry.name, entry.event.event]),
    [
      [ASC_EXECUTION_OBSERVATION_EVENT, "dispatch_progress"],
      [ASC_EXECUTION_OBSERVATION_EVENT, "dispatch_terminal"],
    ],
  );
  assert.equal(JSON.stringify(emitted).includes("private objective"), false);
});

test("a throwing ASC observation listener cannot perturb dispatch execution", async () => {
  let registeredTool;
  const pi = {
    events: {
      emit() {
        throw new Error("observer failed");
      },
    },
    registerTool(tool) {
      registeredTool = tool;
    },
  };
  const runtime = {
    state: { sessionsDir: "/sessions" },
    cancel() {
      return { ok: false, status: "not_running" };
    },
    async execute(_request, _ctx, onUpdate) {
      onUpdate?.({ text: "running", details: { status: "running" } });
      return { ok: true, text: "done", details: { status: "done" } };
    },
  };

  registerDispatchSubagentTool(pi, runtime);
  const result = await registeredTool.execute(
    "tool-call-2",
    { profile: "minimal", objective: "work" },
    undefined,
    undefined,
    { cwd: "/repo" },
  );
  assert.equal(result.details.status, "done");
});
