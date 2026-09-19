// summary: The explicit health lane exercises the actual lint tool against the live fleet, without dispatch.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("agent_registry lint returns the real immutable unhealthy fleet observation without dispatch", async () => {
  const fleetRoot = join(homedir(), "ai-society/agents");
  const profilesPath = join(homedir(), "ai-society/core/engineering-core/skills/profiles.json");
  assert.ok(
    existsSync(fleetRoot) && existsSync(profilesPath),
    "environment health requires real fleet/profile sources",
  );
  const previousRoots = process.env.PI_AGENT_REGISTRY_ROOTS;
  const previousEc = process.env.PI_AGENT_REGISTRY_EC_PROFILES;
  process.env.PI_AGENT_REGISTRY_ROOTS = join(fleetRoot, "agent-*");
  process.env.PI_AGENT_REGISTRY_EC_PROFILES = profilesPath;
  try {
    const tools = new Map();
    const module = await import("../../extensions/pi-agent-registry.ts");
    module.default({
      on() {},
      registerCommand() {},
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    });
    const result = await tools
      .get("agent_registry")
      .execute("lint-real", { action: "lint" }, null, null, { cwd: process.cwd() });
    assert.match(result.content[0].text, /fleet lint unhealthy: repositories=4\/4, manifests=1/);
    assert.match(result.content[0].text, /Observation only: no agent was selected/);
    assert.equal(result.details.schema, "ai-society.agent-fleet-lint/1");
    assert.equal(result.details.summary.errors, 7);
    assert.equal(result.details.authorityEffect, "none");
  } finally {
    if (previousRoots === undefined) delete process.env.PI_AGENT_REGISTRY_ROOTS;
    else process.env.PI_AGENT_REGISTRY_ROOTS = previousRoots;
    if (previousEc === undefined) delete process.env.PI_AGENT_REGISTRY_EC_PROFILES;
    else process.env.PI_AGENT_REGISTRY_EC_PROFILES = previousEc;
  }
});
