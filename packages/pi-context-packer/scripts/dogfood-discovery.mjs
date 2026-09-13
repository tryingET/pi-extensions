/** Exercise unseeded discovery through the packaged packet API. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contextPacketToolResult } from "../src/context-pack.js";
import { buildContextPlan } from "../src/context-plan.js";
import { fixtureDigest } from "./dogfood-fixtures.mjs";

export async function discoveryScenario() {
  const root = await mkdtemp(join(tmpdir(), "ripwire-discovery-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(
      join(root, "src", "capabilities.ts"),
      "export function providerIsExecutable(mode: string) { return mode === 'wired'; }\n",
    );
    const before = await fixtureDigest(root);
    const calls = [];
    const env = { cwd: root, ripwire: { onExecution: (args) => calls.push(args) } };
    const input = {
      objective:
        "Which implementation decides whether a provider is executable? providerIsExecutable",
      providers: { ripwire: "required", agents: "off", docs: "off", git: "off", session: "off" },
    };
    const plan = buildContextPlan(input, env);
    assert.equal(plan.codeContextStatus, "runtime_preflight_required");
    assert.ok(plan.executionSummary.runtimePreflightRequired.includes("ripwire"));
    const result = await contextPacketToolResult(input, env);
    assert.equal(result.details.ok, true);
    assert.match(result.content[0].text, /src\/capabilities.ts:1/);
    assert.equal(result.details.providerRuns.ripwire.analyzedFiles, 1);
    assert.equal(calls.length, 2);
    for (const mode of ["off", "auto"]) {
      const off = await contextPacketToolResult(
        { ...input, providers: { ...input.providers, ripwire: mode } },
        env,
      );
      assert.equal(Object.keys(off.details.providerRuns).length, 0);
    }
    assert.equal(calls.length, 2);
    const unavailable = await contextPacketToolResult(input, {
      ...env,
      ripwire: {
        binaryPath: "/missing-ripwire-fixture",
        onExecution: () => {
          throw new Error("must not execute");
        },
      },
    });
    assert.equal(unavailable.details.ok, false);
    assert.equal(unavailable.isError, true);
    assert.match(unavailable.content[0].text, /Required code provider unavailable/);
    assert.deepEqual(unavailable.details.requiredProviderFailures, ["ripwire"]);
    assert.equal(await fixtureDigest(root), before);
    return {
      gate: "RW-04",
      noFilenameSeeds: true,
      realBinary: true,
      requiredFailureDisclosed: true,
      offAndAutoDoNotExecute: true,
      actualSubprocessCalls: calls.length,
      targetUnchanged: true,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
