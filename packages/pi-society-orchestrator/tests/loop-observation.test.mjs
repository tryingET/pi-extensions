// summary: verifies loop-level ASC observation grouping and the orchestrator public-seam adapter projection.
// read_when:
//   - changing loop observation metadata, ASC event projection, or observer failure isolation.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LoopExecutor, projectLoopGroupTerminalObservation } from "../src/loops/engine.ts";
import { LoopRunCheckpointStore } from "../src/loops/run-checkpoint.ts";
import { AGENT_PROFILES } from "../src/runtime/agent-profiles.ts";
import { createOrchestratorSubagentExecutor } from "../src/runtime/subagent.ts";

const TWO_PHASE_PLUGIN = {
  name: "observer-test",
  phases: ["inspect", "act"],
  description: "Observer grouping fixture",
  cognitiveTools: { inspect: ["audit"], act: ["controlled"] },
  agents: { inspect: "reviewer", act: "builder" },
  continueOnFailure: false,
};

function settledResult(effectCorrelationId) {
  return {
    output: "phase completed",
    exitCode: 0,
    elapsed: 12,
    assistantStopReason: "stop",
    executionState: {
      transport: { kind: "transport", exitCode: 0, aborted: false, timedOut: false },
      protocol: { kind: "assistant_protocol", stopReason: "stop" },
    },
    effectReceipt: {
      schema: "asc.dispatch_effect_receipt.v1",
      dispatchId: `dispatch-${effectCorrelationId}`,
      attemptId: `attempt-${effectCorrelationId}`,
      sessionName: "observer-loop-test",
      consumerCorrelationId: effectCorrelationId,
      disposition: "settled",
      recordedAt: "2026-08-04T00:00:00.000Z",
      receiptPath: `/tmp/${effectCorrelationId}.effect-receipt.json`,
    },
  };
}

test("LoopExecutor gives every phase one shared run observer group with exact phase metadata", async () => {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-observer-operator-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-observer-package-"));
  const observations = [];
  try {
    const executor = new LoopExecutor(TWO_PHASE_PLUGIN, operatorCwd, "/tmp/unused-vault", {
      packageRoot,
      allowUnverifiedKesRoot: true,
      ak: {
        async evidenceRecord() {
          return { ok: true, via: "ak" };
        },
      },
      checkpointStore: new LoopRunCheckpointStore(path.join(operatorCwd, ".loop-runs")),
      captureStateFingerprint: () => "sha256:observer-state",
      verifyEffectReceipt: () => true,
    });

    const result = await executor.execute("private loop objective", async (params) => {
      observations.push(params.observation);
      return settledResult(params.effectCorrelationId);
    });

    assert.equal(result.success, true);
    assert.equal(observations.length, 2);
    assert.deepEqual(
      observations.map((observation) => observation.group.id),
      [result.sessionId, result.sessionId],
    );
    assert.deepEqual(
      observations.map((observation) => observation.phase),
      [
        { name: "inspect", index: 1, count: 2, agent: "reviewer", cognitiveTool: "audit" },
        { name: "act", index: 2, count: 2, agent: "builder", cognitiveTool: "controlled" },
      ],
    );
    assert.equal(JSON.stringify(observations).includes("private loop objective"), false);
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
});

test("retryable loop lineage stays nonterminal while terminal lineage carries effect disposition", () => {
  const baseResult = {
    sessionId: "transcendent-observer-lineage",
    phases: [
      {
        status: "error",
        failureKind: "timed_out",
        effectDisposition: "effect_indeterminate",
      },
    ],
    success: false,
    elapsed: 1_000,
  };

  assert.equal(
    projectLoopGroupTerminalObservation(
      { ...baseResult, retryable: true },
      "/repo",
      "transcendent",
    ),
    undefined,
  );
  const terminal = projectLoopGroupTerminalObservation(baseResult, "/repo", "transcendent");
  assert.equal(terminal?.event, "group_terminal");
  assert.equal(terminal?.terminal.effectDisposition, "effect_indeterminate");
});

test("orchestrator adapter projects ASC progress and terminal events through a no-throw sink", async () => {
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-observer-runtime-"));
  const observations = [];
  try {
    const executor = createOrchestratorSubagentExecutor({
      sessionsDir,
      onObservation(observation) {
        observations.push(observation);
      },
      spawner: async () => ({
        output: "private assistant output",
        exitCode: 0,
        elapsed: 40,
        status: "done",
      }),
    });
    const observation = {
      producer: "loop_execute",
      cwd: "/repo",
      group: { id: "transcendent-456", kind: "loop", label: "TRANSCENDENT loop" },
      phase: {
        name: "diagnose",
        index: 1,
        count: 8,
        agent: "scout",
        cognitiveTool: "first-principles",
      },
    };

    const result = await executor.execute({
      agentProfile: AGENT_PROFILES.scout,
      cognitiveToolName: "first-principles",
      cognitiveToolContent: "private cognitive tool body",
      objective: "private objective",
      model: "mock/provider",
      cwd: "/repo",
      observation,
    });

    assert.equal(result.ok, true);
    assert.equal(result.details.executionTimeoutSeconds, 14_400);
    assert.equal(observations.at(0)?.event, "dispatch_progress");
    assert.equal(observations.at(-1)?.event, "dispatch_terminal");
    assert.ok(observations.every((entry) => entry.group.id === "transcendent-456"));
    const serialized = JSON.stringify(observations);
    assert.equal(serialized.includes("private objective"), false);
    assert.equal(serialized.includes("private cognitive tool body"), false);
    assert.equal(serialized.includes("private assistant output"), false);
  } finally {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  }
});

test("a throwing orchestrator observation sink cannot fail ASC execution", async () => {
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-observer-no-throw-"));
  try {
    const executor = createOrchestratorSubagentExecutor({
      sessionsDir,
      onObservation() {
        throw new Error("observer unavailable");
      },
      spawner: async () => ({ output: "done", exitCode: 0, elapsed: 1, status: "done" }),
    });
    const result = await executor.execute({
      agentProfile: AGENT_PROFILES.reviewer,
      cognitiveToolContent: "audit",
      objective: "work",
      model: "mock/provider",
      cwd: "/repo",
      observation: {
        producer: "loop_execute",
        cwd: "/repo",
        group: { id: "loop-no-throw", kind: "loop", label: "Loop" },
      },
    });
    assert.equal(result.ok, true);
  } finally {
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  }
});
