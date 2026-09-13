import assert from "node:assert/strict";
import test from "node:test";
import { contextPacketToolResult } from "../src/context-pack.js";
import { buildContextPlan } from "../src/context-plan.js";

test("ripwire requires explicit selection and reports runtime preflight", () => {
  const objective = "Find implementation code";
  const automatic = buildContextPlan({ objective });
  assert.equal(automatic.providerPlans.find((p) => p.provider === "ripwire").posture, "optional");
  const explicit = buildContextPlan({ objective, providers: { ripwire: "required" } });
  assert.deepEqual(explicit.executionSummary.runtimePreflightRequired, ["ripwire"]);
});

test("required ripwire failure is not a successful empty packet", async () => {
  const result = await contextPacketToolResult(
    {
      objective: "Find code",
      providers: {
        ripwire: "required",
        agents: "off",
        git: "off",
        docs: "off",
        session: "off",
      },
    },
    { ripwire: { binaryPath: "/missing-ripwire-fixture" } },
  );
  assert.equal(result.details.ok, false);
  assert.equal(result.isError, true);
  assert.deepEqual(result.details.requiredProviderFailures, ["ripwire"]);
  assert.match(result.content[0].text, /Required code provider unavailable/);
});

test("zero headroom does not invoke ripwire", async () => {
  let calls = 0;
  const result = await contextPacketToolResult(
    {
      objective: "Find code",
      providers: {
        ripwire: "required",
        agents: "off",
        git: "off",
        docs: "off",
        session: "off",
      },
    },
    { remainingInputTokens: 0, ripwire: { onExecution: () => calls++ } },
  );
  assert.equal(calls, 0);
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "");
});
