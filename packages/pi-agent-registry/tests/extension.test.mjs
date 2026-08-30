// ---
// summary: verifies the extension registers agent_registry/dispatch_agent tools and the /agents command against fixture roots.
// read_when:
//   - changing the extension entrypoint wiring or tool registration behavior.
// ---

import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const FIXTURES_ROOT = new URL("./fixtures/", import.meta.url).pathname;
const REAL_EC_PROFILES = join(
  process.env.HOME,
  "ai-society/core/engineering-core/skills/profiles.json",
);

function createPiHarness() {
  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();
  const notifications = [];
  const pi = {
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    registerTool(definition) {
      tools.set(definition.name, definition);
    },
    registerCommand(name, definition) {
      commands.set(name, definition);
    },
  };
  return { pi, tools, commands, handlers, notifications };
}

async function withExtensionEnv(fn) {
  const previousRoots = process.env.PI_AGENT_REGISTRY_ROOTS;
  const previousEc = process.env.PI_AGENT_REGISTRY_EC_PROFILES;
  process.env.PI_AGENT_REGISTRY_ROOTS = join(FIXTURES_ROOT, "agent-*");
  process.env.PI_AGENT_REGISTRY_EC_PROFILES = REAL_EC_PROFILES;
  // isolate from the operator's real skills root for extras resolution
  const previousUserSkills = process.env.PI_AGENT_REGISTRY_USER_SKILLS;
  delete process.env.PI_AGENT_REGISTRY_USER_SKILLS;
  try {
    return await fn();
  } finally {
    if (previousRoots === undefined) delete process.env.PI_AGENT_REGISTRY_ROOTS;
    else process.env.PI_AGENT_REGISTRY_ROOTS = previousRoots;
    if (previousEc === undefined) delete process.env.PI_AGENT_REGISTRY_EC_PROFILES;
    else process.env.PI_AGENT_REGISTRY_EC_PROFILES = previousEc;
    if (previousUserSkills === undefined) delete process.env.PI_AGENT_REGISTRY_USER_SKILLS;
    else process.env.PI_AGENT_REGISTRY_USER_SKILLS = previousUserSkills;
  }
}

async function loadExtension(pi) {
  const module = await import("../extensions/pi-agent-registry.ts");
  module.default(pi);
}

test("extension registers agent_registry, dispatch_agent, and /agents", async () => {
  await withExtensionEnv(async () => {
    const harness = createPiHarness();
    await loadExtension(harness.pi);
    assert.ok(harness.tools.has("agent_registry"));
    assert.ok(harness.tools.has("dispatch_agent"));
    assert.ok(harness.commands.has("agents"));
    const registryTool = harness.tools.get("agent_registry");
    assert.match(registryTool.description, /ai-society\.agent\/1/);
    const dispatchTool = harness.tools.get("dispatch_agent");
    assert.match(dispatchTool.description, /ASC/);
    assert.equal(dispatchTool.parameters.properties.agent.type, "string");
    assert.equal(dispatchTool.parameters.properties.objective.maxLength, 100000);
    assert.match(dispatchTool.description, /disabled during Fleet Phase 0/);
    assert.deepEqual(Object.keys(dispatchTool.parameters.properties), ["agent", "objective"]);
  });
});

test("agent_registry list and show resolve fixture agents", async () => {
  await withExtensionEnv(async () => {
    const harness = createPiHarness();
    await loadExtension(harness.pi);
    const tool = harness.tools.get("agent_registry");

    const listed = await tool.execute("t1", { action: "list" }, null, null, {
      cwd: process.cwd(),
    });
    assert.match(listed.content[0].text, /agent-fixture-steward/);
    assert.match(listed.content[0].text, /agent-fixture-watcher/);
    assert.deepEqual(listed.details.agents.sort(), [
      "agent-fixture-steward",
      "agent-fixture-watcher",
    ]);

    const isolatedTmp = await mkdtemp(join(tmpdir(), "agent-registry-show-cleanup-"));
    const previousTmp = process.env.TMPDIR;
    process.env.TMPDIR = isolatedTmp;
    try {
      const shown = await tool.execute(
        "t2",
        { action: "show", agent: "agent-fixture-steward" },
        null,
        null,
        {
          cwd: process.cwd(),
        },
      );
      assert.match(shown.content[0].text, /tools: read,bash,edit/);
      assert.match(shown.content[0].text, /ec-discipline-testing/);
      assert.equal(shown.details.loadedSkills.includes("local-helper-skill"), true);
      assert.deepEqual(await readdir(isolatedTmp), []);
    } finally {
      if (previousTmp === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = previousTmp;
      await rm(isolatedTmp, { recursive: true, force: true });
    }

    const unknown = await tool.execute("t3", { action: "show", agent: "nope" }, null, null, {
      cwd: process.cwd(),
    });
    assert.match(unknown.content[0].text, /unknown agent: nope/);
  });
});

test("agent_registry validate reports per-agent fail-closed results", async () => {
  await withExtensionEnv(async () => {
    const harness = createPiHarness();
    await loadExtension(harness.pi);
    const tool = harness.tools.get("agent_registry");
    const result = await tool.execute("t4", { action: "validate" }, null, null, {
      cwd: process.cwd(),
    });
    assert.match(result.content[0].text, /2 agent manifest\(s\): 2 ok, 0 failed/);
    assert.equal(result.details.results.length, 2);
  });
});

test("dispatch_agent throws the Phase-0 gate and projects structured no-effect details", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "agent-ext-dispatch-"));
  await withExtensionEnv(async () => {
    const harness = createPiHarness();
    await loadExtension(harness.pi);
    const tool = harness.tools.get("dispatch_agent");
    let requestRead = false;
    const request = new Proxy(
      {},
      {
        get() {
          requestRead = true;
          throw new Error("Phase-0 tool must not read request properties");
        },
      },
    );
    await assert.rejects(
      tool.execute("t5", request, null, null, { cwd: sessionsDir }),
      /standing-agent dispatch is disabled in Fleet Phase 0/,
    );
    assert.equal(requestRead, false);
    assert.deepEqual(await readdir(sessionsDir), []);

    const toolResultHandler = harness.handlers.get("tool_result")?.at(-1);
    const patch = await toolResultHandler({
      toolName: "dispatch_agent",
      isError: true,
      content: [
        {
          type: "text",
          text: "standing-agent dispatch is disabled in Fleet Phase 0; AK task 5132 must land",
        },
      ],
    });
    assert.equal(patch.isError, true);
    assert.equal(patch.details.error, "fleet_phase0_dispatch_disabled");
    assert.equal(patch.details.effectDisposition, "confirmed_no_effects");
    assert.equal(patch.details.spawnAttempted, false);
    assert.equal(patch.details.capacityReserved, false);
    assert.equal(patch.details.worktreeCreated, false);
    assert.equal(patch.details.authorityGranted, false);
    assert.equal(patch.details.nextTaskId, 5132);
  });
  await rm(sessionsDir, { recursive: true, force: true });
});

test("agent_registry refresh reloads manifests after filesystem changes", async () => {
  const extraRoot = await mkdtemp(join(tmpdir(), "agent-ext-refresh-"));
  const { mkdir, writeFile, rm: rmPath } = await import("node:fs/promises");
  await mkdir(join(extraRoot, "docs"), { recursive: true });
  await writeFile(join(extraRoot, "docs", "p.md"), "persona", "utf8");
  await writeFile(
    join(extraRoot, "agent.json"),
    JSON.stringify({
      schema: "ai-society.agent/1",
      name: "agent-fixture-late",
      system_prompt_file: "docs/p.md",
      tools: ["read"],
    }),
    "utf8",
  );

  const previousRoots = process.env.PI_AGENT_REGISTRY_ROOTS;
  process.env.PI_AGENT_REGISTRY_ROOTS = [join(FIXTURES_ROOT, "agent-*"), extraRoot].join(":");
  try {
    const harness = createPiHarness();
    await loadExtension(harness.pi);
    const tool = harness.tools.get("agent_registry");
    const before = await tool.execute("t6", { action: "list" }, null, null, {
      cwd: process.cwd(),
    });
    assert.equal(before.details.agents.includes("agent-fixture-late"), true);

    await rmPath(join(extraRoot, "agent.json"), { force: true });
    const refreshed = await tool.execute("t7", { action: "refresh" }, null, null, {
      cwd: process.cwd(),
    });
    assert.equal(refreshed.details.agents.includes("agent-fixture-late"), false);

    await writeFile(
      join(extraRoot, "agent.json"),
      JSON.stringify({
        schema: "ai-society.agent/1",
        name: "agent-fixture-late",
        system_prompt_file: "docs/p.md",
        tools: ["read"],
      }),
      "utf8",
    );
    const again = await tool.execute("t8", { action: "refresh" }, null, null, {
      cwd: process.cwd(),
    });
    assert.equal(again.details.agents.includes("agent-fixture-late"), true);
  } finally {
    if (previousRoots === undefined) delete process.env.PI_AGENT_REGISTRY_ROOTS;
    else process.env.PI_AGENT_REGISTRY_ROOTS = previousRoots;
    await rm(extraRoot, { recursive: true, force: true });
  }
});
