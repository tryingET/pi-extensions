/**
summary: "Verify inactive rollout and the kill switch through an installed registered tool."
read_when:
  - "Changing live code-provider activation controls."
*/
import assert from "node:assert/strict";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SmokeTool } from "./runtime-smoke.ts";

export async function runRipwirePolicySmoke(tool: SmokeTool, context: ExtensionContext) {
  const providers = { agents: "off", docs: "off", git: "off", session: "off", ripwire: "auto" };
  const input = { objective: "Find providerIsExecutable implementation", providers };
  const prior = process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED;
  try {
    delete process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED;
    const automatic = await tool.execute("policy-auto", input, undefined, undefined, context);
    assert.equal(Object.keys(automatic.details?.providerRuns as object).length, 0);
    process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED = "true";
    const required = await tool.execute(
      "policy-killed",
      { ...input, providers: { ...providers, ripwire: "required" } },
      undefined,
      undefined,
      context,
    );
    assert.equal(required.details?.ok, false);
    assert.ok(
      required.content.some(
        (item) => item.type === "text" && item.text.includes("operator_disabled"),
      ),
    );
    const off = await tool.execute(
      "policy-off",
      { ...input, providers: { ...providers, ripwire: "off" } },
      undefined,
      undefined,
      context,
    );
    assert.equal(Object.keys(off.details?.providerRuns as object).length, 0);
    console.log("ripwire registered rollout gate PASS (automatic activation remains blocked)");
  } finally {
    if (prior === undefined) delete process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED;
    else process.env.PI_CONTEXT_PACKER_RIPWIRE_DISABLED = prior;
  }
}
