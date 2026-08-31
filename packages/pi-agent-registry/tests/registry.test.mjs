// ---
// summary: verifies pattern-based discovery, fail-closed resolution, skill materialization from real EC profiles, and the real steward manifest.
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

const REAL_EC_PROFILES = join(
  expandTildePath("~/ai-society"),
  "core/engineering-core/skills/profiles.json",
);
const FIXTURES_ROOT = new URL("./fixtures/", import.meta.url).pathname;

async function withRegistry(roots, options, fn) {
  const ec = options?.ec ?? (await loadEcProfiles(REAL_EC_PROFILES));
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
  const ec = await loadEcProfiles(REAL_EC_PROFILES);
  const registry = await createAgentRegistry({
    roots: [join(FIXTURES_ROOT, "agent-fixture-watcher")],
    ec,
  });
  assert.deepEqual([...registry.agents.keys()], ["agent-fixture-watcher"]);
});

test("env-configured missing root fails closed while defaults skip silently", async () => {
  const previous = process.env.PI_AGENT_REGISTRY_ROOTS;
  process.env.PI_AGENT_REGISTRY_ROOTS = "/definitely/not/a/real/root/agent-*";
  try {
    await assert.rejects(createAgentRegistry(), /configured agent registry root does not exist/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_AGENT_REGISTRY_ROOTS;
    } else {
      process.env.PI_AGENT_REGISTRY_ROOTS = previous;
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
      // ec-defaults = 5 disciplines + local extra
      assert.equal(launch.loadedSkills.length, 6);
      assert.ok(launch.loadedSkills.includes("ec-discipline-testing"));
      assert.ok(launch.loadedSkills.includes("local-helper-skill"));
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

test("profile materialization uses the real engineering-core profiles.json", async () => {
  await withRegistry([join(FIXTURES_ROOT, "agent-fixture-steward")], {}, async (registry) => {
    const ecFull = registry.ec.profiles.get("ec-full");
    assert.ok(ecFull, "real EC profiles must expose ec-full");
    assert.ok(
      ecFull.length >= 40,
      `ec-full should carry the full discipline set, got ${ecFull.length}`,
    );
    assert.deepEqual([...registry.ec.profiles.keys()].slice().sort().slice(0, 4), [
      "ec-common-lisp",
      "ec-common-lisp.justfile",
      "ec-cpp",
      "ec-cpp.cuda",
    ]);
  });
});

test("resolve against the real adoption-steward repo (live fleet fixture)", async () => {
  const ec = await loadEcProfiles(REAL_EC_PROFILES);
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
    // ec-full profile members + ai-society-runtime-recipes extra, all materialized
    assert.equal(launch.loadedSkills.length, ecFullCount(registry) + 1);
    assert.ok(launch.loadedSkills.includes("ai-society-runtime-recipes"));
    for (const skill of launch.loadedSkills) {
      assert.equal(
        existsSync(join(launch.skillDirs[0], skill, "SKILL.md")),
        true,
        `real steward skill missing: ${skill}`,
      );
    }
    // activities glob expanded to the four shipped activity prompts
    assert.equal(launch.activities.length, 4);
    assert.ok(launch.activities.includes("prompts/activities/adoption-audit.md"));
  } finally {
    await launch.cleanup();
  }

  function ecFullCount(reg) {
    return reg.ec.profiles.get("ec-full")?.length ?? 0;
  }
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
    const ec = await loadEcProfiles(REAL_EC_PROFILES);
    const registry = await createAgentRegistry({ roots: [dir], ec });
    await assert.rejects(
      registry.resolve("agent-fixture-bad-extra"),
      /skill "totally-missing-skill" not found/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
