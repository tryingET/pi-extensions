import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAscExecutionRuntime } from "@tryinget/pi-autonomous-session-control/execution";
import {
  captureLoopPluginSemanticsHash,
  LoopExecutor,
  registerLoopTools,
} from "../src/loops/engine.ts";
import {
  captureLoopArtifactHashes,
  deriveResumePhase,
  LOOP_CHECKPOINT_RETENTION_MS,
  LoopResumeError,
  LoopRunCheckpointStore,
  validateResumeCheckpoint,
} from "../src/loops/run-checkpoint.ts";
import { captureLoopStateFingerprint } from "../src/loops/run-state-fingerprint.ts";
import { toExecutionLike } from "../src/runtime/subagent.ts";

const RESUMABLE_PLUGIN = {
  name: "transcendent",
  phases: ["diagnose", "dissolve", "rebuild", "closure-gate"],
  description: "Bounded resume fixture",
  continueOnFailure: false,
  cognitiveTools: {
    diagnose: ["first-principles"],
    dissolve: ["first-principles"],
    rebuild: ["first-principles"],
    "closure-gate": ["audit"],
  },
  agents: {
    diagnose: "scout",
    dissolve: "researcher",
    rebuild: "builder",
    "closure-gate": "reviewer",
  },
};

function createHarness({ trustSyntheticReceipts = true, plugin = RESUMABLE_PLUGIN } = {}) {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-resume-cwd-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-resume-package-"));
  const checkpointStore = new LoopRunCheckpointStore(path.join(packageRoot, ".loop-runs"));
  let fingerprint = "sha256:stable-state";
  const executor = new LoopExecutor(plugin, operatorCwd, "/tmp/unused-vault", {
    packageRoot,
    allowUnverifiedKesRoot: true,
    checkpointStore,
    captureStateFingerprint: () => fingerprint,
    ...(trustSyntheticReceipts
      ? {
          verifyEffectReceipt: (receipt) => receipt?.schema === "asc.dispatch_effect_receipt.v1",
        }
      : {}),
    ak: {
      async evidenceRecord() {
        return { ok: true, via: "ak" };
      },
    },
  });
  return {
    operatorCwd,
    packageRoot,
    checkpointStore,
    executor,
    setFingerprint(value) {
      fingerprint = value;
    },
    cleanup() {
      fs.rmSync(operatorCwd, { recursive: true, force: true });
      fs.rmSync(packageRoot, { recursive: true, force: true });
    },
  };
}

function phaseFromContext(context) {
  return /^## Phase: (.+)$/m.exec(context)?.[1];
}

function checkpointOwnerReceipt(
  attemptId = "asc-attempt-test",
  consumerCorrelationId = "attempt-test",
) {
  return {
    schema: "asc.dispatch_effect_receipt.v1",
    dispatchId: `dispatch-${attemptId}`,
    attemptId,
    sessionName: "loop-test",
    consumerCorrelationId,
    disposition: "settled",
    recordedAt: "2026-07-11T00:00:00.000Z",
    receiptPath: `/tmp/${attemptId}.effect-receipt.json`,
  };
}

function settledResult(output, elapsed, consumerCorrelationId = "attempt-test") {
  return {
    output,
    exitCode: 0,
    elapsed,
    assistantStopReason: "stop",
    executionState: {
      transport: { kind: "transport", exitCode: 0, aborted: false, timedOut: false },
      protocol: { kind: "assistant_protocol", stopReason: "stop" },
    },
    effectReceipt: {
      schema: "asc.dispatch_effect_receipt.v1",
      dispatchId: `dispatch-${consumerCorrelationId}`,
      attemptId: `asc-${consumerCorrelationId}`,
      sessionName: "loop-test",
      consumerCorrelationId,
      disposition: "settled",
      recordedAt: "2026-07-11T00:00:00.000Z",
      receiptPath: `/tmp/${consumerCorrelationId}.effect-receipt.json`,
    },
  };
}

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

test("LoopExecutor fails closed on incomplete resume contracts and legacy missing checkpoints", async () => {
  const harness = createHarness();
  let dispatchCalls = 0;
  const dispatch = async () => {
    dispatchCalls += 1;
    return { output: "unexpected", exitCode: 0, elapsed: 1 };
  };

  try {
    await assert.rejects(
      harness.executor.execute("objective", dispatch, undefined, {
        resumeRunId: "transcendent-1783707951538",
      }),
      (error) =>
        error instanceof LoopResumeError && error.failureKind === "loop_resume_contract_incomplete",
    );
    await assert.rejects(
      harness.executor.execute("objective", dispatch, undefined, {
        resumeRunId: "transcendent-1783707951538",
        expectedFailedPhase: "dissolve",
        recoveryMode: "validate_then_retry",
      }),
      (error) =>
        error instanceof LoopResumeError &&
        error.failureKind === "loop_resume_checkpoint_missing" &&
        /Legacy uncheckpointed runs cannot be resumed safely/.test(error.message),
    );

    const legacyRunId = "transcendent-1783707951539";
    const legacy = harness.checkpointStore.create({
      runId: legacyRunId,
      plugin: RESUMABLE_PLUGIN.name,
      pluginSemanticsHash: captureLoopPluginSemanticsHash(RESUMABLE_PLUGIN),
      phases: RESUMABLE_PLUGIN.phases,
      objective: "legacy objective",
      cwd: harness.operatorCwd,
      artifactHashes: { "diary/start.md": `sha256:${"a".repeat(64)}` },
      stateFingerprint: "sha256:stable-state",
    });
    legacy.status = "failed";
    legacy.attempts.push({
      attemptId: "legacy-diagnose",
      phase: "diagnose",
      agent: "scout",
      cognitiveTool: "first-principles",
      status: "done",
      effectDisposition: "settled",
      output: "legacy status-derived settlement",
      outputBytes: 32,
      outputSha256: "89d316d7063c3ba366054e72b2e8ba4ed6c8ed4b5b2acd08c4fdced57a94b043",
      outputTruncated: false,
      exitCode: 0,
      elapsed: 1,
      artifactPaths: [],
      timestamp: new Date().toISOString(),
    });
    delete legacy.effectReceiptContract;
    const legacyPath = path.join(harness.checkpointStore.rootDir, `${legacyRunId}.run.json`);
    fs.writeFileSync(legacyPath, `${JSON.stringify(legacy, null, 2)}\n`);
    await assert.rejects(
      harness.executor.execute("legacy objective", dispatch, undefined, {
        resumeRunId: legacyRunId,
        expectedFailedPhase: "dissolve",
        recoveryMode: "validate_then_retry",
      }),
      (error) =>
        error instanceof LoopResumeError &&
        error.failureKind === "loop_resume_receipt_contract_missing",
    );
    assert.equal(dispatchCalls, 0);
  } finally {
    harness.cleanup();
  }
});

test("resume validation rejects objective, phase, graph, repository, and state drift", () => {
  const harness = createHarness();
  const runId = "transcendent-1783708000000";
  try {
    const checkpoint = harness.checkpointStore.create({
      runId,
      plugin: RESUMABLE_PLUGIN.name,
      pluginSemanticsHash: captureLoopPluginSemanticsHash(RESUMABLE_PLUGIN),
      phases: RESUMABLE_PLUGIN.phases,
      objective: "stable objective",
      cwd: harness.operatorCwd,
      artifactHashes: { "diary/start.md": `sha256:${"a".repeat(64)}` },
      stateFingerprint: "sha256:stable-state",
    });
    checkpoint.status = "failed";
    checkpoint.attempts.push(
      {
        attemptId: "attempt-diagnose",
        phase: "diagnose",
        agent: "scout",
        cognitiveTool: "first-principles",
        status: "done",
        effectDisposition: "settled",
        ownerEffectReceipt: checkpointOwnerReceipt("asc-attempt-diagnosed", "attempt-diagnose"),
        output: "diagnosed",
        outputBytes: 9,
        outputSha256: "d22b75e3a33a790e74baaf8042f72a69bffaabe36780f9ee1ed549e165a38f5e",
        outputTruncated: false,
        exitCode: 0,
        elapsed: 1,
        artifactPaths: [],
        timestamp: new Date().toISOString(),
      },
      {
        attemptId: "attempt-dissolve",
        phase: "dissolve",
        agent: "researcher",
        cognitiveTool: "first-principles",
        status: "timed_out",
        effectDisposition: "confirmed_no_effects",
        output: "timed out",
        outputBytes: 9,
        outputSha256: "3dcd80f1b15f796ea71ac645184ae5302b91734495fc21892c694d46add5adc0",
        outputTruncated: false,
        exitCode: 124,
        failureKind: "timed_out",
        elapsed: 2,
        artifactPaths: [],
        timestamp: new Date().toISOString(),
      },
    );
    harness.checkpointStore.save(checkpoint);

    const base = {
      checkpoint,
      plugin: RESUMABLE_PLUGIN.name,
      pluginSemanticsHash: captureLoopPluginSemanticsHash(RESUMABLE_PLUGIN),
      phases: RESUMABLE_PLUGIN.phases,
      objective: "stable objective",
      cwd: harness.operatorCwd,
      expectedFailedPhase: "dissolve",
      currentStateFingerprint: "sha256:stable-state",
      artifactRoot: harness.packageRoot,
    };
    const diaryDir = path.join(harness.packageRoot, "diary");
    fs.mkdirSync(diaryDir, { recursive: true });
    const artifactPath = "diary/resume-evidence.md";
    fs.writeFileSync(path.join(harness.packageRoot, artifactPath), "original\n");
    checkpoint.artifactHashes = captureLoopArtifactHashes(harness.packageRoot, [artifactPath]);
    assert.equal(validateResumeCheckpoint(base), "dissolve");
    fs.writeFileSync(path.join(harness.packageRoot, artifactPath), "drifted\n");
    assert.throws(
      () => validateResumeCheckpoint(base),
      (error) =>
        error instanceof LoopResumeError && error.failureKind === "loop_resume_artifact_drift",
    );
    fs.writeFileSync(path.join(harness.packageRoot, artifactPath), "original\n");

    const cases = [
      [{ ...base, objective: "changed" }, "loop_resume_objective_mismatch"],
      [{ ...base, expectedFailedPhase: "rebuild" }, "loop_resume_phase_mismatch"],
      [{ ...base, phases: [...RESUMABLE_PLUGIN.phases, "extra"] }, "loop_resume_phase_graph_drift"],
      [{ ...base, cwd: harness.packageRoot }, "loop_resume_repository_mismatch"],
      [{ ...base, currentStateFingerprint: "sha256:drifted" }, "loop_resume_state_drift"],
      [
        {
          ...base,
          nowMs: Date.parse(checkpoint.updatedAt) + LOOP_CHECKPOINT_RETENTION_MS + 1,
        },
        "loop_resume_checkpoint_expired",
      ],
    ];

    for (const [input, expectedKind] of cases) {
      assert.throws(
        () => validateResumeCheckpoint(input),
        (error) => error instanceof LoopResumeError && error.failureKind === expectedKind,
      );
    }
  } finally {
    harness.cleanup();
  }
});

test("resume rejects drift in producer agent and cognitive-tool semantics", async () => {
  const harness = createHarness();
  try {
    const first = await harness.executor.execute(
      "Bind producer semantics",
      async ({ effectCorrelationId }) => ({
        ...settledResult("no effects", 1, effectCorrelationId),
        effectReceipt: {
          ...settledResult("unused", 1, effectCorrelationId).effectReceipt,
          disposition: "confirmed_no_effects",
        },
      }),
    );
    assert.equal(harness.checkpointStore.load(first.sessionId).status, "retryable");
    const driftedPlugin = {
      ...RESUMABLE_PLUGIN,
      agents: { ...RESUMABLE_PLUGIN.agents, diagnose: "reviewer" },
    };
    const drifted = createHarness({ plugin: driftedPlugin });
    try {
      drifted.checkpointStore = harness.checkpointStore;
      const executor = new LoopExecutor(driftedPlugin, harness.operatorCwd, "/tmp/unused-vault", {
        packageRoot: harness.packageRoot,
        allowUnverifiedKesRoot: true,
        checkpointStore: harness.checkpointStore,
        captureStateFingerprint: () => "sha256:stable-state",
      });
      await assert.rejects(
        executor.execute("Bind producer semantics", async () => settledResult("no", 1), undefined, {
          resumeRunId: first.sessionId,
          expectedFailedPhase: "diagnose",
          recoveryMode: "validate_then_retry",
        }),
        (error) =>
          error instanceof LoopResumeError &&
          error.failureKind === "loop_resume_plugin_semantic_drift",
      );
    } finally {
      drifted.cleanup();
    }
  } finally {
    harness.cleanup();
  }
});

test("loop state fingerprints detect tracked and untracked repository drift", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-resume-git-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd });
    execFileSync("git", ["config", "user.email", "resume-test@example.invalid"], { cwd });
    execFileSync("git", ["config", "user.name", "Resume Test"], { cwd });
    fs.writeFileSync(path.join(cwd, "tracked.txt"), "initial\n");
    execFileSync("git", ["add", "tracked.txt"], { cwd });
    execFileSync("git", ["commit", "-qm", "initial"], { cwd });

    const clean = captureLoopStateFingerprint(cwd);
    fs.writeFileSync(path.join(cwd, "tracked.txt"), "changed\n");
    const tracked = captureLoopStateFingerprint(cwd);
    assert.notEqual(tracked, clean);

    execFileSync("git", ["checkout", "--", "tracked.txt"], { cwd });
    fs.writeFileSync(path.join(cwd, "untracked.txt"), "first\n");
    const untrackedFirst = captureLoopStateFingerprint(cwd);
    fs.writeFileSync(path.join(cwd, "untracked.txt"), "second\n");
    const untrackedSecond = captureLoopStateFingerprint(cwd);
    assert.notEqual(untrackedFirst, clean);
    assert.notEqual(untrackedSecond, untrackedFirst);

    const excludedFingerprint = captureLoopStateFingerprint(cwd, [path.join(cwd, "untracked.txt")]);
    assert.equal(excludedFingerprint, clean);
    fs.writeFileSync(path.join(cwd, "unrelated.txt"), "must remain visible\n");
    assert.notEqual(captureLoopStateFingerprint(cwd, [path.join(cwd, "untracked.txt")]), clean);

    fs.unlinkSync(path.join(cwd, "untracked.txt"));
    fs.unlinkSync(path.join(cwd, "unrelated.txt"));
    const nestedCwd = path.join(cwd, "packages", "fixture");
    fs.mkdirSync(nestedCwd, { recursive: true });
    const nestedClean = captureLoopStateFingerprint(nestedCwd);
    fs.writeFileSync(path.join(cwd, "tracked.txt"), "sibling drift\n");
    const nestedWithSiblingDrift = captureLoopStateFingerprint(nestedCwd);
    assert.notEqual(nestedWithSiblingDrift, nestedClean);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("loop_execute exposes structured fail-closed resume errors before dispatch", async () => {
  const tools = new Map();
  registerLoopTools({
    registerTool(tool) {
      tools.set(tool.name, tool);
    },
  });
  const loopTool = tools.get("loop_execute");
  assert.ok(loopTool);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-resume-tool-"));

  try {
    const incomplete = await loopTool.execute(
      "resume-incomplete",
      {
        loop: "transcendent",
        objective: "objective",
        resume_run_id: "transcendent-1783707951538",
      },
      undefined,
      undefined,
      { cwd, model: undefined },
    );
    assert.equal(incomplete.details.ok, false);
    assert.equal(incomplete.details.error, "loop-resume-failed");
    assert.equal(incomplete.details.failureKind, "loop_resume_contract_incomplete");

    const invalid = await loopTool.execute(
      "resume-invalid",
      {
        loop: "transcendent",
        objective: "objective",
        resume_run_id: "../../escape",
        expected_failed_phase: "dissolve",
        recovery_mode: "validate_then_retry",
      },
      undefined,
      undefined,
      { cwd, model: undefined },
    );
    assert.equal(invalid.details.ok, false);
    assert.equal(invalid.details.error, "loop-resume-failed");
    assert.equal(invalid.details.failureKind, "loop_resume_invalid_run_id");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("checkpoint retention prunes expired terminal runs while protecting active and locked state", () => {
  const harness = createHarness();
  const nowMs = Date.parse("2026-07-11T12:00:00.000Z");
  const oldTimestamp = new Date(nowMs - LOOP_CHECKPOINT_RETENTION_MS - 1).toISOString();
  const freshTimestamp = new Date(nowMs - LOOP_CHECKPOINT_RETENTION_MS + 1).toISOString();
  const artifactPath = "diary/retention-start.md";
  fs.mkdirSync(path.join(harness.packageRoot, "diary"), { recursive: true });
  fs.writeFileSync(path.join(harness.packageRoot, artifactPath), "retention\n");
  const artifactHashes = captureLoopArtifactHashes(harness.packageRoot, [artifactPath]);

  const createCheckpoint = (runId, status, updatedAt) => {
    harness.checkpointStore.create({
      runId,
      plugin: RESUMABLE_PLUGIN.name,
      pluginSemanticsHash: captureLoopPluginSemanticsHash(RESUMABLE_PLUGIN),
      phases: RESUMABLE_PLUGIN.phases,
      objective: "retention fixture",
      cwd: harness.operatorCwd,
      artifactHashes,
      stateFingerprint: "sha256:stable-state",
    });
    const checkpointPath = path.join(harness.checkpointStore.rootDir, `${runId}.run.json`);
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    checkpoint.status = status;
    checkpoint.updatedAt = updatedAt;
    fs.writeFileSync(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    return checkpointPath;
  };

  const expiredDone = "transcendent-1783708000200";
  const expiredFailed = "transcendent-1783708000201";
  const expiredRunning = "transcendent-1783708000202";
  const freshDone = "transcendent-1783708000203";
  const expiredLocked = "transcendent-1783708000204";

  try {
    const expiredDonePath = createCheckpoint(expiredDone, "done", oldTimestamp);
    const expiredFailedPath = createCheckpoint(expiredFailed, "failed", oldTimestamp);
    const expiredRunningPath = createCheckpoint(expiredRunning, "running", oldTimestamp);
    const freshDonePath = createCheckpoint(freshDone, "done", freshTimestamp);
    const expiredLockedPath = createCheckpoint(expiredLocked, "failed", oldTimestamp);
    const lock = harness.checkpointStore.acquire(expiredLocked);
    try {
      const boundedPreview = harness.checkpointStore.pruneExpired({
        nowMs,
        dryRun: true,
        maxScans: 1,
      });
      assert.equal(boundedPreview.entriesExamined, 1);
      assert.ok(boundedPreview.scanned <= 1);
      assert.equal(boundedPreview.scanLimitReached, true);

      const preview = harness.checkpointStore.pruneExpired({ nowMs, dryRun: true });
      assert.deepEqual(preview.candidates, [expiredDone, expiredFailed]);
      assert.deepEqual(preview.deleted, []);
      assert.deepEqual(preview.skippedActive, [expiredRunning]);
      assert.deepEqual(preview.skippedLocked, [expiredLocked]);
      assert.equal(fs.existsSync(expiredDonePath), true);

      const firstApplied = harness.checkpointStore.pruneExpired({ nowMs, maxDeletes: 1 });
      assert.equal(firstApplied.deleted.length, 1);
      assert.equal(firstApplied.limitReached, true);
      const secondApplied = harness.checkpointStore.pruneExpired({ nowMs });
      assert.equal(secondApplied.deleted.length, 1);
      assert.deepEqual(secondApplied.skippedLocked, [expiredLocked]);
      assert.equal(fs.existsSync(expiredDonePath), false);
      assert.equal(fs.existsSync(expiredFailedPath), false);
      assert.equal(fs.existsSync(expiredRunningPath), true);
      assert.equal(fs.existsSync(freshDonePath), true);
      assert.equal(fs.existsSync(expiredLockedPath), true);
    } finally {
      lock.release();
    }
  } finally {
    harness.cleanup();
  }
});

test("checkpoint retention counts non-checkpoint directory entries against its scan budget", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-prune-budget-"));
  try {
    for (let index = 0; index < 20; index += 1) {
      fs.writeFileSync(path.join(root, `junk-${String(index).padStart(2, "0")}`), "junk\n");
    }
    const result = new LoopRunCheckpointStore(root).pruneExpired({ dryRun: true, maxScans: 5 });
    assert.equal(result.entriesExamined, 5);
    assert.equal(result.scanned, 0);
    assert.equal(result.scanLimitReached, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("checkpoint loading rejects symlinked, hard-linked, and stale-lock state", () => {
  const harness = createHarness();
  const runId = "transcendent-1783708000002";
  try {
    harness.checkpointStore.create({
      runId,
      plugin: RESUMABLE_PLUGIN.name,
      pluginSemanticsHash: captureLoopPluginSemanticsHash(RESUMABLE_PLUGIN),
      phases: RESUMABLE_PLUGIN.phases,
      objective: "secure checkpoint",
      cwd: harness.operatorCwd,
      artifactHashes: { "diary/start.md": `sha256:${"a".repeat(64)}` },
      stateFingerprint: "sha256:stable-state",
    });
    const checkpointPath = path.join(harness.checkpointStore.rootDir, `${runId}.run.json`);
    const extraLink = path.join(harness.checkpointStore.rootDir, "extra-link.json");
    fs.linkSync(checkpointPath, extraLink);
    assert.throws(
      () => harness.checkpointStore.load(runId),
      (error) =>
        error instanceof LoopResumeError && error.failureKind === "loop_resume_checkpoint_invalid",
    );
    fs.unlinkSync(extraLink);

    const realCheckpoint = `${checkpointPath}.real`;
    fs.renameSync(checkpointPath, realCheckpoint);
    fs.symlinkSync(realCheckpoint, checkpointPath);
    assert.throws(
      () => harness.checkpointStore.load(runId),
      (error) =>
        error instanceof LoopResumeError && error.failureKind === "loop_resume_checkpoint_invalid",
    );
    fs.unlinkSync(checkpointPath);
    fs.renameSync(realCheckpoint, checkpointPath);

    const staleRunId = "transcendent-1783708000003";
    const staleLockDir = path.join(harness.checkpointStore.rootDir, `${staleRunId}.run.json.lock`);
    fs.mkdirSync(staleLockDir, { mode: 0o700 });
    fs.writeFileSync(
      path.join(staleLockDir, "owner.json"),
      `${JSON.stringify({ pid: 2_147_483_647, token: "stale" })}\n`,
      { mode: 0o600 },
    );
    assert.throws(
      () => harness.checkpointStore.acquire(staleRunId),
      (error) => error instanceof LoopResumeError && error.failureKind === "loop_resume_stale_lock",
    );
    assert.equal(fs.existsSync(staleLockDir), true);
  } finally {
    harness.cleanup();
  }
});

test("resume validation rejects non-linear histories, completed runs, traversal ids, and live locks", () => {
  const harness = createHarness();
  try {
    assert.throws(
      () => harness.checkpointStore.load("../../escape"),
      (error) =>
        error instanceof LoopResumeError && error.failureKind === "loop_resume_invalid_run_id",
    );

    const runId = "transcendent-1783708000001";
    const checkpoint = harness.checkpointStore.create({
      runId,
      plugin: RESUMABLE_PLUGIN.name,
      pluginSemanticsHash: captureLoopPluginSemanticsHash(RESUMABLE_PLUGIN),
      phases: RESUMABLE_PLUGIN.phases,
      objective: "objective",
      cwd: harness.operatorCwd,
      artifactHashes: { "diary/start.md": `sha256:${"a".repeat(64)}` },
      stateFingerprint: "sha256:stable-state",
    });
    checkpoint.status = "failed";
    checkpoint.attempts.push({
      attemptId: "later-attempt",
      phase: "rebuild",
      agent: "builder",
      cognitiveTool: "first-principles",
      status: "done",
      effectDisposition: "settled",
      ownerEffectReceipt: checkpointOwnerReceipt("asc-attempt-later", "later-attempt"),
      output: "invalid later output",
      outputBytes: 20,
      outputSha256: "0".repeat(64),
      outputTruncated: false,
      exitCode: 0,
      elapsed: 1,
      artifactPaths: [],
      timestamp: new Date().toISOString(),
    });
    assert.throws(
      () => deriveResumePhase(checkpoint),
      (error) =>
        error instanceof LoopResumeError && error.failureKind === "loop_resume_non_linear_history",
    );

    checkpoint.attempts = RESUMABLE_PLUGIN.phases.map((phase) => ({
      attemptId: `attempt-${phase}`,
      phase,
      status: "done",
      effectDisposition: "settled",
      ownerEffectReceipt: checkpointOwnerReceipt(`asc-attempt-${phase}`, `attempt-${phase}`),
      output: "done",
      exitCode: 0,
      elapsed: 1,
      artifactPaths: [],
      timestamp: new Date().toISOString(),
    }));
    checkpoint.status = "done";
    const replayedReceiptCheckpoint = structuredClone(checkpoint);
    replayedReceiptCheckpoint.attempts[1].ownerEffectReceipt.dispatchId =
      replayedReceiptCheckpoint.attempts[0].ownerEffectReceipt.dispatchId;
    replayedReceiptCheckpoint.attempts[1].ownerEffectReceipt.attemptId =
      replayedReceiptCheckpoint.attempts[0].ownerEffectReceipt.attemptId;
    assert.throws(
      () => harness.checkpointStore.save(replayedReceiptCheckpoint),
      (error) =>
        error instanceof LoopResumeError && error.failureKind === "loop_resume_checkpoint_invalid",
    );
    assert.throws(
      () => deriveResumePhase(checkpoint),
      (error) =>
        error instanceof LoopResumeError && error.failureKind === "loop_resume_already_complete",
    );

    const lock = harness.checkpointStore.acquire(runId);
    try {
      assert.throws(
        () => harness.checkpointStore.acquire(runId),
        (error) =>
          error instanceof LoopResumeError && error.failureKind === "loop_resume_already_running",
      );
    } finally {
      lock.release();
    }
  } finally {
    harness.cleanup();
  }
});

test("terminal KES publication resumes idempotently after a crash before checkpoint finalization", async () => {
  const crashPlugin = {
    name: "kaizen",
    phases: ["plan", "do"],
    description: "Terminal publication crash fixture",
    continueOnFailure: false,
    cognitiveTools: { plan: ["first-principles"], do: ["first-principles"] },
    agents: { plan: "scout", do: "builder" },
  };
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-terminal-crash-cwd-"));
  const packageRoot = path.join(operatorCwd, "packages", "pi-society-orchestrator");
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-terminal-crash-state-"));
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    `${JSON.stringify({ name: "@tryinget/pi-society-orchestrator" })}\n`,
  );
  execFileSync("git", ["init", "-q"], { cwd: operatorCwd });
  execFileSync("git", ["config", "user.email", "resume-test@example.invalid"], {
    cwd: operatorCwd,
  });
  execFileSync("git", ["config", "user.name", "Resume Test"], { cwd: operatorCwd });
  execFileSync("git", ["add", "."], { cwd: operatorCwd });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: operatorCwd });
  class CrashAfterPublicationStore extends LoopRunCheckpointStore {
    save(checkpoint) {
      if (checkpoint.terminalPublication?.state === "published") {
        throw new Error("injected crash after terminal publication");
      }
      super.save(checkpoint);
    }
  }
  const commonOptions = {
    packageRoot,
    allowUnverifiedKesRoot: true,
    verifyEffectReceipt: (receipt) => receipt?.schema === "asc.dispatch_effect_receipt.v1",
    ak: {
      async evidenceRecord() {
        return { ok: true, via: "ak" };
      },
    },
  };
  let attempts = 0;
  const dispatch = async ({ effectCorrelationId }) => {
    attempts += 1;
    return settledResult(
      attempts === crashPlugin.phases.length
        ? `phase output ${attempts}\nKES_CLAIM: Prepared terminal artifacts replay identically after publication interruption.`
        : `phase output ${attempts}`,
      1,
      effectCorrelationId,
    );
  };

  try {
    const crashing = new LoopExecutor(crashPlugin, operatorCwd, "/tmp/unused-vault", {
      ...commonOptions,
      checkpointStore: new CrashAfterPublicationStore(stateRoot),
    });
    await assert.rejects(
      crashing.execute("Publish exactly once", dispatch),
      /injected crash after terminal publication/,
    );
    assert.equal(attempts, crashPlugin.phases.length);
    assert.equal(fs.readdirSync(path.join(packageRoot, "diary")).length, 1);
    assert.equal(fs.readdirSync(path.join(packageRoot, "docs", "learnings")).length, 1);

    const store = new LoopRunCheckpointStore(stateRoot);
    const [runFile] = fs.readdirSync(stateRoot).filter((name) => name.endsWith(".run.json"));
    const runId = runFile.replace(/\.run\.json$/, "");
    assert.equal(store.load(runId).terminalPublication?.state, "prepared");
    const resumedExecutor = new LoopExecutor(crashPlugin, operatorCwd, "/tmp/unused-vault", {
      ...commonOptions,
      checkpointStore: store,
    });
    const resumed = await resumedExecutor.execute("Publish exactly once", dispatch, undefined, {
      resumeRunId: runId,
      expectedFailedPhase: "do",
      recoveryMode: "validate_then_retry",
    });

    assert.equal(resumed.success, true);
    assert.equal(resumed.resumed, true);
    assert.equal(attempts, crashPlugin.phases.length, "resume must not redispatch phases");
    assert.equal(fs.readdirSync(path.join(packageRoot, "diary")).length, 1);
    assert.equal(fs.readdirSync(path.join(packageRoot, "docs", "learnings")).length, 1);
    assert.equal(resumed.artifacts.length, 2);
    assert.equal(store.load(runId).terminalPublication?.state, "published");
    assert.equal(store.load(runId).status, "done");

    const candidatePath = resumed.artifacts.find(
      (artifact) => artifact.type === "kes_learning_candidate",
    ).content;
    fs.unlinkSync(path.join(packageRoot, candidatePath));
    const repaired = await resumedExecutor.execute("Publish exactly once", dispatch, undefined, {
      resumeRunId: runId,
      expectedFailedPhase: "do",
      recoveryMode: "validate_then_retry",
    });
    assert.equal(attempts, crashPlugin.phases.length, "published repair must not redispatch");
    assert.equal(repaired.artifacts.length, 2);
    assert.equal(fs.existsSync(path.join(packageRoot, candidatePath)), true);

    const diaryPath = repaired.artifacts.find((artifact) => artifact.type === "kes_diary").content;
    const diaryAbsolutePath = path.join(packageRoot, diaryPath);
    const diaryContent = fs.readFileSync(diaryAbsolutePath, "utf8");
    const linkedStagePath = path.join(
      path.dirname(diaryAbsolutePath),
      `.${path.basename(diaryAbsolutePath)}.killed.tmp`,
    );
    fs.linkSync(diaryAbsolutePath, linkedStagePath);
    assert.equal(fs.lstatSync(diaryAbsolutePath).nlink, 2);
    await resumedExecutor.execute("Publish exactly once", dispatch, undefined, {
      resumeRunId: runId,
      expectedFailedPhase: "do",
      recoveryMode: "validate_then_retry",
    });
    assert.equal(fs.existsSync(linkedStagePath), false, "linked staging inode must be reconciled");
    assert.equal(fs.lstatSync(diaryAbsolutePath).nlink, 1);

    fs.appendFileSync(diaryAbsolutePath, "tampered\n");
    const resumePublished = () =>
      resumedExecutor.execute("Publish exactly once", dispatch, undefined, {
        resumeRunId: runId,
        expectedFailedPhase: "do",
        recoveryMode: "validate_then_retry",
      });
    await assert.rejects(resumePublished(), (error) =>
      /Existing KES artifact does not match prepared content/.test(error.causeMessage),
    );
    fs.writeFileSync(diaryAbsolutePath, diaryContent);
    const symlinkTarget = path.join(operatorCwd, "external-kes-target.md");
    fs.writeFileSync(symlinkTarget, diaryContent);
    fs.unlinkSync(diaryAbsolutePath);
    fs.symlinkSync(symlinkTarget, diaryAbsolutePath);
    await assert.rejects(resumePublished(), /symbolic link|symlink|state changed/i);
    fs.unlinkSync(diaryAbsolutePath);
    fs.writeFileSync(diaryAbsolutePath, diaryContent);
    const externalHardLink = path.join(operatorCwd, "external-kes-hard-link.md");
    fs.linkSync(diaryAbsolutePath, externalHardLink);
    await assert.rejects(resumePublished(), /does not match prepared content|state changed/i);
    fs.unlinkSync(externalHardLink);
    assert.equal(attempts, crashPlugin.phases.length, "drift must fail before dispatch");

    const synthesisPackageRoot = path.join(operatorCwd, "packages", "synthesis-orchestrator");
    const synthesisStateRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "pi-orch-terminal-synthesis-state-"),
    );
    fs.mkdirSync(synthesisPackageRoot, { recursive: true });
    fs.writeFileSync(
      path.join(synthesisPackageRoot, "package.json"),
      `${JSON.stringify({ name: "@tryinget/pi-society-orchestrator" })}\n`,
    );
    execFileSync("git", ["add", "."], { cwd: operatorCwd });
    execFileSync("git", ["commit", "-qm", "synthesis package"], { cwd: operatorCwd });
    class CrashBeforePreparedIntentStore extends LoopRunCheckpointStore {
      save(checkpoint) {
        const finalAttempt = checkpoint.attempts.at(-1);
        if (
          !checkpoint.terminalPublication &&
          finalAttempt?.phase === crashPlugin.phases.at(-1) &&
          finalAttempt.status === "done"
        ) {
          super.save(checkpoint);
          throw new Error("injected process death before prepared intent");
        }
        super.save(checkpoint);
      }
    }
    let synthesisDispatches = 0;
    const synthesisDispatch = async ({ effectCorrelationId }) => {
      synthesisDispatches += 1;
      return settledResult(`synthesis output ${synthesisDispatches}`, 1, effectCorrelationId);
    };
    const synthesisOptions = {
      ...commonOptions,
      packageRoot: synthesisPackageRoot,
      checkpointStore: new CrashBeforePreparedIntentStore(synthesisStateRoot),
    };
    const synthesisCrashing = new LoopExecutor(
      crashPlugin,
      operatorCwd,
      "/tmp/unused-vault",
      synthesisOptions,
    );
    await assert.rejects(
      synthesisCrashing.execute("Synthesize durable intent", synthesisDispatch),
      /injected process death before prepared intent/,
    );
    assert.equal(fs.existsSync(path.join(synthesisPackageRoot, "diary")), false);
    const [synthesisRunFile] = fs
      .readdirSync(synthesisStateRoot)
      .filter((name) => name.endsWith(".run.json"));
    const synthesisRunId = synthesisRunFile.replace(/\.run\.json$/, "");
    const synthesisStore = new LoopRunCheckpointStore(synthesisStateRoot);
    assert.equal(synthesisStore.load(synthesisRunId).terminalPublication, undefined);
    const synthesized = await new LoopExecutor(crashPlugin, operatorCwd, "/tmp/unused-vault", {
      ...commonOptions,
      packageRoot: synthesisPackageRoot,
      checkpointStore: synthesisStore,
    }).execute("Synthesize durable intent", synthesisDispatch, undefined, {
      resumeRunId: synthesisRunId,
      expectedFailedPhase: "do",
      recoveryMode: "validate_then_retry",
    });
    assert.equal(synthesized.success, true);
    assert.equal(synthesisDispatches, crashPlugin.phases.length, "synthesis must not redispatch");
    assert.equal(fs.readdirSync(path.join(synthesisPackageRoot, "diary")).length, 1);
    assert.equal(synthesisStore.load(synthesisRunId).terminalPublication?.state, "published");
    fs.rmSync(synthesisStateRoot, { recursive: true, force: true });
  } finally {
    fs.rmSync(operatorCwd, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
