import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LoopExecutor, registerLoopTools } from "../src/loops/engine.ts";
import {
  captureLoopArtifactHashes,
  deriveResumePhase,
  LoopResumeError,
  LoopRunCheckpointStore,
  validateResumeCheckpoint,
} from "../src/loops/run-checkpoint.ts";
import { captureLoopStateFingerprint } from "../src/loops/run-state-fingerprint.ts";

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

function createHarness() {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-resume-cwd-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-resume-package-"));
  const checkpointStore = new LoopRunCheckpointStore(path.join(packageRoot, ".loop-runs"));
  let fingerprint = "sha256:stable-state";
  const executor = new LoopExecutor(RESUMABLE_PLUGIN, operatorCwd, "/tmp/unused-vault", {
    packageRoot,
    allowUnverifiedKesRoot: true,
    checkpointStore,
    captureStateFingerprint: () => fingerprint,
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

test("LoopExecutor continues from the next undispatched phase under the same durable lineage", async () => {
  const harness = createHarness();
  const objective = "Remove the blocking workflow debt";
  const runId = "transcendent-1783708000100";

  try {
    const startArtifact = "diary/checkpointed-start.md";
    fs.mkdirSync(path.join(harness.packageRoot, "diary"), { recursive: true });
    fs.writeFileSync(path.join(harness.packageRoot, startArtifact), "durable start\n");
    const checkpoint = harness.checkpointStore.create({
      runId,
      plugin: RESUMABLE_PLUGIN.name,
      phases: RESUMABLE_PLUGIN.phases,
      objective,
      cwd: harness.operatorCwd,
      artifactHashes: captureLoopArtifactHashes(harness.packageRoot, [startArtifact]),
      stateFingerprint: "sha256:stable-state",
    });
    checkpoint.status = "aborted";
    checkpoint.attempts.push({
      attemptId: "attempt-diagnose",
      phase: "diagnose",
      status: "done",
      effectDisposition: "settled",
      output: "diagnose complete",
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
      async ({ context }) => {
        const phase = phaseFromContext(context);
        resumedCalls.push(phase);
        if (phase === "dissolve") dissolveContext = context;
        return { output: `${phase} recovered`, exitCode: 0, elapsed: 12 };
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
    await assert.rejects(
      harness.executor.execute(
        objective,
        async () => ({ output: "must not dispatch", exitCode: 0, elapsed: 1 }),
        undefined,
        {
          resumeRunId: first.sessionId,
          expectedFailedPhase: "diagnose",
          recoveryMode: "validate_then_retry",
        },
      ),
      (error) =>
        error instanceof LoopResumeError &&
        error.failureKind === "loop_resume_effect_indeterminate",
    );
  } finally {
    harness.cleanup();
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
        status: "done",
        effectDisposition: "settled",
        output: "diagnosed",
        exitCode: 0,
        elapsed: 1,
        artifactPaths: [],
        timestamp: new Date().toISOString(),
      },
      {
        attemptId: "attempt-dissolve",
        phase: "dissolve",
        status: "timed_out",
        effectDisposition: "confirmed_no_effects",
        output: "timed out",
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

    fs.unlinkSync(path.join(cwd, "untracked.txt"));
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

test("checkpoint loading rejects symlinked, hard-linked, and stale-lock state", () => {
  const harness = createHarness();
  const runId = "transcendent-1783708000002";
  try {
    harness.checkpointStore.create({
      runId,
      plugin: RESUMABLE_PLUGIN.name,
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
      status: "done",
      effectDisposition: "settled",
      output: "invalid later output",
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
      output: "done",
      exitCode: 0,
      elapsed: 1,
      artifactPaths: [],
      timestamp: new Date().toISOString(),
    }));
    checkpoint.status = "done";
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
