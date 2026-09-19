// ---
// summary: verifies pattern-based discovery, fail-closed resolution, and skill materialization from repository fixtures.
// read_when:
//   - changing discovery roots, resolution composition, or skill materialization.
// ---

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { AgentRegistryError, createAgentRegistry, expandTildePath } from "../src/registry.ts";

const FIXTURES_ROOT = new URL("./fixtures/", import.meta.url).pathname;
const FIXTURE_EC_PROFILES = join(FIXTURES_ROOT, "engineering-core/skills/profiles.json");

async function withRegistry(roots, options, fn) {
  const ec = options?.ec ?? (await loadEcProfiles(FIXTURE_EC_PROFILES));
  const registry = await createAgentRegistry({ roots, ec, ...options });
  return await fn(registry);
}

test("discovers agent repos through agent-* fleet patterns without nesting", async () => {
  await withRegistry([join(FIXTURES_ROOT, "agent-*")], {}, async (registry) => {
    assert.deepEqual([...registry.agents.keys()].sort(), [
      "agent-fixture-steward",
      "agent-fixture-watcher",
    ]);
    const listing = registry.list();
    const steward = listing.find((agent) => agent.name === "agent-fixture-steward");
    assert.equal(steward.display_name, "Fixture Steward");
    assert.equal(steward.role, "Fixture Steward");
    assert.equal(steward.creation_task, "AK-5098");
    assert.deepEqual(steward.tools, ["read", "bash", "edit"]);
    assert.equal(steward.skills.profile, "ec-defaults");
    assert.deepEqual(steward.skills.extra, ["local-helper-skill"]);
    // the fixtures root itself and non-matching dirs (dupes/) are never scanned
    assert.equal(registry.get("agent-fixture-duplicate"), undefined);
  });
});

test("duplicate agent names across discovered repos fail closed", async () => {
  await assert.rejects(
    withRegistry([join(FIXTURES_ROOT, "dupes", "agent-*")], {}, async () => {}),
    /duplicate agent name "agent-fixture-duplicate" declared by both/,
  );
});

test("explicit non-glob root reads agent.json at the repo root only", async () => {
  const ec = await loadEcProfiles(FIXTURE_EC_PROFILES);
  const registry = await createAgentRegistry({
    roots: [join(FIXTURES_ROOT, "agent-fixture-watcher")],
    ec,
  });
  assert.deepEqual([...registry.agents.keys()], ["agent-fixture-watcher"]);
});

test("env-configured missing root fails closed while defaults skip silently", async () => {
  const previous = process.env.PI_AGENT_REGISTRY_ROOTS;
  const previousEc = process.env.PI_AGENT_REGISTRY_EC_PROFILES;
  process.env.PI_AGENT_REGISTRY_ROOTS = "/definitely/not/a/real/root/agent-*";
  process.env.PI_AGENT_REGISTRY_EC_PROFILES = FIXTURE_EC_PROFILES;
  try {
    await assert.rejects(createAgentRegistry(), /configured agent registry root does not exist/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_AGENT_REGISTRY_ROOTS;
    } else {
      process.env.PI_AGENT_REGISTRY_ROOTS = previous;
    }
    if (previousEc === undefined) {
      delete process.env.PI_AGENT_REGISTRY_EC_PROFILES;
    } else {
      process.env.PI_AGENT_REGISTRY_EC_PROFILES = previousEc;
    }
  }
});

test("resolution happy path composes prompt, tools, skills, scope, and activities", async () => {
  await withRegistry([join(FIXTURES_ROOT, "agent-fixture-steward")], {}, async (registry) => {
    const launch = await registry.resolve("agent-fixture-steward");
    try {
      assert.equal(launch.name, "agent-fixture-steward");
      assert.equal(launch.tools, "read,bash,edit");
      assert.equal(launch.thinking, "high");
      assert.equal(launch.model, null);
      assert.deepEqual(launch.extensions, [
        join(FIXTURES_ROOT, "agent-fixture-steward", "extensions", "fixture.ts"),
      ]);
      assert.match(launch.systemPrompt, /# Fixture Steward persona/);
      assert.match(launch.systemPrompt, /## Operating territory \(advisory scope\)/);
      assert.match(launch.systemPrompt, /\/tmp\/fixture-owned\/\*/);
      assert.match(launch.systemPrompt, /Forbidden paths:/);
      assert.deepEqual(launch.activities, ["prompts/activities/weekly-review.md"]);
      assert.deepEqual(launch.scopeRepos, ["/tmp/fixture-owned/*"]);
      assert.deepEqual(launch.scopeForbidden, [".git", "node_modules"]);

      assert.equal(launch.skillDirs.length, 1);
      assert.equal(existsSync(join(launch.skillDirs[0], "local-helper-skill", "SKILL.md")), true);
      for (const skill of launch.loadedSkills) {
        assert.equal(
          existsSync(join(launch.skillDirs[0], skill, "SKILL.md")),
          true,
          `materialized skill missing: ${skill}`,
        );
      }
      assert.deepEqual(launch.loadedSkills, ["local-helper-skill"]);
      const materialized = await readFile(
        join(launch.skillDirs[0], "local-helper-skill", "SKILL.md"),
        "utf8",
      );
      assert.match(materialized, /Fixture-local helper skill/);
    } finally {
      await launch.cleanup();
      // cleanup removed the materialized dir
      assert.equal(existsSync(launch.skillDirs[0]), false);
    }
  });
});

test("read-only agent preserves an empty least-privilege tool declaration", async () => {
  await withRegistry([join(FIXTURES_ROOT, "agent-fixture-watcher")], {}, async (registry) => {
    const launch = await registry.resolve("agent-fixture-watcher");
    try {
      assert.equal(launch.tools, "");
      assert.deepEqual(launch.skillDirs, []);
      assert.deepEqual(launch.loadedSkills, []);
      assert.match(launch.systemPrompt, /# Watcher persona/);
      assert.doesNotMatch(launch.systemPrompt, /Operating territory/);
    } finally {
      await launch.cleanup();
    }
  });
});

test("unknown agent names fail closed with the registered set", async () => {
  await withRegistry([join(FIXTURES_ROOT, "agent-fixture-watcher")], {}, async (registry) => {
    await assert.rejects(registry.resolve("no-such-agent"), (error) => {
      assert.ok(error instanceof AgentRegistryError);
      assert.match(error.message, /unknown agent: no-such-agent/);
      assert.match(error.message, /agent-fixture-watcher/);
      return true;
    });
  });
});

test("expandTildePath handles ~, ~/, and absolute forms", () => {
  const home = expandTildePath("~");
  assert.equal(home, expandTildePath("~/"));
  assert.match(expandTildePath("~/ai-society"), new RegExp(`${home}/ai-society$`));
  assert.equal(expandTildePath("/abs/path"), "/abs/path");
});

test("skills extras fail closed when the skill cannot be found in any root", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-registry-bad-extra-"));
  try {
    await mkdir(join(dir, "docs"), { recursive: true });
    await writeFile(join(dir, "docs", "prompt.md"), "persona\n", "utf8");
    await writeFile(
      join(dir, "agent.json"),
      JSON.stringify({
        schema: "ai-society.agent/1",
        name: "agent-fixture-bad-extra",
        system_prompt_file: "docs/prompt.md",
        skills: { extra: ["totally-missing-skill"] },
        tools: ["read"],
      }),
      "utf8",
    );
    const ec = await loadEcProfiles(FIXTURE_EC_PROFILES);
    const registry = await createAgentRegistry({ roots: [dir], ec });
    await assert.rejects(
      registry.resolve("agent-fixture-bad-extra"),
      /skill "totally-missing-skill" not found/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
