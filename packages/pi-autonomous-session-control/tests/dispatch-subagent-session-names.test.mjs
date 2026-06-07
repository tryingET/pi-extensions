import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState, registerSubagentTool } from "../extensions/self/subagent.ts";

async function setup(spawnerOverride, stateOptions) {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-session-name-test-"));
  const state = createSubagentState(sessionsDir, stateOptions);

  let registeredTool;
  let capturedDef;

  const pi = {
    registerTool(definition) {
      registeredTool = definition;
    },
  };

  const spawner =
    spawnerOverride ||
    (async (def) => {
      capturedDef = def;
      return {
        output: "ok",
        exitCode: 0,
        elapsed: 250,
        status: "done",
      };
    });

  registerSubagentTool(
    pi,
    state,
    () => "test/model",
    async (...args) => {
      const def = args[0];
      capturedDef = def;
      return spawner(...args);
    },
  );

  return {
    state,
    tool: registeredTool,
    getCapturedDef: () => capturedDef,
    cleanup: async () => {
      await rm(sessionsDir, { recursive: true, force: true });
    },
  };
}

test("dispatch_subagent generates unique session names for colliding inputs", async () => {
  const harness = await setup();

  try {
    await harness.tool.execute(
      "tc-11a",
      {
        profile: "reviewer",
        objective: "Review changes",
        name: "test/name",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def1 = harness.getCapturedDef();
    await writeFile(join(harness.state.sessionsDir, "test_name.json"), "{}");

    await harness.tool.execute(
      "tc-11b",
      {
        profile: "reviewer",
        objective: "Review changes",
        name: "test/name",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    const def2 = harness.getCapturedDef();

    assert.notEqual(def1.sessionFile, def2.sessionFile);
    assert.match(def1.sessionFile, /test_name\.jsonl$/);
    assert.match(def2.sessionFile, /test_name-1\.jsonl$/);
  } finally {
    await harness.cleanup();
  }
});

async function runConcurrentSameNameDispatch(reservationEnvValue) {
  const capturedDefs = [];
  const harness = await setup(async (def) => {
    capturedDefs.push(def);
    await new Promise((resolve) => setTimeout(resolve, 25));
    return {
      output: "ok",
      exitCode: 0,
      elapsed: 25,
      status: "done",
    };
  });

  const previous = process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES;

  if (reservationEnvValue === undefined) {
    delete process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES;
  } else {
    process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES = reservationEnvValue;
  }

  try {
    await Promise.all([
      harness.tool.execute(
        "tc-11c",
        { profile: "reviewer", objective: "Review A", name: "same" },
        null,
        null,
        { cwd: process.cwd() },
      ),
      harness.tool.execute(
        "tc-11d",
        { profile: "reviewer", objective: "Review B", name: "same" },
        null,
        null,
        { cwd: process.cwd() },
      ),
    ]);

    return capturedDefs;
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES;
    } else {
      process.env.PI_SUBAGENT_RESERVE_SESSION_NAMES = previous;
    }
    await harness.cleanup();
  }
}

test("dispatch_subagent generates unique session names for concurrent dispatches", async () => {
  const capturedDefs = await runConcurrentSameNameDispatch(undefined);
  assert.equal(capturedDefs.length, 2);
  assert.notEqual(capturedDefs[0].sessionFile, capturedDefs[1].sessionFile);
});

test("dispatch_subagent can disable session-name reservation protections via env flag", async () => {
  const capturedDefs = await runConcurrentSameNameDispatch("false");
  assert.equal(capturedDefs.length, 2);
  assert.equal(capturedDefs[0].sessionFile, capturedDefs[1].sessionFile);
});

test("dispatch_subagent rate limits when max concurrent reached", async () => {
  const harness = await setup(undefined, { maxConcurrent: 2 });

  try {
    harness.state.activeCount = 2;

    const result = await harness.tool.execute(
      "tc-12",
      { profile: "reviewer", objective: "Task" },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "rate_limited");
    assert.equal(result.details.maxConcurrent, 2);
    assert.match(result.content[0].text, /Maximum concurrent/);
  } finally {
    await harness.cleanup();
  }
});
