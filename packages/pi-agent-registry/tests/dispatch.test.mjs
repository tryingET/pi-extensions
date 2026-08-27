// ---
// summary: verifies dispatch_agent feeds ASC's custom profile + skill-profile path with the resolved launch.
// read_when:
//   - changing the dispatch adapter, model inheritance, or ASC runtime wiring.
// ---

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState } from "@tryinget/pi-autonomous-session-control/execution";
import { AgentDispatchError, dispatchAgent } from "../src/dispatch.ts";
import { loadEcProfiles } from "../src/ec-profiles.ts";
import { createAgentRegistry } from "../src/registry.ts";

const REAL_EC_PROFILES = join(
  process.env.HOME,
  "ai-society/core/engineering-core/skills/profiles.json",
);
const FIXTURES_ROOT = new URL("./fixtures/", import.meta.url).pathname;
const STEWARD_FIXTURE = join(FIXTURES_ROOT, "agent-fixture-steward");

test("dispatchAgent composes an ASC custom-profile launch from the manifest", async (t) => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "agent-dispatch-test-"));
  t.after(async () => {
    await rm(sessionsDir, { recursive: true, force: true });
  });
  const state = createSubagentState(sessionsDir);
  const ec = await loadEcProfiles(REAL_EC_PROFILES);
  const registry = await createAgentRegistry({ roots: [STEWARD_FIXTURE], ec });

  const capturedDefs = [];
  let skillDirPresentDuringSpawn = false;
  const outcome = await dispatchAgent(
    {
      sessionsDir,
      registry,
      state,
      spawner: async (def) => {
        capturedDefs.push(def);
        // The materialized skill dir must exist while the child runs;
        // ASC removes it in its own finally after settlement.
        skillDirPresentDuringSpawn = existsSync(
          join(def.skillSources[0], "ec-discipline-testing", "SKILL.md"),
        );
        return { output: "ok", exitCode: 0, elapsed: 5, status: "done" };
      },
    },
    {
      agent: "agent-fixture-steward",
      objective: "steward the fixture territory",
      deliverable: "a verified report",
      constraints: ["stay read-only"],
      mutationPolicy: "read_only",
      evidenceRequired: ["file paths inspected"],
    },
    { cwd: sessionsDir, model: { provider: "test", id: "model" } },
  );

  assert.equal(outcome.result.ok, true);
  assert.equal(outcome.result.details.status, "done");
  assert.equal(capturedDefs.length, 1);
  const def = capturedDefs[0];
  assert.equal(def.profile, "custom");
  assert.equal(def.tools, "read,bash,edit");
  assert.equal(def.thinking, "high");
  assert.deepEqual(def.extensionSources, [join(STEWARD_FIXTURE, "extensions", "fixture.ts")]);
  assert.match(def.userPrompt, /# Fixture Steward persona/);
  assert.match(def.userPrompt, /## Operating territory \(advisory scope\)/);
  assert.equal(def.noSkills, true);
  assert.equal(def.skillSources.length, 1);
  assert.equal(skillDirPresentDuringSpawn, true);
  assert.equal(outcome.result.details.skillProfile, "agent-fixture-steward");
  assert.deepEqual(outcome.result.details.loadedSkills, outcome.launch.loadedSkills);
  // task contract carried the advisory scope
  assert.deepEqual(def.taskContract.allowedPaths, ["/tmp/fixture-owned/*"]);
  assert.deepEqual(def.taskContract.forbiddenPaths, [".git", "node_modules"]);
  assert.equal(def.taskContract.mutationPolicy, "read_only");
  // manifest model=null inherited the parent session model
  assert.equal(outcome.result.details.effectiveModel, "test/model");
  // materialized skills cleaned up after the run
  assert.equal(existsSync(def.skillSources[0]), false);
});

test("dispatchAgent rejects unknown agents before any spawn", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "agent-dispatch-unknown-"));
  try {
    const state = createSubagentState(sessionsDir);
    const ec = await loadEcProfiles(REAL_EC_PROFILES);
    const registry = await createAgentRegistry({ roots: [STEWARD_FIXTURE], ec });
    let spawned = 0;
    await assert.rejects(
      dispatchAgent(
        {
          sessionsDir,
          registry,
          state,
          spawner: async () => {
            spawned += 1;
            return { output: "x", exitCode: 0, elapsed: 1, status: "done" };
          },
        },
        { agent: "no-such-agent", objective: "x" },
        { cwd: sessionsDir },
      ),
      (error) => {
        assert.ok(error instanceof AgentDispatchError);
        assert.equal(error.reason, "unknown_agent");
        return true;
      },
    );
    assert.equal(spawned, 0);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("dispatchAgent fails closed when resolution fails and never spawns", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "agent-dispatch-resolution-"));
  try {
    const state = createSubagentState(sessionsDir);
    // skills.extra that exists in no root -> resolve() must fail
    const brokenFixture = await mkdtemp(join(tmpdir(), "agent-dispatch-broken-"));
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(brokenFixture, "docs"), { recursive: true });
    await writeFile(join(brokenFixture, "docs", "p.md"), "persona", "utf8");
    await writeFile(
      join(brokenFixture, "agent.json"),
      JSON.stringify({
        schema: "ai-society.agent/1",
        name: "agent-fixture-broken",
        system_prompt_file: "docs/p.md",
        skills: { extra: ["missing-skill"] },
        tools: ["read"],
      }),
      "utf8",
    );
    const ec = await loadEcProfiles(REAL_EC_PROFILES);
    const registry = await createAgentRegistry({ roots: [brokenFixture], ec });
    let spawned = 0;
    await assert.rejects(
      dispatchAgent(
        {
          sessionsDir,
          registry,
          state,
          spawner: async () => {
            spawned += 1;
            return { output: "x", exitCode: 0, elapsed: 1, status: "done" };
          },
        },
        { agent: "agent-fixture-broken", objective: "x" },
        { cwd: sessionsDir },
      ),
      (error) => {
        assert.ok(error instanceof AgentDispatchError);
        assert.equal(error.reason, "resolution_failed");
        assert.match(error.message, /missing-skill/);
        return true;
      },
    );
    assert.equal(spawned, 0);
    await rm(brokenFixture, { recursive: true, force: true });
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("read-only agent dispatches with default tools and no skill profile", async (t) => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "agent-dispatch-readonly-"));
  t.after(async () => {
    await rm(sessionsDir, { recursive: true, force: true });
  });
  const state = createSubagentState(sessionsDir);
  const ec = await loadEcProfiles(REAL_EC_PROFILES);
  const registry = await createAgentRegistry({
    roots: [join(FIXTURES_ROOT, "agent-fixture-watcher")],
    ec,
  });

  const capturedDefs = [];
  const outcome = await dispatchAgent(
    {
      sessionsDir,
      registry,
      state,
      spawner: async (def) => {
        capturedDefs.push(def);
        return { output: "ok", exitCode: 0, elapsed: 5, status: "done" };
      },
    },
    { agent: "agent-fixture-watcher", objective: "watch quietly" },
    { cwd: sessionsDir, model: { provider: "test", id: "model" } },
  );

  assert.equal(outcome.result.ok, true);
  const def = capturedDefs[0];
  assert.equal(def.tools, "read");
  assert.equal(def.thinking, "medium");
  assert.deepEqual(def.skillSources, []);
  assert.equal(outcome.result.details.skillProfile, undefined);
  assert.equal(existsSync(sessionsDir), true);
});

test("pre-dispatch ASC rejection cleans materialized skills before returning", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "agent-dispatch-preflight-cleanup-"));
  try {
    const state = createSubagentState(sessionsDir, { maxConcurrent: 0 });
    const ec = await loadEcProfiles(REAL_EC_PROFILES);
    const registry = await createAgentRegistry({ roots: [STEWARD_FIXTURE], ec });
    let spawned = 0;
    const outcome = await dispatchAgent(
      {
        sessionsDir,
        registry,
        state,
        spawner: async () => {
          spawned += 1;
          return { output: "unexpected", exitCode: 0, elapsed: 1, status: "done" };
        },
      },
      { agent: "agent-fixture-steward", objective: "must fail before spawn" },
      { cwd: sessionsDir, model: { provider: "test", id: "model" } },
    );

    assert.equal(outcome.result.ok, false);
    assert.equal(outcome.result.details.failureKind, "rate_limited");
    assert.equal(spawned, 0);
    assert.equal(existsSync(outcome.launch.skillDirs[0]), false);
    // cleanup remains idempotent for callers even though dispatch already owned it.
    await outcome.launch.cleanup();
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
