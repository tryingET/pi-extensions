/**
 * summary: "Loop resume coverage (shared fixtures); split from loop-resume.test.mjs."
 * read_when:
 *   - "changing shared fixtures loop resume behavior."
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LoopExecutor } from "../../src/loops/engine.ts";
import { LoopRunCheckpointStore } from "../../src/loops/run-checkpoint.ts";

export const RESUMABLE_PLUGIN = {
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

export function createHarness({ trustSyntheticReceipts = true, plugin = RESUMABLE_PLUGIN } = {}) {
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

export function phaseFromContext(context) {
  return /^## Phase: (.+)$/m.exec(context)?.[1];
}

export function checkpointOwnerReceipt(
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

export function settledResult(output, elapsed, consumerCorrelationId = "attempt-test") {
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
