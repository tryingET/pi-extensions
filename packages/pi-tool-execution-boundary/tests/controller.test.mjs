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

function withController(fn, { durable = true } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ptb-controller-"));
  const store = durable ? new SqliteD1Authority(path.join(dir, "state.sqlite")) : undefined;
  const controller = new BoundaryController({
    attestedLease: attestation,
    expectedLeaseBinding: {
      leaseId: "lease-1",
      effectivePolicyDigest: policyDigest(policy),
      semanticPlanDigest: plan.semanticPlanDigest,
      tcbGenerationDigest: digest("b"),
      workspaceGeneration: 1,
    },
    d1Authority: store,
    initialOutputCredits: 8,
    maxChunkBytes: 8,
  });
  try { return fn(controller, store); }
  finally { store?.close(); rmSync(dir, { recursive: true, force: true }); }
}

function call(callId, operation, workspaceGeneration = 1) {
  return admitOperation({
    callId,
    leaseId: "lease-1",
    clientSessionId: "session-1",
    clientEpoch: "epoch-1",
    operation,
    effectivePolicy: policy,
    workspaceGeneration,
  });
}

test("D0 calls never require the durable authority or advance generation", () => withController((controller) => {
  const admitted = call("read-1", { kind: "read", path: "a.txt" });
  controller.admit(admitted);
  controller.start(admitted.callId);
  controller.finishKnown(admitted.callId);
  assert.equal(controller.status.workspaceGeneration, 1);
  assert.equal(controller.getCall(admitted.callId).disposition.workspaceMutation, "none");
}, { durable: false }));

test("D1 fails closed when durable authority is unavailable", () => withController((controller) => {
  assert.throws(() => controller.admit(call("write-1", { kind: "write", path: "a", content: "x" })), /no fallback/);
}, { durable: false }));

test("D1 known completion is durable and advances generation", () => withController((controller, store) => {
  const admitted = call("write-1", { kind: "write", path: "a", content: "x" });
  controller.admit(admitted);
  controller.queue(admitted.callId);
  controller.start(admitted.callId);
  controller.finishKnown(admitted.callId);
  assert.equal(controller.status.workspaceGeneration, 2);
  assert.equal(store.getCall(admitted.callId).state, "TERMINAL_KNOWN");
  assert.equal(store.getLease("lease-1").workspaceGeneration, 2);
}));

test("queued D1 revalidates generation immediately before start", () => withController((controller) => {
  const first = call("write-1", { kind: "write", path: "a", content: "x" });
  const second = call("write-2", { kind: "write", path: "b", content: "y" });
  controller.admit(first); controller.admit(second); controller.queue(second.callId);
  controller.start(first.callId); controller.finishKnown(first.callId);
  assert.throws(() => controller.start(second.callId), /changed while the call was queued/);
}));

test("exec cannot succeed before descendant emptiness is proven", () => withController((controller) => {
  const admitted = call("exec-1", { kind: "exec", argv: ["true"] });
  controller.admit(admitted); controller.start(admitted.callId);
  assert.throws(() => controller.finishKnown(admitted.callId), /descendant emptiness/);
  controller.noteDescendantsEmpty(admitted.callId);
  controller.finishKnown(admitted.callId);
  assert.equal(controller.getCall(admitted.callId).disposition.descendants, "empty");
}));

test("output credits, sequence numbers, and chunk limits are enforced", () => withController((controller) => {
  const admitted = call("read-1", { kind: "read", path: "a" });
  controller.admit(admitted); controller.start(admitted.callId);
  assert.equal(controller.emitOutput(admitted.callId, "stdout", Buffer.from("1234")).sequence, 1);
  assert.equal(controller.emitOutput(admitted.callId, "stdout", Buffer.from("5678")).sequence, 2);
  assert.throws(() => controller.emitOutput(admitted.callId, "stdout", Buffer.from("x")), /credit/);
  controller.grantOutputCredit(admitted.callId, "stdout", 4, 2);
  assert.equal(controller.emitOutput(admitted.callId, "stdout", Buffer.from("x")).sequence, 3);
}));

test("started D1 uncertainty quarantines and blocks subsequent calls", () => withController((controller, store) => {
  const admitted = call("exec-1", { kind: "exec", argv: ["true"] });
  controller.admit(admitted); controller.start(admitted.callId);
  const unknown = controller.finishUnknown(admitted.callId, "peer-disconnected");
  assert.equal(unknown.disposition.workspaceMutation, "unknown");
  assert.equal(controller.status.leaseState, "QUARANTINED");
  assert.equal(store.getLease("lease-1").state, "QUARANTINED");
  assert.throws(() => controller.admit(call("read-2", { kind: "read", path: "b" }, 1)), /QUARANTINED/);
}));

test("pre-effect cancellation is retry-safe and does not quarantine", () => withController((controller, store) => {
  const admitted = call("write-1", { kind: "write", path: "a", content: "x" });
  controller.admit(admitted); controller.queue(admitted.callId);
  const cancelled = controller.cancel(admitted.callId);
  assert.equal(cancelled.state, "CANCELLED_PRE_EFFECT");
  assert.equal(cancelled.disposition.retrySafety, "safe");
  assert.equal(store.getLease("lease-1").state, "READY");
}));


test("duplicate call identity is idempotent only for the same digest", () => withController((controller) => {
  const first = call("same-call", { kind: "read", path: "a" });
  assert.deepEqual(controller.admit(first), controller.admit(first));
  const changed = call("same-call", { kind: "read", path: "b" });
  assert.throws(() => controller.admit(changed), /different digest/);
}, { durable: false }));
