import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { createAscExecutionRuntime, createSubagentState } from "../execution.ts";
import { registerSubagentTool } from "../extensions/self/subagent.ts";

function defaultSpawner(def) {
  return Promise.resolve({
    output: `${def.name}: ok`,
    exitCode: 0,
    elapsed: 250,
    status: "done",
  });
}

function normalizeToolResult(result) {
  return {
    ok: result.details.status === "done",
    text: result.content[0]?.type === "text" ? result.content[0].text : "",
    details: result.details,
  };
}

function normalizeToolUpdate(update) {
  return {
    text: update.content[0]?.type === "text" ? update.content[0].text : "",
    details: update.details,
  };
}

function normalizeCapturedDef(def) {
  return {
    ...def,
    sessionFile: basename(def.sessionFile),
  };
}

async function withEnv(overrides, fn) {
  const previous = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function createParityHarness({ stateOptions, spawner, seed } = {}) {
  const runtimeSessionsDir = await mkdtemp(join(tmpdir(), "asc-runtime-parity-"));
  const toolSessionsDir = await mkdtemp(join(tmpdir(), "asc-tool-parity-"));

  try {
    if (seed) {
      await seed(runtimeSessionsDir);
      await seed(toolSessionsDir);
    }

    const runtimeState = createSubagentState(runtimeSessionsDir, stateOptions);
    const toolState = createSubagentState(toolSessionsDir, stateOptions);
    const runtimeDefs = [];
    const toolDefs = [];
    const runtimeUpdates = [];
    const toolUpdates = [];
    const executeSpawner = spawner ?? defaultSpawner;

    const runtime = createAscExecutionRuntime({
      sessionsDir: runtimeSessionsDir,
      state: runtimeState,
      modelProvider: () => "test/model",
      spawner: async (...args) => {
        runtimeDefs.push(args[0]);
        return executeSpawner(...args);
      },
    });

    let tool;
    const pi = {
      registerTool(definition) {
        tool = definition;
      },
    };

    registerSubagentTool(
      pi,
      toolState,
      () => "test/model",
      async (...args) => {
        toolDefs.push(args[0]);
        return executeSpawner(...args);
      },
    );

    return {
      runtime,
      runtimeState,
      tool,
      toolState,
      runtimeDefs,
      toolDefs,
      runtimeUpdates,
      toolUpdates,
      async cleanup() {
        await rm(runtimeSessionsDir, { recursive: true, force: true });
        await rm(toolSessionsDir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(runtimeSessionsDir, { recursive: true, force: true });
    await rm(toolSessionsDir, { recursive: true, force: true });
    throw error;
  }
}

async function executeRuntime(harness, request) {
  return harness.runtime.execute(request, { cwd: process.cwd() }, (update) => {
    harness.runtimeUpdates.push(update);
  });
}

async function executeTool(harness, request, toolCallId = "tc-public-parity") {
  const result = await harness.tool.execute(
    toolCallId,
    request,
    null,
    (update) => {
      harness.toolUpdates.push(normalizeToolUpdate(update));
    },
    { cwd: process.cwd() },
  );

  return normalizeToolResult(result);
}

test("public runtime parity: prompt envelope, updates, and result shaping match dispatch_subagent", async () => {
  const harness = await createParityHarness({
    spawner: async () => ({
      output: "runtime ok",
      exitCode: 0,
      elapsed: 1200,
      status: "done",
    }),
  });

  try {
    const request = {
      profile: "custom",
      objective: "Review the shared execution boundary",
      systemPrompt: "Base prompt",
      timeout: 60,
      prompt_name: "nexus",
      prompt_content: "Prefer the smallest stable execution seam.",
      prompt_tags: ["phase:execution", "scope:parity"],
    };

    const runtimeResult = await executeRuntime(harness, request);
    const toolResult = await executeTool(harness, request);

    assert.deepEqual(toolResult, runtimeResult);
    assert.deepEqual(harness.toolUpdates, harness.runtimeUpdates);
    assert.equal(harness.runtimeDefs.length, 1);
    assert.equal(harness.toolDefs.length, 1);
    assert.deepEqual(
      normalizeCapturedDef(harness.toolDefs[0]),
      normalizeCapturedDef(harness.runtimeDefs[0]),
    );
    assert.equal(harness.runtimeDefs[0].timeout, 60000);
    assert.match(runtimeResult.text, /^✓ \[custom\] done in 1s/);
  } finally {
    await harness.cleanup();
  }
});

test("public runtime parity: invariant failures and rate-limit failures match dispatch_subagent", async () => {
  const invariantHarness = await createParityHarness();

  try {
    const invalidRequest = {
      profile: "reviewer",
      objective: "   ",
    };

    const runtimeResult = await executeRuntime(invariantHarness, invalidRequest);
    const toolResult = await executeTool(invariantHarness, invalidRequest, "tc-parity-invalid");

    assert.deepEqual(toolResult, runtimeResult);
    assert.deepEqual(invariantHarness.runtimeDefs, []);
    assert.deepEqual(invariantHarness.toolDefs, []);
    assert.equal(runtimeResult.ok, false);
    assert.equal(runtimeResult.details.reason, "invariant_failed");
  } finally {
    await invariantHarness.cleanup();
  }

  const rateLimitHarness = await createParityHarness({ stateOptions: { maxConcurrent: 1 } });

  try {
    rateLimitHarness.runtimeState.activeCount = 1;
    rateLimitHarness.toolState.activeCount = 1;

    const limitedRequest = {
      profile: "reviewer",
      objective: "Review risk before cutover",
    };

    const runtimeResult = await executeRuntime(rateLimitHarness, limitedRequest);
    const toolResult = await executeTool(rateLimitHarness, limitedRequest, "tc-parity-rate-limit");

    assert.deepEqual(toolResult, runtimeResult);
    assert.deepEqual(rateLimitHarness.runtimeDefs, []);
    assert.deepEqual(rateLimitHarness.toolDefs, []);
    assert.equal(runtimeResult.ok, false);
    assert.equal(runtimeResult.details.reason, "rate_limited");
    assert.equal(runtimeResult.details.maxConcurrent, 1);
  } finally {
    await rateLimitHarness.cleanup();
  }
});

test("public runtime parity: live lock collisions pick the same suffixed session name as dispatch_subagent", async () => {
  await withEnv({ PI_SUBAGENT_FILE_LOCK_SESSION_NAMES: undefined }, async () => {
    const harness = await createParityHarness({
      seed: async (sessionsDir) => {
        await writeFile(
          join(sessionsDir, "same.lock"),
          JSON.stringify({
            pid: process.pid,
            ppid: process.ppid,
            sessionName: "same",
            createdAt: new Date().toISOString(),
          }),
        );
      },
    });

    try {
      const request = {
        profile: "reviewer",
        objective: "Review the lock collision",
        name: "same",
      };

      const runtimeResult = await executeRuntime(harness, request);
      const toolResult = await executeTool(harness, request, "tc-parity-lock");

      assert.deepEqual(toolResult, runtimeResult);
      assert.equal(harness.runtimeDefs.length, 1);
      assert.equal(harness.toolDefs.length, 1);
      assert.equal(basename(harness.runtimeDefs[0].sessionFile), "same-1.json");
      assert.equal(basename(harness.toolDefs[0].sessionFile), "same-1.json");
    } finally {
      await harness.cleanup();
    }
  });
});

test("public runtime parity: concurrent same-name requests reserve the same unique session set", async () => {
  const harness = await createParityHarness({
    spawner: async (def) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        output: def.objective,
        exitCode: 0,
        elapsed: 25,
        status: "done",
      };
    },
  });

  try {
    const requests = [
      { profile: "reviewer", objective: "Review A", name: "same" },
      { profile: "reviewer", objective: "Review B", name: "same" },
    ];

    await Promise.all(requests.map((request) => executeRuntime(harness, request)));
    await Promise.all(
      requests.map((request, index) =>
        executeTool(harness, request, `tc-parity-concurrent-${index}`),
      ),
    );

    const runtimeSessionFiles = harness.runtimeDefs.map((def) => basename(def.sessionFile)).sort();
    const toolSessionFiles = harness.toolDefs.map((def) => basename(def.sessionFile)).sort();

    assert.deepEqual(toolSessionFiles, runtimeSessionFiles);
    assert.deepEqual(runtimeSessionFiles, ["same-1.json", "same.json"]);
  } finally {
    await harness.cleanup();
  }
});
