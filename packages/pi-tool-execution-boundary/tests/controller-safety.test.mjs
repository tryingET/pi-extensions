import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizePolicy, policyDigest } from "../src/policy.js";
import { compileSemanticPlan } from "../src/plan.js";
import { normalizeAttestation } from "../src/attestation.js";
import { admitOperation } from "../src/operations.js";
import { BoundaryController } from "../src/controller.js";
import { SqliteD1Authority } from "../src/sqlite-d1-authority.js";

const digest = (char) => char.repeat(64);
const policy = normalizePolicy();
const plan = compileSemanticPlan(policy);
const attestation = normalizeAttestation({
  status: "verified",
  productionProfile: true,
  leaseId: "lease-1",
  backendId: "direct-qemu-test-attested",
  backendVersion: "1",
  effectivePolicyDigest: policyDigest(policy),
  semanticPlanDigest: plan.semanticPlanDigest,
  renderedPlanDigest: digest("a"),
  tcbGenerationDigest: digest("b"),
  bootTranscriptDigest: digest("c"),
  canaryEvidenceDigest: digest("d"),
  hostConfinementDigest: digest("e"),
  verifiedAtUnixMs: 1_800_000_000_000,
});

function makeHarness({ leaseId = "lease-1", generation = 1 } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ptb-safety-"));
  const databasePath = path.join(dir, "state.sqlite");
  const store = new SqliteD1Authority(databasePath);
  const expectedLeaseBinding = {
    leaseId,
    effectivePolicyDigest: policyDigest(policy),
    semanticPlanDigest: plan.semanticPlanDigest,
    tcbGenerationDigest: digest("b"),
    workspaceGeneration: generation,
    outputBytes: 64,
  };
  const controller = new BoundaryController({
    attestedLease: { ...attestation, leaseId },
    expectedLeaseBinding,
    d1Authority: store,
    initialOutputCredits: 8,
    maxChunkBytes: 8,
  });
  return {
    dir,
    databasePath,
    store,
    controller,
    expectedLeaseBinding,
    close() {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function call(callId, operation, workspaceGeneration = 1, leaseId = "lease-1") {
  return admitOperation({
    callId,
    leaseId,
    clientSessionId: "session-1",
    clientEpoch: "epoch-1",
    operation,
    effectivePolicy: policy,
    workspaceGeneration,
  });
}

test("workspace reads and mutations cannot overlap", () => {
  const harness = makeHarness();
  try {
    const read = call("read-1", { kind: "read", path: "a" });
    const write = call("write-1", { kind: "write", path: "b", content: "x" });
    harness.controller.admit(read);
    harness.controller.admit(write);
    harness.controller.start(read.callId);
    assert.throws(
      () => harness.controller.start(write.callId),
      /reads are active/,
    );
    harness.controller.finishKnown(read.callId);
    harness.controller.start(write.callId);
    const secondRead = call("read-2", { kind: "read", path: "c" });
    harness.controller.admit(secondRead);
    assert.throws(
      () => harness.controller.start(secondRead.callId),
      /mutation token|mutation is active/i,
    );
    harness.controller.finishKnown(write.callId);
    assert.throws(
      () => harness.controller.start(secondRead.callId),
      /changed while the call was queued|generation/i,
    );
  } finally {
    harness.close();
  }
});

test("grep and find require the same descendant-empty proof as exec", () => {
  const harness = makeHarness();
  try {
    for (const [callId, operation] of [
      ["grep-1", { kind: "grep", path: ".", pattern: "x" }],
      ["find-1", { kind: "find", path: ".", pattern: "*.ts" }],
    ]) {
      const admitted = call(callId, operation);
      harness.controller.admit(admitted);
      harness.controller.start(callId);
      assert.throws(
        () => harness.controller.finishKnown(callId),
        /descendant emptiness/,
      );
      harness.controller.noteDescendantsEmpty(callId);
      harness.controller.finishKnown(callId);
    }
  } finally {
    harness.close();
  }
});

test("output acknowledgement replay is idempotent and cannot inflate credits", () => {
  const harness = makeHarness();
  try {
    const admitted = call("read-1", { kind: "read", path: "a" });
    harness.controller.admit(admitted);
    harness.controller.start(admitted.callId);
    harness.controller.emitOutput(admitted.callId, "stdout", Buffer.from("1234"));
    harness.controller.emitOutput(admitted.callId, "stdout", Buffer.from("5678"));
    const credited = harness.controller.grantOutputCredit(
      admitted.callId,
      "stdout",
      4,
      2,
    );
    assert.equal(credited.outputCredits.stdout, 4);
    const replay = harness.controller.grantOutputCredit(
      admitted.callId,
      "stdout",
      4,
      2,
    );
    assert.equal(replay.outputCredits.stdout, 4);
    assert.throws(
      () => harness.controller.grantOutputCredit(admitted.callId, "stdout", 5, 2),
      /changed its credit amount/,
    );
    assert.throws(
      () => harness.controller.grantOutputCredit(admitted.callId, "stdout", 1, 1),
      /monotonic/,
    );
  } finally {
    harness.close();
  }
});

test("started cancellation remains nonterminal until cleanup and disposition are known", () => {
  const harness = makeHarness();
  try {
    const admitted = call("exec-1", { kind: "exec", argv: ["true"] });
    harness.controller.admit(admitted);
    harness.controller.start(admitted.callId);
    const cancelling = harness.controller.cancel(admitted.callId);
    assert.equal(cancelling.state, "CANCEL_REQUESTED");
    assert.equal(cancelling.disposition, undefined);
    harness.controller.noteDescendantsEmpty(admitted.callId);
    const terminal = harness.controller.finishCancelledKnown(admitted.callId, {
      workspaceMutation: "none",
    });
    assert.equal(terminal.state, "TERMINAL_CANCELLED_KNOWN");
    assert.equal(terminal.disposition.retrySafety, "safe");
    assert.equal(harness.store.getLease("lease-1").state, "READY");
  } finally {
    harness.close();
  }
});

test("unknown cleanup for a read-only process cell quarantines the lease", () => {
  const harness = makeHarness();
  try {
    const admitted = call("grep-1", {
      kind: "grep",
      path: ".",
      pattern: "x",
    });
    harness.controller.admit(admitted);
    harness.controller.start(admitted.callId);
    harness.controller.finishUnknown(admitted.callId, "cell-control-lost");
    assert.equal(harness.controller.status.leaseState, "QUARANTINED");
  } finally {
    harness.close();
  }
});

test("terminal D1 duplicate after controller reconstruction returns the durable result", () => {
  const harness = makeHarness();
  try {
    const admitted = call("write-1", {
      kind: "write",
      path: "a",
      content: "x",
    });
    harness.controller.admit(admitted);
    harness.controller.start(admitted.callId);
    harness.controller.finishKnown(admitted.callId);
    harness.store.close();

    const reopened = new SqliteD1Authority(harness.databasePath);
    const reconstructed = new BoundaryController({
      attestedLease: attestation,
      expectedLeaseBinding: {
        ...harness.expectedLeaseBinding,
        workspaceGeneration: 2,
      },
      d1Authority: reopened,
      initialOutputCredits: 8,
      maxChunkBytes: 8,
    });
    const duplicate = reconstructed.admit(admitted);
    assert.equal(duplicate.state, "TERMINAL_KNOWN");
    assert.equal(reopened.getLease("lease-1").workspaceGeneration, 2);
    reopened.close();
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});

test("nonterminal durable D1 calls require recovery and are never replayed", () => {
  const harness = makeHarness();
  try {
    const admitted = call("write-1", {
      kind: "write",
      path: "a",
      content: "x",
    });
    harness.controller.admit(admitted);
    harness.controller.start(admitted.callId);
    harness.store.close();

    const reopened = new SqliteD1Authority(harness.databasePath);
    assert.throws(
      () => new BoundaryController({
        attestedLease: attestation,
        expectedLeaseBinding: harness.expectedLeaseBinding,
        d1Authority: reopened,
        initialOutputCredits: 8,
        maxChunkBytes: 8,
      }).admit(admitted),
      /recovery must run/,
    );
    const recovered = reopened.recoverNonTerminal({ leaseId: "lease-1" });
    assert.equal(recovered[0].terminalState, "TERMINAL_UNKNOWN");
    assert.equal(reopened.getLease("lease-1").state, "QUARANTINED");
    reopened.close();
  } finally {
    rmSync(harness.dir, { recursive: true, force: true });
  }
});
