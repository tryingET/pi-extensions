import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState, spawnSubagentWithSpawn } from "../extensions/self/subagent.ts";
import { translatePiJsonEventLineToSubagentProtocol } from "../extensions/self/subagent-protocol.ts";

test("translatePiJsonEventLineToSubagentProtocol drops oversized aggregate pi events instead of forwarding them", () => {
  const rawLine = JSON.stringify({
    type: "agent_end",
    messages: [
      {
        role: "assistant",
        content: [{ type: "text", text: "x".repeat(400_000) }],
      },
    ],
  });

  const translated = translatePiJsonEventLineToSubagentProtocol(rawLine, {
    maxFinalTextChars: 64_000,
  });

  assert.equal(translated, undefined);
});

test("translatePiJsonEventLineToSubagentProtocol emits bounded assistant_message_end events", () => {
  const rawLine = JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "x".repeat(32) }],
      stopReason: "stop",
    },
  });

  const translated = translatePiJsonEventLineToSubagentProtocol(rawLine, {
    maxFinalTextChars: 16,
  });

  assert.deepEqual(translated, {
    type: "assistant_message_end",
    stopReason: "stop",
    errorMessage: undefined,
    text: "x".repeat(16),
    textTruncated: true,
  });
});

test("translatePiJsonEventLineToSubagentProtocol contextualizes malformed raw pi JSON", () => {
  const translated = translatePiJsonEventLineToSubagentProtocol("{not-json", {
    maxFinalTextChars: 16,
  });

  assert.deepEqual(translated, {
    type: "protocol_error",
    errorMessage:
      "Failed to parse raw pi JSON event line.\nExpected property name or '}' in JSON at position 1 (line 1 column 2)",
  });
});

test("spawnSubagentWithSpawn consumes the assistant-only filtered protocol", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-filtered-protocol-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 565656;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "filtered-protocol",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "filtered-protocol.json"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );

    stdout.emit("data", '{"type":"transport_ready","rawChildPid":787878}\n');
    stdout.emit("data", '{"type":"assistant_text_delta","delta":"hello"}\n');
    stdout.emit("data", '{"type":"assistant_message_end","stopReason":"stop"}\n');
    child.emit("close", 0);

    const result = await resultPromise;
    assert.equal(result.status, "done");
    assert.equal(result.exitCode, 0);
    assert.equal(result.output, "hello");
    assert.equal(result.assistantStopReason, "stop");
    assert.deepEqual(result.executionState, {
      transport: {
        kind: "transport",
        exitCode: 0,
        aborted: false,
        timedOut: false,
        rawChildPid: 787878,
      },
      protocol: {
        kind: "assistant_protocol",
        stopReason: "stop",
        errorMessage: undefined,
      },
    });
  } finally {
    await rm(state.sessionsDir, { recursive: true, force: true });
  }
});

test("spawnSubagentWithSpawn forwards explicit child extensions to the helper process", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-extension-args-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 575757;

  let capturedArgs;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "extension-args",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "extension-args.json"),
        extensionSources: ["/tmp/pi-multi-pass.ts", "/tmp/vault.ts"],
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      (_command, args) => {
        capturedArgs = args;
        return child;
      },
    );

    stdout.emit("data", '{"type":"transport_ready"}\n');
    stdout.emit("data", '{"type":"assistant_message_end","stopReason":"stop","text":"ok"}\n');
    child.emit("close", 0);

    const result = await resultPromise;
    assert.equal(result.status, "done");
    assert.deepEqual(capturedArgs.filter((arg) => arg === "--extension").length, 2);
    assert.ok(capturedArgs.includes("/tmp/pi-multi-pass.ts"));
    assert.ok(capturedArgs.includes("/tmp/vault.ts"));
  } finally {
    await rm(state.sessionsDir, { recursive: true, force: true });
  }
});

test("spawnSubagentWithSpawn defers timeout until the helper signals transport readiness", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-ready-handshake-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 575757;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "ready-handshake",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "ready-handshake.json"),
        timeout: 20,
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );

    await new Promise((resolve) => setTimeout(resolve, 40));
    stdout.emit("data", '{"type":"transport_ready","rawChildPid":797979}\n');
    stdout.emit("data", '{"type":"assistant_message_end","text":"ready ok","stopReason":"stop"}\n');
    child.emit("close", 0);

    const result = await resultPromise;
    assert.equal(result.status, "done");
    assert.equal(result.exitCode, 0);
    assert.equal(result.output, "ready ok");
    assert.equal(result.executionState?.transport.rawChildPid, 797979);
  } finally {
    await rm(state.sessionsDir, { recursive: true, force: true });
  }
});
