// ---
// summary: verifies dispatch diagnostics, protocol settlement, output bounds, abort handling, and abandoned-status reconciliation.
// read_when:
//   - changing subagent transport parsing, terminal-state classification, or diagnostic persistence.
// ---

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
import {
  getSessionStatusPath,
  parseSubagentSessionStatusPayload,
} from "../extensions/self/subagent-session.ts";

const MODERN_HANDSHAKE = `${JSON.stringify({ type: "raw_child_spawn_intent" })}\n${JSON.stringify({
  type: "transport_ready",
  settlementMode: "agent_settled",
  piVersion: "0.80.6",
})}\n`;

// Node 22 cancels pending promise tests when injected EventEmitter children leave
// no referenced handles. Real child processes provide that handle themselves.
const injectedChildKeepAlive = setInterval(() => {}, 1_000);
test.after(() => clearInterval(injectedChildKeepAlive));

async function emitChildEvent(child, event, ...args) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.listenerCount(event) > 0) {
      child.emit(event, ...args);
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`child listener was not attached for ${event}`);
}

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
    const error = await harness.tool
      .execute(
        "tc-d1",
        {
          profile: "reviewer",
          objective: "Review changes",
        },
        null,
        null,
        { cwd: process.cwd() },
      )
      .then(
        () => assert.fail("expected dispatch_subagent to throw a tool error"),
        (caught) => caught,
      );

    assert.equal(error.result.details.status, "error");
    assert.equal(error.result.details.failureKind, "transport_error");
    assert.match(error.result.text, /exited with code 17 without output/i);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent distinguishes a nonzero transport exit before settlement", async () => {
  const harness = await setup(async () => ({
    output:
      "partial child work\n\nSubagent transport stderr:\nfatal: child transport broke\nExpected finality for settlementMode=agent_settled",
    stderr:
      "Subagent transport stderr:\nfatal: child transport broke\nExpected finality for settlementMode=agent_settled",
    exitCode: 1,
    elapsed: 100,
    status: "error",
    executionState: {
      transport: {
        kind: "transport",
        exitCode: 1,
        aborted: false,
        timedOut: false,
      },
      protocol: {
        kind: "assistant_protocol_incomplete",
        errorMessage: "Expected finality for settlementMode=agent_settled",
        transportExitedBeforeSettlement: true,
      },
    },
  }));

  try {
    const error = await harness.tool
      .execute(
        "tc-d1-presettlement",
        {
          profile: "reviewer",
          objective: "Review changes",
        },
        null,
        null,
        { cwd: process.cwd() },
      )
      .then(
        () => assert.fail("expected dispatch_subagent to throw a tool error"),
        (caught) => caught,
      );

    assert.equal(error.result.details.status, "error");
    assert.equal(error.result.details.failureKind, "transport_exited_before_settlement");
    assert.match(error.message, /transport_exited_before_settlement/);
    assert.match(error.result.text, /fatal: child transport broke/);
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent keeps post-outcome missing settlement as protocol incomplete", async () => {
  const harness = await setup(async () => ({
    output: "terminal output without settlement",
    exitCode: 1,
    elapsed: 100,
    status: "error",
    executionState: {
      transport: {
        kind: "transport",
        exitCode: 1,
        aborted: false,
        timedOut: false,
      },
      protocol: {
        kind: "assistant_protocol_incomplete",
        errorMessage: "terminal outcome was observed but settlement was missing",
      },
    },
  }));

  try {
    const error = await harness.tool
      .execute(
        "tc-d1-post-outcome",
        {
          profile: "reviewer",
          objective: "Review changes",
        },
        null,
        null,
        { cwd: process.cwd() },
      )
      .then(
        () => assert.fail("expected dispatch_subagent to throw a tool error"),
        (caught) => caught,
      );

    assert.equal(error.result.details.failureKind, "assistant_protocol_incomplete");
  } finally {
    await harness.cleanup();
  }
});

test("dispatch_subagent does not leak activeCount when spawn arguments throw synchronously", async () => {
  const harness = await setup(undefined, { maxConcurrent: 1 });

  try {
    const first = await harness.tool
      .execute(
        "tc-d2",
        {
          profile: "reviewer",
          objective: "Review changes",
          tools: "read\u0000bash",
        },
        null,
        null,
        { cwd: process.cwd() },
      )
      .then(
        () => assert.fail("expected dispatch_subagent to throw a tool error"),
        (caught) => caught.result,
      );

    assert.equal(first.details.status, "error");
    assert.equal(first.details.failureKind, "transport_error");
    assert.equal(harness.state.activeCount, 0);

    const second = await harness.tool
      .execute(
        "tc-d3",
        {
          profile: "reviewer",
          objective: "Review changes again",
          tools: "read\u0000bash",
        },
        null,
        null,
        { cwd: process.cwd() },
      )
      .then(
        () => assert.fail("expected dispatch_subagent to throw a tool error"),
        (caught) => caught.result,
      );

    assert.equal(second.details.status, "error");
    assert.equal(second.details.failureKind, "transport_error");
    assert.notEqual(second.details.reason, "rate_limited");
    assert.equal(harness.state.activeCount, 0);
  } finally {
    await harness.cleanup();
  }
});

test("spawnSubagentWithSpawn fails closed on exit without a terminal assistant event", async () => {
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
      parentSessionKey: "live-session-42",
      parentRepoRoot: process.cwd(),
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
  assert.equal(runningStatus.parentSessionKey, "live-session-42");
  assert.equal(runningStatus.parentRepoRoot, process.cwd());

  stdout.emit("data", `${MODERN_HANDSHAKE}{"type":"assistant_text_delta","delta":"hello"}\n`);
  stderr.emit(
    "data",
    [
      "fatal: child transport broke token=sk-012345678901234567890123",
      "Authorization: Bearer bearer01234567890123456789",
      '{"token":"json01234567890123456789"}',
      '{"access_token":"access01234567890123456789"}',
      '{"client_secret":"client01234567890123456789"}',
      "raw sk-proj-012345678901234567890123",
      "raw eyJabcde.abcdefgh.ijklmnop",
      '{"refresh_token":"unterminated01234567890123456789',
    ].join("\n"),
  );
  await emitChildEvent(child, "exit", 1);

  const result = await resultPromise;
  assert.equal(result.status, "error");
  assert.match(result.output, /hello/);
  assert.match(result.output, /Subagent transport stderr:/);
  assert.match(result.output, /fatal: child transport broke/);
  assert.match(result.output, /token=\[REDACTED\]/);
  assert.doesNotMatch(result.output, /sk-012345678901234567890123/);
  assert.match(result.output, /Authorization: \[REDACTED\]/);
  assert.match(result.output, /"token":"\[REDACTED\]"/);
  assert.match(result.output, /"access_token":"\[REDACTED\]"/);
  assert.match(result.output, /"client_secret":"\[REDACTED\]"/);
  assert.match(result.output, /"refresh_token":"\[REDACTED\]"/);
  assert.match(result.output, /\[REDACTED API TOKEN\]/);
  assert.match(result.output, /\[REDACTED JWT\]/);
  assert.doesNotMatch(result.output, /bearer01234567890123456789/);
  assert.doesNotMatch(result.output, /json01234567890123456789/);
  assert.doesNotMatch(result.output, /access01234567890123456789/);
  assert.doesNotMatch(result.output, /client01234567890123456789/);
  assert.doesNotMatch(result.output, /sk-proj-012345678901234567890123/);
  assert.doesNotMatch(result.output, /eyJabcde\.abcdefgh\.ijklmnop/);
  assert.doesNotMatch(result.output, /unterminated01234567890123456789/);
  assert.match(result.output, /Expected finality for settlementMode=agent_settled/);
  assert.match(result.output, /outcomes=0/);
  assert.match(result.output, /transportExit=1\./);
  assert.match(result.stderr, /fatal: child transport broke/);
  assert.equal(result.executionState?.transport.exitCode, 1);
  assert.equal(
    result.executionState?.protocol?.kind === "assistant_protocol_incomplete"
      ? result.executionState.protocol.transportExitedBeforeSettlement
      : undefined,
    true,
  );
  assert.equal(state.activeCount, 0);
  assert.equal(state.completedCount, 1);

  const finalStatus = JSON.parse(
    await readFile(getSessionStatusPath(state.sessionsDir, "exit-only"), "utf-8"),
  );
  assert.equal(finalStatus.status, "error");
  assert.equal(finalStatus.exitCode, 1);
  assert.equal(finalStatus.failureKind, "transport_exited_before_settlement");
  assert.equal(finalStatus.exitSignal, undefined);
  assert.equal(finalStatus.parentSessionKey, "live-session-42");
  assert.equal(finalStatus.parentRepoRoot, process.cwd());
  assert.match(finalStatus.resultPreview, /hello/);
  assert.match(finalStatus.resultPreview, /fatal: child transport broke/);
  assert.match(finalStatus.stderrPreview, /fatal: child transport broke/);
  assert.doesNotMatch(finalStatus.stderrPreview, /sk-012345678901234567890123/);
  const parsedFinalStatus = parseSubagentSessionStatusPayload(finalStatus);
  assert.equal(parsedFinalStatus?.failureKind, "transport_exited_before_settlement");
  assert.match(parsedFinalStatus?.stderrPreview || "", /fatal: child transport broke/);

  await rm(state.sessionsDir, { recursive: true, force: true });
});

test("spawnSubagentWithSpawn flushes a final unterminated settlement event", async () => {
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
    `${MODERN_HANDSHAKE}{"type":"assistant_message_end","text":"final output without newline","stopReason":"stop"}\n{"type":"agent_settled"}`,
  );
  await emitChildEvent(child, "close", 0);

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

test("spawnSubagentWithSpawn treats a final assistant stop as semantic success even when transport exits non-zero", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-final-stop-drift-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 434344;

  const resultPromise = spawnSubagentWithSpawn(
    {
      name: "final-stop-drift",
      objective: "Review changes",
      tools: "read,bash",
      sessionFile: join(state.sessionsDir, "final-stop-drift.json"),
    },
    "test/model",
    { cwd: process.cwd() },
    state,
    () => child,
  );

  stdout.emit(
    "data",
    `${MODERN_HANDSHAKE}{"type":"assistant_message_end","text":"review complete","stopReason":"stop"}\n{"type":"agent_settled"}\n`,
  );
  await emitChildEvent(child, "close", 1);

  const result = await resultPromise;
  assert.equal(result.status, "done");
  assert.equal(result.exitCode, 0);
  assert.equal(result.output, "review complete");
  assert.equal(result.assistantStopReason, "stop");
  assert.deepEqual(result.executionState, {
    transport: {
      kind: "transport",
      exitCode: 1,
      aborted: false,
      timedOut: false,
      rawChildSpawnIntent: true,
    },
    protocol: {
      kind: "assistant_protocol",
      stopReason: "stop",
      errorMessage: undefined,
    },
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

  stdout.emit("data", `${MODERN_HANDSHAKE}{"type":"assistant_text_delta","delta":"partial"}\n`);
  stdout.emit(
    "data",
    '{"type":"assistant_message_end","stopReason":"error","errorMessage":"boom"}\n{"type":"agent_settled"}\n',
  );
  await emitChildEvent(child, "close", 0);

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
    `${MODERN_HANDSHAKE}{"type":"assistant_message_end","stopReason":"error","errorMessage":"boom"}\n{"type":"agent_settled"}\n`,
  );
  await emitChildEvent(child, "close", 0);

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

test("spawnSubagentWithSpawn fails closed on malformed subagent protocol output", async () => {
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
  await emitChildEvent(child, "close", 0);

  const result = await resultPromise;
  assert.equal(result.status, "error");
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Failed to parse 1 subagent protocol event line/);
  assert.deepEqual(result.executionState?.protocol, {
    kind: "assistant_protocol_parse_error",
    errorMessage:
      "Failed to parse 1 subagent protocol event line(s).\nExpected property name or '}' in JSON at position 1 (line 1 column 2)",
  });

  await rm(state.sessionsDir, { recursive: true, force: true });
});

test("spawnSubagentWithSpawn rejects raw pi JSON events once the helper protocol is authoritative", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-raw-pi-rejected-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 455455;

  const resultPromise = spawnSubagentWithSpawn(
    {
      name: "raw-pi-rejected",
      objective: "Review changes",
      tools: "read,bash",
      sessionFile: join(state.sessionsDir, "raw-pi-rejected.json"),
    },
    "test/model",
    { cwd: process.cwd() },
    state,
    () => child,
  );

  stdout.emit(
    "data",
    `${MODERN_HANDSHAKE}{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"stop"}}\n`,
  );
  await emitChildEvent(child, "close", 0);

  const result = await resultPromise;
  assert.equal(result.status, "error");
  assert.equal(result.exitCode, 1);
  assert.match(result.output, /Unexpected subagent protocol event type: message_end/);
  assert.deepEqual(result.executionState?.protocol, {
    kind: "assistant_protocol_parse_error",
    errorMessage:
      "Failed to parse 1 subagent protocol event line(s).\nUnexpected subagent protocol event type: message_end",
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
      `${MODERN_HANDSHAKE}${JSON.stringify({
        type: "assistant_message_end",
        text: "x".repeat(64),
        stopReason: "stop",
      })}\n${JSON.stringify({ type: "agent_settled" })}\n`,
    );
    await emitChildEvent(child, "close", 0);

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

test("spawnSubagentWithSpawn bounds transport stderr while preserving failure context", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-stderr-truncation-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const previous = process.env.PI_SUBAGENT_STDERR_CHARS;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 460460;

  try {
    process.env.PI_SUBAGENT_STDERR_CHARS = "16";

    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "stderr-truncated",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "stderr-truncated.json"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );

    stdout.emit("data", MODERN_HANDSHAKE);
    stderr.emit("data", `fatal:${"x".repeat(64)}`);
    await emitChildEvent(child, "close", 1);

    const result = await resultPromise;
    assert.equal(result.status, "error");
    assert.match(result.output, /Subagent transport stderr:/);
    assert.match(result.output, /fatal:x{10}/);
    assert.doesNotMatch(result.output, /x{17}/);
    assert.match(result.stderr || "", /stderr truncated to 16 characters/);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_SUBAGENT_STDERR_CHARS;
    } else {
      process.env.PI_SUBAGENT_STDERR_CHARS = previous;
    }
    await rm(state.sessionsDir, { recursive: true, force: true });
  }
});

test("spawnSubagentWithSpawn fails closed when a subagent protocol line exceeds the buffer limit without a newline delimiter", async () => {
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
    await emitChildEvent(child, "close", 0);

    const result = await resultPromise;
    assert.equal(result.status, "error");
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /Failed to parse 1 subagent protocol event line/);
    assert.match(result.stderr || "", /subagent protocol event buffer exceeded 8 bytes/i);
    assert.deepEqual(result.executionState?.protocol, {
      kind: "assistant_protocol_parse_error",
      errorMessage:
        "Failed to parse 1 subagent protocol event line(s).\nSubagent protocol event buffer exceeded 8 bytes without a newline delimiter.",
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

test("spawnSubagentWithSpawn fails closed when a complete subagent protocol line exceeds the buffer limit", async () => {
  const state = createSubagentState(
    join(tmpdir(), `subagent-complete-line-overflow-${Date.now()}`),
  );
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const previous = process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES;

  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 463463;

  try {
    process.env.PI_SUBAGENT_EVENT_BUFFER_BYTES = "32";

    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "complete-line-overflow",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "complete-line-overflow.json"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );

    stdout.emit(
      "data",
      `${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "x".repeat(128) })}\n`,
    );
    await emitChildEvent(child, "close", 0);

    const result = await resultPromise;
    assert.equal(result.status, "error");
    assert.equal(result.exitCode, 1);
    assert.match(result.output, /Subagent protocol event line exceeded 32 bytes/);
    assert.deepEqual(result.executionState?.protocol, {
      kind: "assistant_protocol_parse_error",
      errorMessage:
        "Failed to parse 1 subagent protocol event line(s).\nSubagent protocol event line exceeded 32 bytes.",
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
        sessionKind: "subagent",
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
