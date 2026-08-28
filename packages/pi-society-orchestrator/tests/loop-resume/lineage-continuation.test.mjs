/**
 * summary: "Loop resume coverage (lineage continuation); split from loop-resume.test.mjs."
 * read_when:
 *   - "changing lineage continuation loop resume behavior."
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAscExecutionRuntime } from "@tryinget/pi-autonomous-session-control/execution";
import { captureLoopPluginSemanticsHash } from "../../src/loops/engine.ts";
import { deriveResumePhase } from "../../src/loops/run-checkpoint.ts";
import { toExecutionLike } from "../../src/runtime/subagent.ts";
import {
  checkpointOwnerReceipt,
  createHarness,
  phaseFromContext,
  RESUMABLE_PLUGIN,
  settledResult,
} from "./helpers.mjs";

test("LoopExecutor continues from the next undispatched phase under the same durable lineage", async () => {
  const harness = createHarness();
  const objective = "Remove the blocking workflow debt";
  const runId = "transcendent-1783708000100";

  try {
    const checkpoint = harness.checkpointStore.create({
      runId,
      plugin: RESUMABLE_PLUGIN.name,
      pluginSemanticsHash: captureLoopPluginSemanticsHash(RESUMABLE_PLUGIN),
      phases: RESUMABLE_PLUGIN.phases,
      objective,
      cwd: harness.operatorCwd,
      artifactHashes: {},
      stateFingerprint: "sha256:stable-state",
    });
    checkpoint.status = "aborted";
    checkpoint.attempts.push({
      attemptId: "attempt-diagnose",
      phase: "diagnose",
      agent: "scout",
      cognitiveTool: "first-principles",
      status: "done",
      effectDisposition: "settled",
      ownerEffectReceipt: checkpointOwnerReceipt("asc-attempt-diagnose", "attempt-diagnose"),
      output: "diagnose complete",
      outputBytes: 17,
      outputSha256: "564d8a10bc31703add9a208cb3372b9978651d488bf19e1ec540fe500cb174ac",
      outputTruncated: false,
      exitCode: 0,
      elapsed: 10,
      artifactPaths: [],
      timestamp: new Date().toISOString(),
    });
    harness.checkpointStore.save(checkpoint);
    assert.equal(deriveResumePhase(harness.checkpointStore.load(runId)), "dissolve");

    const resumedCalls = [];
    let dissolveContext = "";
    const resumed = await harness.executor.execute(
      objective,
      async ({ context, effectCorrelationId }) => {
        const phase = phaseFromContext(context);
        resumedCalls.push(phase);
        if (phase === "dissolve") dissolveContext = context;
        return settledResult(
          phase === "closure-gate"
            ? `${phase} recovered\nCLOSURE_GATE: PASS`
            : `${phase} recovered`,
          12,
          effectCorrelationId,
        );
      },
      undefined,
      {
        resumeRunId: runId,
        expectedFailedPhase: "dissolve",
        recoveryMode: "validate_then_retry",
      },
    );

    assert.equal(resumed.success, true);
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.resumedPhase, "dissolve");
    assert.equal(resumed.sessionId, runId);
    assert.deepEqual(resumedCalls, ["dissolve", "rebuild", "closure-gate"]);
    assert.match(dissolveContext, /## diagnose — attempt 1 — done/);

    const finalCheckpoint = harness.checkpointStore.load(runId);
    assert.equal(finalCheckpoint.status, "done");
    assert.equal(finalCheckpoint.resumeCount, 1);
    assert.equal(finalCheckpoint.attempts.at(-1)?.phase, "closure-gate");
    assert.equal(resumed.artifacts.filter((artifact) => artifact.type === "kes_diary").length, 1);
    assert.equal(fs.readdirSync(path.join(harness.packageRoot, "diary")).length, 1);
  } finally {
    harness.cleanup();
  }
});

test("LoopExecutor blocks timeout retry because phase effects are indeterminate", async () => {
  const harness = createHarness();
  const objective = "Do not duplicate dissolve effects";
  try {
    const first = await harness.executor.execute(objective, async ({ context }) => ({
      output: `timed out in ${phaseFromContext(context)}`,
      exitCode: 124,
      elapsed: 50,
      timedOut: true,
      failureKind: "timed_out",
    }));
    let redispatched = false;
    const replayed = await harness.executor.execute(
      objective,
      async () => {
        redispatched = true;
        throw new Error("must not dispatch");
      },
      undefined,
      {
        resumeRunId: first.sessionId,
        expectedFailedPhase: "diagnose",
        recoveryMode: "validate_then_retry",
      },
    );
    assert.equal(replayed.success, false);
    assert.equal(redispatched, false);
    assert.equal(replayed.artifacts.length, 1);
  } finally {
    harness.cleanup();
  }
});

test("caught dispatch rejection becomes one attributable terminal failure without redispatch", async () => {
  const harness = createHarness();
  try {
    const result = await harness.executor.execute("Capture rejected dispatch", async () => {
      throw new Error("provider rejected request");
    });
    assert.equal(result.success, false);
    assert.equal(result.artifacts.length, 1);
    assert.equal(result.artifacts[0].type, "kes_diary");
    const checkpoint = harness.checkpointStore.load(result.sessionId);
    assert.equal(checkpoint.status, "failed");
    assert.equal(checkpoint.attempts.length, 1);
    assert.deepEqual(
      {
        phase: checkpoint.attempts[0].phase,
        agent: checkpoint.attempts[0].agent,
        cognitiveTool: checkpoint.attempts[0].cognitiveTool,
        disposition: checkpoint.attempts[0].effectDisposition,
      },
      {
        phase: "diagnose",
        agent: "scout",
        cognitiveTool: "first-principles",
        disposition: "effect_indeterminate",
      },
    );
  } finally {
    harness.cleanup();
  }
});

test("LoopExecutor rejects structurally valid receipts that bypass the verified owner boundary", async () => {
  const harness = createHarness({ trustSyntheticReceipts: false });
  try {
    const result = await harness.executor.execute("Reject forged settlement", async () =>
      settledResult("forged owner settlement", 1),
    );
    assert.equal(result.success, false);
    assert.equal(result.phases.length, 1);
    assert.equal(result.phases[0].failureKind, "effect_receipt_unverified");
    assert.equal(
      harness.checkpointStore.load(result.sessionId).attempts[0].effectDisposition,
      "effect_indeterminate",
    );
  } finally {
    harness.cleanup();
  }
});

test("LoopExecutor blocks a successful phase when its owner receipt is missing", async () => {
  const harness = createHarness();
  const objective = "Require owner-issued settlement";
  try {
    const result = await harness.executor.execute(objective, async () => ({
      output: "transport reported success without owner receipt",
      exitCode: 0,
      elapsed: 1,
    }));
    assert.equal(result.success, false);
    assert.equal(result.phases.length, 1);
    assert.equal(result.phases[0].status, "done");
    assert.equal(result.phases[0].failureKind, "effect_receipt_unverified");
    const checkpoint = harness.checkpointStore.load(result.sessionId);
    assert.equal(checkpoint.status, "failed");
    assert.equal(checkpoint.attempts[0].effectDisposition, "effect_indeterminate");
    let redispatched = false;
    const replayed = await harness.executor.execute(
      objective,
      async () => {
        redispatched = true;
        return settledResult("must not dispatch", 1);
      },
      undefined,
      {
        resumeRunId: result.sessionId,
        expectedFailedPhase: "diagnose",
        recoveryMode: "validate_then_retry",
      },
    );
    assert.equal(replayed.success, false);
    assert.equal(redispatched, false);
    assert.equal(replayed.artifacts.length, 1);
  } finally {
    harness.cleanup();
  }
});

test("LoopExecutor never advances a successful phase whose receipt says confirmed_no_effects", async () => {
  const harness = createHarness();
  try {
    const result = await harness.executor.execute(
      "Retry the unresolved phase",
      async ({ effectCorrelationId }) => ({
        ...settledResult("no effects occurred", 1, effectCorrelationId),
        effectReceipt: {
          ...settledResult("unused", 1, effectCorrelationId).effectReceipt,
          disposition: "confirmed_no_effects",
        },
      }),
    );
    assert.equal(result.success, false);
    assert.equal(result.retryable, true);
    assert.deepEqual(
      result.phases.map((phase) => phase.phase),
      ["diagnose"],
    );
    assert.equal(result.phases[0].failureKind, "effect_receipt_not_settled");
    assert.equal(result.phases[0].effectDisposition, "confirmed_no_effects");
    const checkpoint = harness.checkpointStore.load(result.sessionId);
    assert.equal(checkpoint.status, "retryable");
    assert.equal(checkpoint.attempts[0].effectDisposition, "confirmed_no_effects");
    assert.equal(deriveResumePhase(checkpoint), "diagnose");
  } finally {
    harness.cleanup();
  }
});

test("confirmed dispatch no-effects never overrides an Orchestrator phase-enter hook", async () => {
  let hookCalls = 0;
  const harness = createHarness({
    plugin: {
      ...RESUMABLE_PLUGIN,
      producerHookSemantics: "test.phase-enter-counter.v1",
      async onEnter() {
        hookCalls += 1;
      },
    },
  });
  try {
    const result = await harness.executor.execute(
      "Protect hook effects",
      async ({ effectCorrelationId }) => ({
        ...settledResult("dispatch did not spawn", 1, effectCorrelationId),
        exitCode: 1,
        effectReceipt: {
          ...settledResult("unused", 1, effectCorrelationId).effectReceipt,
          disposition: "confirmed_no_effects",
        },
      }),
    );
    assert.equal(hookCalls, 1);
    assert.equal(result.success, false);
    const checkpoint = harness.checkpointStore.load(result.sessionId);
    assert.equal(checkpoint.attempts[0].effectDisposition, "effect_indeterminate");
    assert.equal(checkpoint.attempts[0].ownerEffectReceipt, undefined);
  } finally {
    harness.cleanup();
  }
});

test("ASC confirmed-no-effects receipt enables one exact same-lineage retry", async () => {
  const harness = createHarness({ trustSyntheticReceipts: false });
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-confirmed-no-effects-"));
  const objective = "Retry after a proven pre-spawn failure";
  try {
    const first = await harness.executor.execute(objective, async ({ effectCorrelationId }) => {
      const rejectedRuntime = createAscExecutionRuntime({
        sessionsDir,
        customSpawnerCapacityOwnership: "parent_owned",
        modelProvider: () => {
          throw new Error("transient model selection failure");
        },
        spawner: async () => {
          throw new Error("pre-spawn failure must not call the spawner");
        },
      });
      const rejected = await rejectedRuntime.execute(
        { profile: "reviewer", objective, effectCorrelationId },
        { cwd: harness.operatorCwd },
      );
      assert.equal(rejected.details.effectReceipt?.disposition, "confirmed_no_effects");
      return toExecutionLike(rejected, sessionsDir);
    });
    assert.equal(first.success, false);
    assert.equal(first.retryable, true);
    assert.equal(first.phases[0].artifacts.length, 0);
    assert.equal(first.artifacts.length, 0, "a retryable lineage is not terminal KES");
    const rejectedCheckpoint = harness.checkpointStore.load(first.sessionId);
    assert.equal(rejectedCheckpoint.attempts[0].artifactPaths.length, 0);
    assert.equal(rejectedCheckpoint.terminalPublication, undefined);
    assert.equal(deriveResumePhase(rejectedCheckpoint), "diagnose");

    const resumedCalls = [];
    const resumed = await harness.executor.execute(
      objective,
      async ({ context, effectCorrelationId }) => {
        const phase = phaseFromContext(context);
        resumedCalls.push(phase);
        const runtime = createAscExecutionRuntime({
          sessionsDir,
          customSpawnerCapacityOwnership: "parent_owned",
          modelProvider: () => "test/model",
          spawner: async () => ({
            output:
              phase === "closure-gate"
                ? `${phase} settled\nCLOSURE_GATE: PASS`
                : `${phase} settled`,
            exitCode: 0,
            elapsed: 1,
            status: "done",
          }),
        });
        const result = await runtime.execute(
          {
            profile: "reviewer",
            objective: `${objective}: ${phase}`,
            effectCorrelationId,
          },
          { cwd: harness.operatorCwd },
        );
        return toExecutionLike(result, sessionsDir);
      },
      undefined,
      {
        resumeRunId: first.sessionId,
        expectedFailedPhase: "diagnose",
        recoveryMode: "validate_then_retry",
      },
    );
    assert.equal(resumed.success, true);
    assert.equal(resumed.retryable, undefined);
    assert.deepEqual(resumedCalls, RESUMABLE_PLUGIN.phases);
    assert.equal(resumed.sessionId, first.sessionId);
    assert.equal(resumed.artifacts.filter((artifact) => artifact.type === "kes_diary").length, 1);
    assert.equal(fs.readdirSync(path.join(harness.packageRoot, "diary")).length, 1);
  } finally {
    harness.cleanup();
    fs.rmSync(sessionsDir, { recursive: true, force: true });
  }
});
