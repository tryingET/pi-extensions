// ---
// summary: verifies the registry-owned ASC skill-profile resolver for standing-agent names.
// read_when:
//   - changing agent-name skill resolution for ASC dispatch.
// ---

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createAgentSkillProfileResolver } from "../src/agent-skill-resolver.ts";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { createAgentRegistry } from "../src/registry.ts";
import { commitAll, createAgentRepo, createProfileRepo, initRepo } from "./fleet-lint-fixtures.mjs";

async function withWorld(fn) {
  const scratch = mkdtempSync(join(tmpdir(), "skill-resolver-"));
  const profileRoot = join(scratch, "profiles");
  const templateRoot = join(scratch, "template");
  const fleetRoot = join(scratch, "fleet");
  createProfileRepo(profileRoot);
  initRepo(templateRoot);
  await writeFile(join(templateRoot, "README.md"), "template\n");
  const templateCommit = commitAll(templateRoot, "template");
  await createAgentRepo({
    root: join(fleetRoot, "agent-resolver"),
    name: "agent-resolver",
    profile: "ec-current",
    templateRoot,
    templateCommit,
  });
  const ec = await loadEcProfiles(join(profileRoot, "skills", "profiles.json"));
  const registry = await createAgentRegistry({ roots: [join(fleetRoot, "agent-*")], ec });
  try {
    await fn(registry, scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

test("agent names resolve to isolated materialized skill selections ASC can clean up", async () => {
  await withWorld(async (registry) => {
    const resolver = createAgentSkillProfileResolver(registry);
    const selection = await resolver("agent-resolver", {
      ctx: { cwd: process.cwd() },
    });
    assert.ok(selection);
    assert.equal(selection.noSkills, true);
    assert.equal(selection.skillProfile, "agent-resolver");
    assert.equal(selection.skillRegistry, "pi-agent-registry");
    assert.deepEqual(selection.loadedSkills, ["skill-a"]);
    assert.equal(selection.skillSources.length, 1);
    assert.ok(existsSync(join(selection.skillSources[0], "skill-a", "SKILL.md")));
    assert.ok(selection.cleanup);
    await selection.cleanup?.();
    assert.equal(
      existsSync(selection.skillSources[0]),
      false,
      "materialized dir removed on cleanup",
    );
  });
});

test("unknown profiles are declined so ASC fails closed with its own diagnostics", async () => {
  await withWorld(async (registry) => {
    const resolver = createAgentSkillProfileResolver(registry);
    assert.equal(await resolver("not-an-agent", { ctx: { cwd: process.cwd() } }), undefined);
  });
});

test("unknown extra skills surface as registry-owned failures", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "skill-resolver-extra-"));
  try {
    const profileRoot = join(scratch, "profiles");
    const templateRoot = join(scratch, "template");
    const fleetRoot = join(scratch, "fleet");
    createProfileRepo(profileRoot);
    initRepo(templateRoot);
    await writeFile(join(templateRoot, "README.md"), "template\n");
    const templateCommit = commitAll(templateRoot, "template");
    await createAgentRepo({
      root: join(fleetRoot, "agent-extra"),
      name: "agent-extra",
      profile: "ec-current",
      extras: ["missing-skill"],
      templateRoot,
      templateCommit,
    });
    const ec = await loadEcProfiles(join(profileRoot, "skills", "profiles.json"));
    const registry = await createAgentRegistry({ roots: [join(fleetRoot, "agent-*")], ec });
    const resolver = createAgentSkillProfileResolver(registry);
    await assert.rejects(resolver("agent-extra", { ctx: { cwd: process.cwd() } }), /missing-skill/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
