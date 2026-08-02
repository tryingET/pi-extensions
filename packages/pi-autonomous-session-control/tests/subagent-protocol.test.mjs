import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSubagentState, spawnSubagentWithSpawn } from "../extensions/self/subagent.ts";
import {
  classifyPiSettlementMode,
  translatePiJsonEventLineToSubagentProtocol,
} from "../extensions/self/subagent-protocol.ts";
import { classifyDispatchEffectDisposition } from "../extensions/self/subagent-runtime.ts";
import { getDispatchSubagentFailureKind } from "../extensions/self/subagent-runtime-display.ts";

test("classifyPiSettlementMode distinguishes audited legacy and authoritative settlement hosts", () => {
  assert.equal(classifyPiSettlementMode("0.76.0"), "legacy_agent_end_exit");
  assert.equal(classifyPiSettlementMode("0.76.9"), "legacy_agent_end_exit");
  assert.equal(classifyPiSettlementMode("0.80.6"), "agent_settled");
  assert.equal(classifyPiSettlementMode("1.0.0"), "agent_settled");
  assert.equal(classifyPiSettlementMode("0.79.9"), undefined);
  assert.equal(classifyPiSettlementMode("not-semver"), undefined);
});

test("translatePiJsonEventLineToSubagentProtocol drops agent_end aggregates but preserves Pi 0.76 retry finality", () => {
  const rawLine = JSON.stringify({
    type: "agent_end",
    willRetry: false,
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

  assert.deepEqual(translated, { type: "agent_run_end", willRetry: false });
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

test("translatePiJsonEventLineToSubagentProtocol emits authoritative agent settlement", () => {
  assert.deepEqual(
    translatePiJsonEventLineToSubagentProtocol(JSON.stringify({ type: "agent_settled" })),
    { type: "agent_settled" },
  );
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

    stdout.emit(
      "data",
      '{"type":"raw_child_spawn_intent"}\n{"type":"transport_ready","rawChildPid":787878,"settlementMode":"agent_settled","piVersion":"0.80.6"}\n',
    );
    stdout.emit("data", '{"type":"assistant_text_delta","delta":"hello"}\n');
    stdout.emit(
      "data",
      '{"type":"assistant_message_end","stopReason":"stop"}\n{"type":"agent_settled"}\n',
    );
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
        rawChildSpawnIntent: true,
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

test("spawnSubagentWithSpawn rejects missing and mismatched settlement handshakes", async () => {
  const cases = [
    {
      name: "missing",
      handshake: { type: "transport_ready" },
      expected: /Missing or unknown Pi settlement mode/,
    },
    {
      name: "mismatch",
      handshake: {
        type: "transport_ready",
        settlementMode: "legacy_agent_end_exit",
        piVersion: "0.80.6",
      },
      expected: /Pi settlement handshake mismatch/,
    },
  ];

  for (const scenario of cases) {
    const state = createSubagentState(
      join(tmpdir(), `subagent-invalid-handshake-${scenario.name}-${Date.now()}`),
    );
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    stdout.setEncoding = () => stdout;
    stderr.setEncoding = () => stderr;
    const child = new EventEmitter();
    child.stdout = stdout;
    child.stderr = stderr;
    child.kill = () => true;
    child.pid = 566000;

    try {
      const resultPromise = spawnSubagentWithSpawn(
        {
          name: `invalid-handshake-${scenario.name}`,
          objective: "Reject an invalid settlement handshake",
          tools: "read",
          sessionFile: join(state.sessionsDir, `${scenario.name}.jsonl`),
        },
        "test/model",
        { cwd: process.cwd() },
        state,
        () => child,
      );
      stdout.emit(
        "data",
        `${JSON.stringify({ type: "raw_child_spawn_intent" })}\n${JSON.stringify(scenario.handshake)}\n${JSON.stringify({ type: "assistant_message_end", stopReason: "stop", text: "must fail" })}\n${JSON.stringify({ type: "agent_settled" })}\n`,
      );
      child.emit("close", 0);
      const result = await resultPromise;
      assert.equal(result.status, "error");
      assert.equal(result.executionState?.protocol?.kind, "assistant_protocol_parse_error");
      assert.match(result.output, scenario.expected);
    } finally {
      await rm(state.sessionsDir, { recursive: true, force: true });
    }
  }
});

test("spawnSubagentWithSpawn rejects unapproved request env before creating the child process", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-env-policy-${Date.now()}`));
  let spawnCalled = false;

  try {
    const result = await spawnSubagentWithSpawn(
      {
        name: "env-policy",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "env-policy.json"),
        env: {
          PATH: "/tmp/malicious-bin",
          NODE_OPTIONS: "--require /tmp/hook.js",
          PI_CODING_AGENT_DIR: "/tmp/malicious-agent-dir",
        },
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => {
        spawnCalled = true;
        throw new Error("spawnImpl should not be called");
      },
    );

    assert.equal(spawnCalled, false);
    assert.equal(state.activeCount, 0);
    assert.equal(result.status, "error");
    assert.match(result.output, /Invalid dispatch_subagent env/);
    assert.match(result.output, /Rejected request env key: PATH/);
    assert.match(result.output, /Rejected request env key: NODE_OPTIONS/);
    assert.match(result.output, /Rejected request env key: PI_CODING_AGENT_DIR/);
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
  let capturedEnv;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "extension-args",
        objective: "Review changes",
        tools: "read,bash",
        sessionFile: join(state.sessionsDir, "extension-args.json"),
        extensionSources: ["/tmp/pi-multi-pass.ts", "/tmp/vault.ts"],
        env: {
          PI_PROVENANCE_REVIEW_LANE_ID: "lane-spawn",
          PI_PROVENANCE_OUTPUT_FILE: "/tmp/lane-spawn.json",
        },
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      (_command, args, options) => {
        capturedArgs = args;
        capturedEnv = options.env;
        return child;
      },
    );

    stdout.emit(
      "data",
      '{"type":"raw_child_spawn_intent"}\n{"type":"transport_ready","settlementMode":"agent_settled","piVersion":"0.80.6"}\n',
    );
    stdout.emit(
      "data",
      '{"type":"assistant_message_end","stopReason":"stop","text":"ok"}\n{"type":"agent_settled"}\n',
    );
    child.emit("close", 0);

    const result = await resultPromise;
    assert.equal(result.status, "done");
    assert.deepEqual(capturedArgs.filter((arg) => arg === "--extension").length, 2);
    assert.match(capturedArgs[0], /extensions\/self\/subagent-pi-json-filter\.ts$/u);
    assert.ok(capturedArgs.includes("/tmp/pi-multi-pass.ts"));
    assert.ok(capturedArgs.includes("/tmp/vault.ts"));
    assert.equal(capturedEnv.PI_PROVENANCE_REVIEW_LANE_ID, "lane-spawn");
    assert.equal(capturedEnv.PI_PROVENANCE_OUTPUT_FILE, "/tmp/lane-spawn.json");
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
    stdout.emit(
      "data",
      '{"type":"raw_child_spawn_intent"}\n{"type":"transport_ready","rawChildPid":797979,"settlementMode":"agent_settled","piVersion":"0.80.6"}\n',
    );
    stdout.emit(
      "data",
      '{"type":"assistant_message_end","text":"ready ok","stopReason":"stop"}\n{"type":"agent_settled"}\n',
    );
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

test("owned transport rejects readiness without intent and keeps effects indeterminate", async () => {
  const state = createSubagentState(join(tmpdir(), `subagent-missing-intent-${Date.now()}`));
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  stdout.setEncoding = () => stdout;
  stderr.setEncoding = () => stderr;
  const child = new EventEmitter();
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  child.pid = 808080;

  try {
    const resultPromise = spawnSubagentWithSpawn(
      {
        name: "missing-intent",
        objective: "Reject an untrusted transport handshake",
        tools: "read",
        sessionFile: join(state.sessionsDir, "missing-intent.jsonl"),
      },
      "test/model",
      { cwd: process.cwd() },
      state,
      () => child,
    );
    stdout.emit(
      "data",
      '{"type":"transport_ready","settlementMode":"agent_settled","piVersion":"0.80.6"}\n',
    );
    child.emit("close", 1);

    const result = await resultPromise;
    assert.equal(result.status, "error");
    assert.equal(result.executionState?.protocol?.kind, "assistant_protocol_parse_error");
    assert.equal(result.executionState?.transport.rawChildSpawnIntent, undefined);
    assert.match(result.output, /arrived before raw_child_spawn_intent/u);
    assert.equal(
      classifyDispatchEffectDisposition({
        status: "error",
        spawnAttempted: true,
        usesOwnedSpawner: true,
        rawChildSpawnIntent: result.executionState?.transport.rawChildSpawnIntent,
      }),
      "effect_indeterminate",
    );
  } finally {
    await rm(state.sessionsDir, { recursive: true, force: true });
  }
});

test("owned transport distinguishes helper bootstrap failure from post-intent failure", async (t) => {
  for (const scenario of [
    {
      name: "pre-intent",
      emitIntent: false,
      failureKind: "subagent_helper_bootstrap_failed",
      disposition: "confirmed_no_effects",
    },
    {
      name: "post-intent",
      emitIntent: true,
      failureKind: "transport_exited_before_settlement",
      disposition: "effect_indeterminate",
    },
  ]) {
    await t.test(scenario.name, async () => {
      const state = createSubagentState(join(tmpdir(), `subagent-${scenario.name}-${Date.now()}`));
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      stdout.setEncoding = () => stdout;
      stderr.setEncoding = () => stderr;
      const child = new EventEmitter();
      child.stdout = stdout;
      child.stderr = stderr;
      child.kill = () => true;
      child.pid = 808080;

      try {
        const resultPromise = spawnSubagentWithSpawn(
          {
            name: scenario.name,
            objective: "Classify transport bootstrap effects",
            tools: "read",
            sessionFile: join(state.sessionsDir, `${scenario.name}.jsonl`),
          },
          "test/model",
          { cwd: process.cwd() },
          state,
          () => child,
        );
        if (scenario.emitIntent) {
          stdout.emit("data", '{"type":"raw_child_spawn_intent"}\n');
        }
        stderr.emit("data", "helper failed before settlement\n");
        child.emit("close", 1);

        const result = await resultPromise;
        assert.equal(result.executionState?.transport.rawChildSpawnIntent, scenario.emitIntent);
        const failureKind = getDispatchSubagentFailureKind({
          status: "error",
          executionState: result.executionState,
        });
        assert.equal(failureKind, scenario.failureKind);
        assert.equal(
          classifyDispatchEffectDisposition({
            status: "error",
            spawnAttempted: true,
            usesOwnedSpawner: true,
            rawChildSpawnIntent: result.executionState?.transport.rawChildSpawnIntent,
          }),
          scenario.disposition,
        );
      } finally {
        await rm(state.sessionsDir, { recursive: true, force: true });
      }
    });
  }
});
