// summary: Explicit environment checks retain real EC profile and steward compatibility observations.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { loadEcProfiles } from "../../src/ec-profiles.ts";
import { createAgentRegistry, expandTildePath } from "../../src/registry.ts";

const profilesPath = join(
  expandTildePath("~/ai-society"),
  "core/engineering-core/skills/profiles.json",
);
const fixturesRoot = new URL("../fixtures/", import.meta.url).pathname;

test("profile materialization uses the real engineering-core profiles.json", async () => {
  assert.ok(existsSync(profilesPath), "environment health requires real engineering-core profiles");
  const ec = await loadEcProfiles(profilesPath);
  const registry = await createAgentRegistry({
    roots: [join(fixturesRoot, "agent-fixture-steward")],
    ec,
  });
  const ecFull = registry.ec.profiles.get("ec-full");
  assert.ok(ecFull, "real EC profiles must expose ec-full");
  assert.ok(
    ecFull.length >= 40,
    `ec-full should carry the full discipline set, got ${ecFull.length}`,
  );
  assert.deepEqual([...registry.ec.profiles.keys()].sort().slice(0, 4), [
    "ec-common-lisp",
    "ec-common-lisp.justfile",
    "ec-cpp",
    "ec-cpp.cuda",
  ]);
});

test("resolve against the real adoption-steward repo (live fleet fixture)", async () => {
  const fleetRoot = join(expandTildePath("~/ai-society"), "agents", "agent-adoption-steward");
  assert.ok(
    existsSync(profilesPath) && existsSync(fleetRoot),
    "environment health requires the real steward and profiles",
  );
  const ec = await loadEcProfiles(profilesPath);
  const registry = await createAgentRegistry({
    roots: [join(expandTildePath("~/ai-society"), "agents", "agent-*")],
    ec,
  });
  assert.ok(registry.get("agent-adoption-steward"), "real steward manifest must be discovered");
  const launch = await registry.resolve("agent-adoption-steward");
  try {
    assert.equal(launch.tools, "read,bash");
    assert.equal(launch.thinking, "medium");
    assert.equal(launch.model, null);
    assert.match(launch.systemPrompt, /You are \*\*agent-adoption-steward\*\*/);
    assert.match(launch.systemPrompt, /read-only advisory territory/);
    assert.match(launch.systemPrompt, /softwareco\/owned\/\*/);
    assert.equal(
      launch.loadedSkills.length,
      (registry.ec.profiles.get("ec-full")?.length ?? 0) + 1,
    );
    assert.ok(launch.loadedSkills.includes("ai-society-runtime-recipes"));
    for (const skill of launch.loadedSkills) {
      assert.equal(
        existsSync(join(launch.skillDirs[0], skill, "SKILL.md")),
        true,
        `real steward skill missing: ${skill}`,
      );
    }
    assert.equal(launch.activities.length, 4);
    assert.ok(launch.activities.includes("prompts/activities/adoption-audit.md"));
  } finally {
    await launch.cleanup();
  }
});
