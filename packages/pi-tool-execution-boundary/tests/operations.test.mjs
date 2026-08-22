import test from "node:test";
import assert from "node:assert/strict";
import {
  WorkspacePath,
  normalizeRequestedOperation,
  deriveEffect,
  deriveDurability,
  admitOperation,
} from "../src/operations.js";
import { normalizePolicy } from "../src/policy.js";

const effectivePolicy = normalizePolicy();
const base = {
  callId: "018f0000-0000-7000-8000-000000000001",
  leaseId: "lease-1",
  clientSessionId: "session-1",
  clientEpoch: "epoch-1",
  effectivePolicy,
  workspaceGeneration: 1,
};

const fixtures = [
  [{ kind: "read", path: "src/a.ts" }, "read", "D0-replay-safe-read"],
  [{ kind: "list", path: "." }, "read", "D0-replay-safe-read"],
  [{ kind: "grep", path: ".", pattern: "x" }, "read", "D0-replay-safe-read"],
  [{ kind: "find", path: ".", pattern: "*.ts" }, "read", "D0-replay-safe-read"],
  [{ kind: "write", path: "a", content: "x" }, "workspace-mutation", "D1-workspace-effect"],
  [{ kind: "edit", path: "a", oldText: "x", newText: "y" }, "workspace-mutation", "D1-workspace-effect"],
  [{ kind: "exec", argv: ["true"] }, "arbitrary-process", "D1-workspace-effect"],
];
for (const [input, effect, durability] of fixtures) {
  test(`derives ${input.kind} effect and durability`, () => {
    const op = normalizeRequestedOperation(input);
    assert.equal(deriveEffect(op), effect);
    assert.equal(deriveDurability(op), durability);
  });
}

test("variant schemas reject irrelevant fields and caller classifications", () => {
  assert.throws(() => normalizeRequestedOperation({ kind: "read", path: "a", content: "x" }), /unknown field/i);
  assert.throws(() => normalizeRequestedOperation({ kind: "exec", argv: ["true"], effect: "read" }), /unknown field/i);
  assert.throws(() => normalizeRequestedOperation({ kind: "read", path: "a", durability: "D1" }), /unknown field/i);
});

test("workspace paths reject host paths, traversal, non-NFC, controls, and .git", () => {
  for (const value of ["/etc/passwd", "../x", "src/.git/config", "x\nname", "C:\\Windows\\x"] ) {
    assert.throws(() => WorkspacePath.parse(value));
  }
  assert.throws(() => WorkspacePath.parse("e\u0301"), /NFC/);
  assert.equal(WorkspacePath.parse("src/main.ts").toString(), "src/main.ts");
  assert.equal(WorkspacePath.parse(".").toString(), ".");
});

test("exec environment is sorted, bounded, and plan-controlled keys are denied", () => {
  const op = normalizeRequestedOperation({
    kind: "exec",
    argv: ["env"],
    environment: { ZED: "2", ALPHA: "1" },
  });
  assert.deepEqual(op.environment, [["ALPHA", "1"], ["ZED", "2"]]);
  for (const key of ["PATH", "HOME", "LD_PRELOAD", "GIT_CONFIG_COUNT", "SSH_AUTH_SOCK", "HTTPS_PROXY"]) {
    assert.throws(() => normalizeRequestedOperation({ kind: "exec", argv: ["true"], environment: { [key]: "x" } }), /controlled by the execution plan/);
  }
});

test("request digest binds all operation payloads and call identity", () => {
  const call = (operation, overrides = {}) => admitOperation({ ...base, operation, ...overrides });
  const digests = new Set([
    call({ kind: "write", path: "a", content: "x" }).requestDigest,
    call({ kind: "write", path: "a", content: "y" }).requestDigest,
    call({ kind: "edit", path: "a", oldText: "x", newText: "y" }).requestDigest,
    call({ kind: "edit", path: "a", oldText: "x", newText: "z" }).requestDigest,
    call({ kind: "grep", path: ".", pattern: "x" }).requestDigest,
    call({ kind: "grep", path: ".", pattern: "y" }).requestDigest,
    call({ kind: "exec", argv: ["echo", "x"], environment: { A: "1" } }).requestDigest,
    call({ kind: "exec", argv: ["echo", "y"], environment: { A: "1" } }).requestDigest,
    call({ kind: "exec", argv: ["echo", "x"], environment: { A: "2" } }).requestDigest,
    call({ kind: "read", path: "a" }, { clientEpoch: "epoch-2" }).requestDigest,
    call({ kind: "read", path: "a" }, { expectedWorkspaceGeneration: 1, requestedTimeoutMs: 1_000 }).requestDigest,
  ]);
  assert.equal(digests.size, 11);
});

test("admission enforces allowed tools, user shell, stale generation, and timeout clamp", () => {
  const policy = normalizePolicy({ tools: { allowed: ["read", "bash"], userBash: false }, resources: { callTimeoutMs: 1_000 } });
  const admitted = admitOperation({ ...base, effectivePolicy: policy, operation: { kind: "read", path: "a" }, requestedTimeoutMs: 20_000 });
  assert.equal(admitted.timeoutMs, 1_000);
  assert.throws(() => admitOperation({ ...base, effectivePolicy: policy, operation: { kind: "write", path: "a", content: "x" } }), /not allowed/);
  assert.throws(() => admitOperation({ ...base, effectivePolicy: policy, operation: { kind: "exec", argv: ["true"], userInitiated: true } }), /disabled/);
  assert.throws(() => admitOperation({ ...base, effectivePolicy: policy, operation: { kind: "read", path: "a" }, expectedWorkspaceGeneration: 2 }), /generation has changed/);
});
