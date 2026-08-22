import test from "node:test";
import assert from "node:assert/strict";
import { normalizePolicy } from "../src/policy.js";
import { compileSemanticPlan, evaluateBackendCapabilities, requireConformingBackend } from "../src/plan.js";

const plan = compileSemanticPlan(normalizePolicy());

test("semantic plan is backend-neutral and binds no-host/no-network requirements", () => {
  assert.equal(plan.profile, "microvm-offline");
  assert.equal(plan.network.guestInterface, "absent");
  assert.equal(plan.source.hostMountAllowed, false);
  assert.match(plan.semanticPlanDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(plan).includes("qemu-system"), false);
});

test("backend capabilities fail closed on any missing control", () => {
  const missing = evaluateBackendCapabilities(plan, { backendId: "x", microvm: true });
  assert.equal(missing.conforming, false);
  assert.ok(missing.missing.includes("noHostFallback"));
  assert.throws(() => requireConformingBackend(plan, { backendId: "x", microvm: true }), /missing/);
});

test("complete capability report conforms", () => {
  const capabilities = Object.fromEntries(plan.requiredCapabilities.map((key) => [key, true]));
  capabilities.backendId = "candidate";
  capabilities.backendVersion = "1";
  assert.equal(requireConformingBackend(plan, capabilities).conforming, true);
});
