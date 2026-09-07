import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRipwirePolicy,
  plannedRipwirePolicy,
  RIPWIRE_AUTO_APPROVAL,
} from "../src/ripwire-policy.js";
import { collectRipwire } from "../src/ripwire-provider.js";

const ready = {
  mode: "auto",
  codeIntent: true,
  hasHeadroom: true,
  binaryConfigured: true,
  contextSatisfied: false,
  disabled: false,
};
const approval = {
  schema: "pi.ripwire-auto-approval.v1",
  enabled: true,
  pairedTaskPilot: "passed",
  evidenceSha256: "b".repeat(64),
};

test("production approval is immutable and never accepts model or environment promotion", () => {
  assert.equal(Object.isFrozen(RIPWIRE_AUTO_APPROVAL), true);
  assert.equal(evaluateRipwirePolicy(ready).posture, "optional");
  assert.equal(evaluateRipwirePolicy({ ...ready, mode: "required" }).posture, "selected");
  assert.equal(evaluateRipwirePolicy({ ...ready, mode: "off" }).posture, "skipped");
  for (const broken of [
    { ...approval, evidenceSha256: null },
    { ...approval, enabled: "true" },
    { ...approval, pairedTaskPilot: "not_run" },
  ])
    assert.equal(evaluateRipwirePolicy(ready, broken).posture, "optional");
  assert.equal(
    plannedRipwirePolicy({
      mode: "auto",
      codeIntent: true,
      budget: { maxTokens: 4000, maxBytes: 8000, perProviderMaxTokens: { ripwire: 2000 } },
      env: { automaticApproval: approval },
    }).posture,
    "optional",
  );
});

test("pure policy approval fixture tests relevance and resource gates, not actual rollout", () => {
  assert.equal(evaluateRipwirePolicy(ready, approval).posture, "selected");
  for (const blocked of [
    { codeIntent: false },
    { hasHeadroom: false },
    { contextSatisfied: true },
    { binaryConfigured: false },
  ])
    assert.equal(evaluateRipwirePolicy({ ...ready, ...blocked }, approval).posture, "optional");
  assert.equal(evaluateRipwirePolicy({ ...ready, disabled: true }, approval).posture, "skipped");
  assert.equal(evaluateRipwirePolicy({ ...ready, mode: "off" }, approval).posture, "skipped");
});

test("operator kill gate runs before binary reads, source copying or any process", async () => {
  let invoked = false;
  const result = await collectRipwire(
    { root: "/does-not-exist", objective: "code" },
    {
      disabled: true,
      execFile: () => {
        invoked = true;
        throw Error("Must not execute");
      },
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.omissions[0].reason, "operator_disabled");
  assert.equal(invoked, false);
});
