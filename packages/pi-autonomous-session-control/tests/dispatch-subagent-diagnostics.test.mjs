import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createSubagentState,
  registerSubagentTool,
  spawnSubagentWithSpawn,
} from "../extensions/self/subagent.ts";
import { getSessionStatusPath } from "../extensions/self/subagent-session.ts";

async function setup(spawnerOverride, stateOptions) {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-diagnostics-test-"));
  const state = createSubagentState(sessionsDir, stateOptions);

  let tool;
  const pi = {
    registerTool(definition) {
      tool = definition;
    },
  };

  registerSubagentTool(pi, state, () => "test/model", spawnerOverride);

  return {
    tool,
    state,
    cleanup: async () => {
      await rm(sessionsDir, { recursive: true, force: true });
    },
  };
}

test("dispatch_subagent surfaces diagnostics when spawner errors with empty output", async () => {
  const harness = await setup(async () => ({
    output: "",
    exitCode: 17,
    elapsed: 100,
    status: "error",
  }));

  try {
    const result = await harness.tool.execute(
      "tc-d1",
      {
        profile: "reviewer",
        objective: "Review changes",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "error");
    assert.match(result.content[0].text, /exited with code 17 without output/i);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent does not leak activeCount when spawn arguments throw synchronously", async () => {
  const harness = await setup(undefined, { maxConcurrent: 1 });

  try {
    const first = await harness.tool.execute(
      "tc-d2",
      {
        profile: "reviewer",
        objective: "bad\u0000objective",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(first.details.status, "error");
    assert.equal(harness.state.activeCount, 0);

    const second = await harness.tool.execute(
      "tc-d3",
      {
        profile: "reviewer",
        objective: "bad\u0000objective-again",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(second.details.status, "error");
    assert.notEqual(second.details.reason, "rate_limited");
    assert.equal(harness.state.activeCount, 0);
  } finally {
    await harness.cleanup();
  }
});

test("spawnSubagentWithSpawn finalizes on exit even when close never arrives", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-exit-only-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 424242;

  const resultPromise = spawnSubagentWithSpawn(
    {
      name: "exit-only",
      objective: "Review changes",
      tools: "read,bash",
      sessionFile: join(state.sessionsDir, "exit-only.json"),
    },
    "test/model",
    { cwd: process.cwd() },
    state,
    () => child,
  );

  assert.equal(state.activeCount, 1);
  const runningStatus = JSON.parse(
    await readFile(getSessionStatusPath(state.sessionsDir, "exit-only"), "utf-8"),
  );
  assert.equal(runningStatus.status, "running");
  assert.equal(runningStatus.pid, 424242);

  stdout.emit(
    "data",
    '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"hello"}}\n',
  );
  child.emit("exit", 0);

  const result = await resultPromise;
  assert.equal(result.status, "done");
  assert.equal(result.output, "hello");
  assert.equal(state.activeCount, 0);
  assert.equal(state.completedCount, 1);

  const finalStatus = JSON.parse(
    await readFile(getSessionStatusPath(state.sessionsDir, "exit-only"), "utf-8"),
  );
  assert.equal(finalStatus.status, "done");
  assert.equal(finalStatus.exitCode, 0);

  await rm(state.sessionsDir, { recursive: true, force: true });
});

test("createSubagentState marks dead running status as abandoned", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "subagent-abandoned-status-"));

  try {
    await writeFile(
      getSessionStatusPath(sessionsDir, "orphan"),
      JSON.stringify({
        sessionName: "orphan",
        status: "running",
        pid: 99999999,
        ppid: 99999998,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        objective: "Review changes",
      }),
    );

    createSubagentState(sessionsDir);

    const reconciled = JSON.parse(
      await readFile(getSessionStatusPath(sessionsDir, "orphan"), "utf-8"),
    );
    assert.equal(reconciled.status, "abandoned");
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
