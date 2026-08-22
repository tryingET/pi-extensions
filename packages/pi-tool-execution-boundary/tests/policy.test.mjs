import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  normalizePolicy,
  comparePolicy,
  compileEffectivePolicy,
  policyDigest,
} from "../src/policy.js";

function policy(overrides = {}) {
  return normalizePolicy(overrides);
}

test("normalizes the complete closed policy", () => {
  const result = policy({ tools: { allowed: ["read", "write"], userBash: false } });
  assert.deepEqual(result.tools.allowed, ["read", "write"]);
  assert.equal(result.admission.voiceActiveBatchAdmission, "deny");
  assert.ok(Object.isFrozen(result));
});

test("rejects unknown, invalid, and contradictory fields", () => {
  assert.throws(() => policy({ network: {} }), /unknown field/);
  assert.throws(() => policy({ source: { requireCleanGit: false } }), /must be true/);
  assert.throws(() => policy({ hostDefense: { requireSystemdHardening: false } }), /must be true/);
  assert.throws(() => policy({ tools: { allowed: ["read"], userBash: true } }), /requires bash/);
  assert.throws(() => policy({ admission: { cpuPsiSomeAvg10Max: 1.5 } }), /safe integer/);
  assert.throws(() => policy({ source: { maxBlobBytes: 10, maxAggregateBytes: 9 } }), /cannot exceed/);
});

test("proves equal and narrower policies across all lattice classes", () => {
  assert.equal(comparePolicy(DEFAULT_POLICY, DEFAULT_POLICY).relation, "equal");
  const narrowed = policy({
    tools: { allowed: ["read", "ls"], userBash: false },
    source: { allowRelativeSymlinks: false, maxFiles: 10_000 },
    resources: { vcpus: 4, memoryBytes: 8_589_934_592 },
    admission: {
      minimumHostFreeBytes: 30_000_000_000,
      cpuPsiSomeAvg10Max: 5,
      voiceActiveBatchAdmission: "deny",
    },
    retention: {
      retainFailedWorkspace: false,
      quarantineDays: 3,
    },
    hostDefense: { landlock: "required" },
  });
  const proof = comparePolicy(narrowed, DEFAULT_POLICY);
  assert.equal(proof.relation, "narrower");
  assert.match(proof.proofDigest, /^[a-f0-9]{64}$/);
  assert.equal(compileEffectivePolicy(narrowed, DEFAULT_POLICY).policyDigest, policyDigest(narrowed));
});

test("rejects broader authority in tools, resources, retention, and hardening", () => {
  const restrictive = policy({
    tools: { allowed: ["read"], userBash: false },
    resources: { vcpus: 2 },
    retention: { retainFailedWorkspace: false },
    hostDefense: { landlock: "required" },
  });
  for (const broader of [
    policy({ tools: { allowed: ["read", "write"], userBash: false }, resources: { vcpus: 2 }, retention: { retainFailedWorkspace: false }, hostDefense: { landlock: "required" } }),
    policy({ tools: { allowed: ["read"], userBash: false }, resources: { vcpus: 3 }, retention: { retainFailedWorkspace: false }, hostDefense: { landlock: "required" } }),
    policy({ tools: { allowed: ["read"], userBash: false }, resources: { vcpus: 2 }, retention: { retainFailedWorkspace: true }, hostDefense: { landlock: "required" } }),
    policy({ tools: { allowed: ["read"], userBash: false }, resources: { vcpus: 2 }, retention: { retainFailedWorkspace: false }, hostDefense: { landlock: "preferred" } }),
  ]) {
    assert.equal(comparePolicy(broader, restrictive).relation, "broader");
    assert.throws(() => compileEffectivePolicy(broader, restrictive), /broader/);
  }
});
