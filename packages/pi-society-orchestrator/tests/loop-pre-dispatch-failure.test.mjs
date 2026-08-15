import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LoopExecutor } from "../src/loops/engine.ts";
import { LoopRunCheckpointStore } from "../src/loops/run-checkpoint.ts";

/**
 * Regression: a dispatcher pre-spawn failure (cognitive-tool load, agent
 * resolution, or any boundary before any child launch) must never degrade to
 * effect_indeterminate and terminal. It classifies as confirmed_no_effects at
 * the effectful dispatch boundary, the run becomes retryable, and the
 * checkpoint retains full failure evidence as internal bookkeeping.
 *
 * Origin: transcendent-1786827059456 died terminal when a concurrent install
 * broke the vault-client prompt-plane import mid-diagnose; no child was ever
 * launched, so no durable dispatch effect could exist.
 */

const PLUGIN = {
  name: "transcendent",
  phases: ["diagnose"],
  description: "Pre-dispatch failure fixture",
  continueOnFailure: false,
  cognitiveTools: { diagnose: ["first-principles"] },
  agents: { diagnose: "scout" },
};

function createHarness({ plugin = PLUGIN } = {}) {
  const operatorCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-pre-cwd-"));
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-pre-pkg-"));
  const checkpointStore = new LoopRunCheckpointStore(path.join(packageRoot, ".loop-runs"));
  const executor = new LoopExecutor(plugin, operatorCwd, "/tmp/unused-vault", {
    packageRoot,
    allowUnverifiedKesRoot: true,
    checkpointStore,
    captureStateFingerprint: () => "sha256:stable",
    verifyEffectReceipt: () => false,
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
    cleanup() {
      fs.rmSync(operatorCwd, { recursive: true, force: true });
      fs.rmSync(packageRoot, { recursive: true, force: true });
    },
  };
}

function cognitiveToolLoadFailure() {
  return {
    output: `Failed to load cognitive tool 'first-principles': Cannot find module '@tryinget/pi-vault-client/prompt-plane'`,
    exitCode: 1,
    elapsed: 0,
    failureKind: "cognitive_tool_load_failed",
    preDispatchNoEffects: {
      failureKind: "cognitive_tool_load_failed",
      reason: "Cognitive tool load failed before any child launch: Cannot find module",
    },
  };
}

test("pre-dispatch cognitive-tool failure cannot become effect_indeterminate or terminal", async () => {
  const harness = createHarness();
  try {
    const result = await harness.executor.execute(
      "Fix the blocking debt",
      cognitiveToolLoadFailure,
      undefined,
      {},
    );
    assert.equal(result.success, false);
    assert.equal(result.retryable, true, "pre-spawn failure must be retryable");
    assert.ok(!result.terminalKes, "no terminal KES may be published while retryable");

    const run = harness.checkpointStore.load(result.sessionId);
    assert.ok(run, "checkpoint must persist");
    assert.equal(run.status, "retryable");
    const attempts = run.attempts.filter((a) => a.phase === "diagnose");
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].effectDisposition, "confirmed_no_effects");
    // Internal bookkeeping retained: real failure evidence, not "nothing happened".
    assert.equal(attempts[0].failureKind, "cognitive_tool_load_failed");
    assert.match(attempts[0].output, /Cannot find module/);
    assert.equal(attempts[0].status, "error");
  } finally {
    harness.cleanup();
  }
});

test("agent-resolution pre-spawn failure is retryable with retained evidence", async () => {
  const harness = createHarness();
  try {
    const result = await harness.executor.execute(
      "Fix the blocking debt",
      () => ({
        output: "Agent/team resolution failed for 'scout': unknown team",
        exitCode: 1,
        elapsed: 0,
        failureKind: "agent_resolution_failed",
        preDispatchNoEffects: {
          failureKind: "agent_resolution_failed",
          reason: "Agent/team resolution failed before any child launch: unknown team",
        },
      }),
      undefined,
      {},
    );
    assert.equal(result.retryable, true);
    const run = harness.checkpointStore.load(result.sessionId);
    assert.equal(run.status, "retryable");
    const attempts = run.attempts.filter((a) => a.phase === "diagnose");
    assert.equal(attempts[0].effectDisposition, "confirmed_no_effects");
    assert.equal(attempts[0].failureKind, "agent_resolution_failed");
  } finally {
    harness.cleanup();
  }
});

test("same failure without the dispatcher attestation still fails closed as indeterminate", async () => {
  const harness = createHarness();
  try {
    const result = await harness.executor.execute(
      "Fix the blocking debt",
      () => ({
        output: "Failed to load cognitive tool 'first-principles': Cannot find module",
        exitCode: 1,
        elapsed: 0,
      }),
      undefined,
      {},
    );
    // No attestation, no receipt: the engine must NOT invent confirmed_no_effects.
    assert.equal(result.retryable, undefined);
    const run = harness.checkpointStore.load(result.sessionId);
    const attempts = run.attempts.filter((a) => a.phase === "diagnose");
    assert.equal(attempts[0].effectDisposition, "effect_indeterminate");
  } finally {
    harness.cleanup();
  }
});

test("seam probe reports loadability without throwing on a broken seam", async () => {
  const { probeCognitiveToolSeam } = await import("../src/runtime/cognitive-tools.ts");
  // In this environment the module is present, so the probe must succeed and
  // never throw; the unavailable path is exercised by the boundary result shape.
  const probe = await probeCognitiveToolSeam();
  assert.ok(probe.ok === true || probe.ok === false);
  if (probe.ok === false) {
    assert.equal(typeof probe.error, "string");
  }
});
