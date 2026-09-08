#!/usr/bin/env node
/** Exercise actual rollout rejection; simulated approval is unit coverage, not pilot evidence. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextPacketToolResult } from "../src/context-pack.js";
import { buildContextPlan } from "../src/context-plan.js";
import { RIPWIRE_AUTO_APPROVAL } from "../src/ripwire-policy.js";

export async function policyScenario() {
  const root = await mkdtemp(join(tmpdir(), "rw09-"));
  const prior = process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED;
  try {
    delete process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED;
    const file = join(root, "index.ts");
    const source = "export function eligibilityCheck() { return true; }\n";
    await writeFile(file, source);
    const input = {
      objective: "Find eligibilityCheck implementation",
      providers: { agents: "off", docs: "off", git: "off", session: "off", ripwire: "auto" },
    };
    let calls = 0;
    const env = { cwd: root, ripwire: { onExecution: () => calls++ } };
    assert.equal(RIPWIRE_AUTO_APPROVAL.enabled, false);
    assert.equal(
      buildContextPlan(input, env).providerPlans.find((row) => row.provider === "ripwire").posture,
      "optional",
    );
    // Arbitrary model fields never promote the committed approval record.
    const auto = await contextPacketToolResult(
      { ...input, automaticApproval: { enabled: true, pairedTaskPilot: "passed" } },
      env,
    );
    assert.equal(Object.keys(auto.details.providerRuns).length, 0);
    assert.equal(calls, 0);
    const explicit = { ...input, providers: { ...input.providers, ripwire: "required" } };
    const code = await contextPacketToolResult(explicit, env);
    assert.equal(code.details.ok, true);
    assert.ok(calls >= 2);
    const before = calls;
    process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED = "1";
    const killed = await contextPacketToolResult(explicit, env);
    assert.equal(killed.details.ok, false);
    assert.match(killed.content[0].text, /operator_disabled/);
    assert.equal(calls, before);
    process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED = "0";
    const disabled = await contextPacketToolResult(
      { ...input, providers: { ...input.providers, ripwire: "off" } },
      env,
    );
    assert.equal(Object.keys(disabled.details.providerRuns).length, 0);
    assert.equal(calls, before);
    assert.equal(await readFile(file, "utf8"), source);
    return {
      gate: "RW-09",
      assertions: 11,
      targetUnchanged: true,
      adoptionEligible: false,
      modelTaskPilot: "BLOCKED_NOT_RUN",
      automaticInvocations: 0,
      explicitInvocations: before,
    };
  } finally {
    if (prior === undefined) delete process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED;
    else process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED = prior;
    await rm(root, { recursive: true, force: true });
  }
}
