import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getExecutionStatus } from "../src/runtime/execution-status.ts";
import { toExecutionLike, verifyDispatchEffectReceipt } from "../src/runtime/subagent.ts";

function createFixture() {
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-effect-receipt-"));
  const sessionName = "effect-test";
  const receiptPath = path.join(sessionsDir, `${sessionName}.attempt-expected.effect-receipt.json`);
  const receipt = {
    schema: "asc.dispatch_effect_receipt.v1",
    dispatchId: "dispatch-expected",
    attemptId: "attempt-expected",
    sessionName,
    disposition: "settled",
    recordedAt: "2026-07-11T00:00:00.000Z",
    receiptPath,
  };
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  const result = {
    ok: true,
    text: "done",
    details: {
      dispatchId: receipt.dispatchId,
      attemptId: receipt.attemptId,
      sessionName,
      status: "done",
      exitCode: 0,
      elapsed: 1,
      fullOutput: "done",
      effectReceipt: receipt,
    },
  };
  return { sessionsDir, receiptPath, receipt, result };
}

test("Orchestrator accepts only a persisted ASC receipt bound to the returned dispatch attempt", () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(
      verifyDispatchEffectReceipt(fixture.result, fixture.sessionsDir),
      fixture.receipt,
    );
    assert.deepEqual(
      toExecutionLike(fixture.result, fixture.sessionsDir).effectReceipt,
      fixture.receipt,
    );
    assert.equal(toExecutionLike(fixture.result).effectReceipt, undefined);
  } finally {
    fs.rmSync(fixture.sessionsDir, { recursive: true, force: true });
  }
});

test("Orchestrator consumes ASC receipt persistence failure as execution failure", () => {
  const fixture = createFixture();
  try {
    fs.unlinkSync(fixture.receiptPath);
    fixture.result.ok = false;
    fixture.result.details.status = "error";
    fixture.result.details.failureKind = "effect_receipt_write_failed";
    fixture.result.details.effectReceipt = undefined;
    fixture.result.details.executionState = {
      transport: { kind: "transport", exitCode: 0, aborted: false, timedOut: false },
      protocol: { kind: "assistant_protocol", stopReason: "stop" },
    };
    const execution = toExecutionLike(fixture.result, fixture.sessionsDir);
    assert.equal(execution.exitCode, 1);
    assert.equal(execution.assistantStopReason, "error");
    assert.equal(getExecutionStatus(execution), "error");
    assert.equal(execution.effectReceipt, undefined);
  } finally {
    fs.rmSync(fixture.sessionsDir, { recursive: true, force: true });
  }
});

test("Orchestrator rejects missing, altered, mismatched, escaped, symlinked, and hard-linked receipts", () => {
  const cases = [
    "missing",
    "altered",
    "dispatch-mismatch",
    "attempt-mismatch",
    "escaped",
    "symlinked",
    "hard-linked",
    "permissive-mode",
    "session-mismatch",
  ];

  for (const scenario of cases) {
    const fixture = createFixture();
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-orch-effect-outside-"));
    try {
      if (scenario === "missing") fs.unlinkSync(fixture.receiptPath);
      if (scenario === "altered") {
        fs.writeFileSync(
          fixture.receiptPath,
          `${JSON.stringify({ ...fixture.receipt, disposition: "confirmed_no_effects" })}\n`,
        );
      }
      if (scenario === "dispatch-mismatch") fixture.result.details.dispatchId = "dispatch-other";
      if (scenario === "attempt-mismatch") fixture.result.details.attemptId = "attempt-other";
      if (scenario === "escaped") {
        const escaped = path.join(outsideDir, "escaped.json");
        const escapedReceipt = { ...fixture.receipt, receiptPath: escaped };
        fs.writeFileSync(escaped, `${JSON.stringify(escapedReceipt)}\n`, { mode: 0o600 });
        fixture.result.details.effectReceipt = escapedReceipt;
      }
      if (scenario === "symlinked") {
        const real = `${fixture.receiptPath}.real`;
        fs.renameSync(fixture.receiptPath, real);
        fs.symlinkSync(real, fixture.receiptPath);
      }
      if (scenario === "hard-linked") {
        fs.linkSync(fixture.receiptPath, `${fixture.receiptPath}.link`);
      }
      if (scenario === "permissive-mode") fs.chmodSync(fixture.receiptPath, 0o644);
      if (scenario === "session-mismatch") fixture.result.details.sessionName = "other-session";

      assert.equal(
        verifyDispatchEffectReceipt(fixture.result, fixture.sessionsDir),
        undefined,
        scenario,
      );
    } finally {
      fs.rmSync(fixture.sessionsDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  }
});
