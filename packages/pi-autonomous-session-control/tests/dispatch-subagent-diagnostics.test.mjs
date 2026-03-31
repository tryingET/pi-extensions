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
    assert.equal(result.details.failureKind, "transport_error");
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
    assert.equal(first.details.failureKind, "transport_error");
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
    assert.equal(second.details.failureKind, "transport_error");
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

test("spawnSubagentWithSpawn flushes a final unterminated message_end event", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-final-message-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 434343;

  const resultPromise = spawnSubagentWithSpawn(
    {
      name: "final-message",
      objective: "Review changes",
      tools: "read,bash",
      sessionFile: join(state.sessionsDir, "final-message.json"),
    },
    "test/model",
    { cwd: process.cwd() },
    state,
    () => child,
  );

  stdout.emit(
    "data",
    '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"final output without newline"}],"stopReason":"stop"}}',
  );
  child.emit("close", 0);

  const result = await resultPromise;
  assert.equal(result.status, "done");
  assert.equal(result.output, "final output without newline");
  assert.equal(result.assistantStopReason, "stop");
  assert.deepEqual(result.executionState?.protocol, {
    kind: "assistant_protocol",
    stopReason: "stop",
    errorMessage: undefined,
  });

  await rm(state.sessionsDir, { recursive: true, force: true });
});

test("spawnSubagentWithSpawn preserves assistant protocol failures", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-stop-reason-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 444444;

  const resultPromise = spawnSubagentWithSpawn(
    {
      name: "stop-reason-error",
      objective: "Review changes",
      tools: "read,bash",
      sessionFile: join(state.sessionsDir, "stop-reason-error.json"),
    },
    "test/model",
    { cwd: process.cwd() },
    state,
    () => child,
  );

  stdout.emit(
    "data",
    '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"partial"}}\n',
  );
  stdout.emit(
    "data",
    '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"boom"}}\n',
  );
  child.emit("close", 0);

  const result = await resultPromise;
  assert.equal(result.status, "error");
  assert.equal(result.exitCode, 1);
  assert.equal(result.assistantStopReason, "error");
  assert.equal(result.assistantErrorMessage, "boom");
  assert.deepEqual(result.executionState?.protocol, {
    kind: "assistant_protocol",
    stopReason: "error",
    errorMessage: "boom",
  });

  await rm(state.sessionsDir, { recursive: true, force: true });
});

test("spawnSubagentWithSpawn honors final-only semantic assistant failures", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-final-error-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 449449;

  const resultPromise = spawnSubagentWithSpawn(
    {
      name: "final-only-error",
      objective: "Review changes",
      tools: "read,bash",
      sessionFile: join(state.sessionsDir, "final-only-error.json"),
    },
    "test/model",
    { cwd: process.cwd() },
    state,
    () => child,
  );

  stdout.emit(
    "data",
    '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"boom"}}\n',
  );
  child.emit("close", 0);

  const result = await resultPromise;
  assert.equal(result.status, "error");
  assert.equal(result.exitCode, 1);
  assert.equal(result.output, "boom");
  assert.equal(result.assistantStopReason, "error");
  assert.equal(result.assistantErrorMessage, "boom");
  assert.deepEqual(result.executionState?.protocol, {
    kind: "assistant_protocol",
    stopReason: "error",
    errorMessage: "boom",
  });

  await rm(state.sessionsDir, { recursive: true, force: true });
});

test("spawnSubagentWithSpawn fails closed on malformed pi JSON output", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-parse-error-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 454545;

  const resultPromise = spawnSubagentWithSpawn(
    {
      name: "parse-error",
      objective: "Review changes",
      tools: "read,bash",
      sessionFile: join(state.sessionsDir, "parse-error.json"),
    },
    "test/model",
    { cwd: process.cwd() },
    state,
    () => child,
  );

  stdout.emit("data", "{not-json\n");
  child.emit("close", 0);

  const result = await resultPromise;
  assert.equal(result.status, "error");
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Failed to parse 1 pi JSON event line/);
  assert.deepEqual(result.executionState?.protocol, {
    kind: "assistant_protocol_parse_error",
    errorMessage:
      "Failed to parse 1 pi JSON event line(s).\nExpected property name or '}' in JSON at position 1 (line 1 column 2)",
  });

  await rm(state.sessionsDir, { recursive: true, force: true });
});

test("spawnSubagentWithSpawn bounds assistant output and marks truncation", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-output-truncation-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const previous = process.env.PI_SUBAGENT_OUTPUT_CHARS;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 459459;

  try {
    process.env.PI_SUBAGENT_OUTPUT_CHARS = "16";

    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "output-truncated",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "output-truncated.json"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );

    stdout.emit(
      "data",
      JSON.stringify({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "x".repeat(64) }],
          stopReason: "stop",
        },
      }),
    );
    child.emit("close", 0);

    const result = await resultPromise;
    assert.equal(result.status, "done");
    assert.equal(result.outputTruncated, true);
    assert.match(result.output, /assistant output truncated/);
    assert.ok(result.output.startsWith("x".repeat(16)));
    assert.match(result.stderr || "", /Assistant output truncated to 16 characters\./);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_OUTPUT_CHARS;
    } else {
      process.env.PI_SUBAGENT_OUTPUT_CHARS = previous;
    }
    await rm(state.sessionsDir, { recursive: true, force: true });
  }
});

test("spawnSubagentWithSpawn fails closed when a JSON event line exceeds the buffer limit", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-buffer-overflow-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const previous = process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 462462;

  try {
    process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES = "8";

    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "buffer-overflow",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "buffer-overflow.json"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );

    stdout.emit("data", "0123456789abcdefghijklmnopqrstuvwxyz");
    child.emit("close", 0);

    const result = await resultPromise;
    assert.equal(result.status, "error");
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /Failed to parse 1 pi JSON event line/);
    assert.match(result.stderr || "", /event buffer exceeded 8 bytes/i);
    assert.deepEqual(result.executionState?.protocol, {
      kind: "assistant_protocol_parse_error",
      errorMessage:
        "Failed to parse 1 pi JSON event line(s).\nPi JSON event buffer exceeded 8 bytes without a newline delimiter.",
    });
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES;
    } else {
      process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES = previous;
    }
    await rm(state.sessionsDir, { recursive: true, force: true });
  }
});

test("spawnSubagentWithSpawn respects abort signals and records aborted status", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-abort-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const killSignals = [];

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = (signalName) => {
    killSignals.push(signalName);
    setImmediate(() => child.emit("close", null));
    return true;
  };
  child.pid = 464646;

  const controller = new AbortController();
  const resultPromise = spawnSubagentWithSpawn(
    {
      name: "abort-me",
      objective: "Review changes",
      tools: "read,bash",
      sessionFile: join(state.sessionsDir, "abort-me.json"),
    },
    "test/model",
    { cwd: process.cwd() },
    state,
    () => child,
    controller.signal,
  );

  assert.equal(state.activeCount, 1);
  controller.abort();

  const result = await resultPromise;
  assert.equal(result.status, "aborted");
  assert.equal(result.aborted, true);
  assert.equal(result.exitCode, 130);
  assert.deepEqual(killSignals, ["SIGTERM"]);
  assert.equal(state.activeCount, 0);

  const finalStatus = JSON.parse(
    await readFile(getSessionStatusPath(state.sessionsDir, "abort-me"), "utf-8"),
  );
  assert.equal(finalStatus.status, "aborted");

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
