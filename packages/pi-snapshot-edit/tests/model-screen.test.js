import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  aggregateResults,
  FIXED_SYSTEM_PROMPT,
  parsePiJsonl,
  runPi,
  scorePiOutput,
} from "../scripts/model-screen-core.mjs";
import {
  buildScreenPrompt,
  fixtureFor,
  PROTOCOLS,
  WORKLOADS,
} from "../scripts/model-screen-fixtures.mjs";
import { ALLOWED_MODELS, buildPlan, executePlan, parseArgs } from "../scripts/run-model-screen.mjs";

function stream(text, overrides = {}) {
  const message = {
    role: "assistant",
    provider: "zai",
    model: "glm-5.2",
    api: "openai-completions",
    content: [
      { type: "thinking", thinking: "sanitized reasoning", thinkingSignature: "fake-signature" },
      { type: "text", text },
    ],
    usage: {
      input: 10,
      output: 4,
      cacheRead: 2,
      cacheWrite: 1,
      totalTokens: 17,
      cost: { total: 0.125 },
    },
    ...overrides,
  };
  return `${JSON.stringify({ type: "session" })}\n${JSON.stringify({ type: "message_end", message })}\n`;
}

function coordinateCall(workload) {
  const item = fixtureFor(workload);
  return {
    path: "screen.txt",
    base: "amber",
    edits: item.edits.map((edit) => ({
      op: "replace",
      startLine: edit.startLine,
      endLine: edit.endLine,
      newText: edit.newLines.join("\n"),
    })),
  };
}

test("two explicit models produce the exact bounded 30-cell matrix", () => {
  const options = parseArgs([
    "--model",
    ALLOWED_MODELS[0],
    "--model",
    ALLOWED_MODELS[1],
    "--max-calls",
    "30",
  ]);
  const plan = buildPlan(options.models);
  assert.equal(plan.length, 30);
  assert.equal(new Set(plan.map((cell) => JSON.stringify(Object.values(cell)))).size, 30);
  for (const model of ALLOWED_MODELS)
    for (const protocol of PROTOCOLS)
      for (const workload of WORKLOADS)
        assert.equal(
          plan.filter(
            (cell) =>
              cell.model === model && cell.protocol === protocol && cell.workload === workload,
          ).length,
          1,
        );
  assert.throws(() => parseArgs(["--model", ALLOWED_MODELS[0]]), /exactly two/);
  assert.throws(
    () =>
      parseArgs(["--model", ALLOWED_MODELS[0], "--model", ALLOWED_MODELS[1], "--max-calls", "29"]),
    /requires --max-calls 30/,
  );
  assert.equal(options.timeoutSeconds, 180);
  const configured = parseArgs([
    "--model",
    ALLOWED_MODELS[0],
    "--model",
    ALLOWED_MODELS[1],
    "--timeout-seconds",
    "45",
  ]);
  assert.equal(configured.timeoutSeconds, 45);
  assert.throws(
    () =>
      parseArgs([
        "--model",
        ALLOWED_MODELS[0],
        "--model",
        ALLOWED_MODELS[1],
        "--timeout-seconds",
        "0",
      ]),
    /1 to 3600/,
  );
});

test("dry-run CLI prints a 30-call plan without execution output", () => {
  const result = spawnSync(
    process.execPath,
    [
      "./scripts/run-model-screen.mjs",
      "--model",
      ALLOWED_MODELS[0],
      "--model",
      ALLOWED_MODELS[1],
      "--max-calls",
      "30",
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.mode, "plan");
  assert.equal(plan.externalCalls, 0);
  assert.equal(plan.callCount, 30);
  assert.equal(plan.cells.length, 30);
});

test("prompts are blinded, protocol-specific, and identify C approximation", () => {
  const a = JSON.parse(buildScreenPrompt("A", "duplicate_targeting"));
  const c = JSON.parse(buildScreenPrompt("C", "duplicate_targeting"));
  assert.equal(a.taskIntent, c.taskIntent);
  assert.equal(a.readInteraction.length, 2);
  assert.equal(c.readInteraction.length, 2);
  assert.match(c.protocol.approximation, /not a real multi-turn tool loop/);
  assert.deepEqual(Object.keys(c.responseSchema), ["range", "edit"]);
  for (const prompt of [a, c]) {
    const serialized = JSON.stringify(prompt);
    assert.ok(!serialized.includes("duplicate-line.txt"));
    assert.ok(!serialized.includes('"editCall"'));
    assert.ok(!serialized.includes('"startLine":3'));
  }
  assert.match(FIXED_SYSTEM_PROMPT, /strict JSON/);
});

test("sanitized zai normalized JSONL shape extracts final usage and thinking plus text", () => {
  const edit = coordinateCall("duplicate_targeting");
  const result = scorePiOutput({
    raw: stream(JSON.stringify(edit)),
    selectedModel: "zai/glm-5.2",
    protocol: "A",
    workload: "duplicate_targeting",
  });
  assert.equal(result.validJson, true);
  assert.equal(result.correct, true);
  assert.deepEqual(result.usage, {
    input: 10,
    output: 4,
    cacheRead: 2,
    cacheWrite: 1,
    total: 17,
    cost: 0.125,
  });
});

test("sanitized openai-codex normalized JSONL shape accepts textSignature and final usage", () => {
  const edit = coordinateCall("duplicate_targeting");
  const raw = stream(JSON.stringify(edit), {
    provider: "openai-codex",
    model: "gpt-5.6-sol",
    api: "openai-codex-responses",
    content: [{ type: "text", text: JSON.stringify(edit), textSignature: "fake-signature" }],
    usage: {
      input: 20,
      output: 8,
      cacheRead: 3,
      cacheWrite: 0,
      totalTokens: 31,
      cost: { total: 0.25 },
    },
  });
  const result = scorePiOutput({
    raw,
    selectedModel: "openai-codex/gpt-5.6-sol",
    protocol: "A",
    workload: "duplicate_targeting",
  });
  assert.equal(result.validJson, true);
  assert.equal(result.correct, true);
  assert.equal(result.usage.total, 31);
  assert.equal(result.usage.cost, 0.25);
});

test("C requires a valid covering range in its one-response approximation", () => {
  const edit = coordinateCall("batched_edits");
  const valid = scorePiOutput({
    raw: stream(JSON.stringify({ range: { offset: 1, limit: 5 }, edit })),
    selectedModel: "zai/glm-5.2",
    protocol: "C",
    workload: "batched_edits",
  });
  assert.equal(valid.correct, true);
  const missed = scorePiOutput({
    raw: stream(JSON.stringify({ range: { offset: 2, limit: 1 }, edit })),
    selectedModel: "zai/glm-5.2",
    protocol: "C",
    workload: "batched_edits",
  });
  assert.equal(missed.correct, false);
  assert.equal(missed.error, "range_error");

  const outside = {
    path: "screen.txt",
    base: "amber",
    edits: [
      {
        op: "replace",
        startLine: 3,
        endLine: 7,
        newText: "body\nclose\nopen\nrevised\nclose",
      },
    ],
  };
  const outsideResult = scorePiOutput({
    raw: stream(JSON.stringify({ range: { offset: 5, limit: 3 }, edit: outside })),
    selectedModel: "zai/glm-5.2",
    protocol: "C",
    workload: "repeated_block_targeting",
  });
  assert.equal(outsideResult.error, "range_error");
});

test("parse ambiguity, duplicate keys, and missing usage fail closed", () => {
  assert.throws(
    () => parsePiJsonl("not-json\n"),
    (error) => error.category === "parse_ambiguity",
  );
  assert.throws(
    () => parsePiJsonl('{"type":"session","type":"message_end"}\n'),
    (error) => error.category === "parse_ambiguity",
  );
  const duplicate = `${stream("{}")}${stream("{}")}`;
  assert.throws(
    () => parsePiJsonl(duplicate),
    (error) => error.category === "parse_ambiguity",
  );
  const missing = scorePiOutput({
    raw: stream("{}", { usage: undefined }),
    selectedModel: "zai/glm-5.2",
    protocol: "A",
    workload: "duplicate_targeting",
  });
  assert.deepEqual(missing, { validJson: false, correct: false, error: "usage_error" });
  const duplicateResponse = scorePiOutput({
    raw: stream('{"path":"screen.txt","path":"other.txt","base":"amber","edits":[]}'),
    selectedModel: "zai/glm-5.2",
    protocol: "A",
    workload: "duplicate_targeting",
  });
  assert.equal(duplicateResponse.error, "invalid_json");
});

test("invalid JSON and simulator failures are categorized, never accepted", () => {
  const invalid = scorePiOutput({
    raw: stream("```json\n{}\n```"),
    selectedModel: "zai/glm-5.2",
    protocol: "A",
    workload: "duplicate_targeting",
  });
  assert.equal(invalid.error, "invalid_json");
  assert.equal(invalid.validJson, false);
  const missingPath = coordinateCall("duplicate_targeting");
  delete missingPath.path;
  const schema = scorePiOutput({
    raw: stream(JSON.stringify(missingPath)),
    selectedModel: "zai/glm-5.2",
    protocol: "A",
    workload: "duplicate_targeting",
  });
  assert.equal(schema.error, "schema_error");

  const simulator = scorePiOutput({
    raw: stream(
      JSON.stringify({
        path: "screen.txt",
        base: "amber",
        edits: [{ op: "replace", startLine: 99, endLine: 99, newText: "x" }],
      }),
    ),
    selectedModel: "zai/glm-5.2",
    protocol: "A",
    workload: "duplicate_targeting",
  });
  assert.equal(simulator.validJson, true);
  assert.equal(simulator.correct, false);
  assert.equal(simulator.error, "simulator_error");
});

test("runPi pipes prompts on stdin and timeout cleans up with TERM then KILL", async () => {
  const signals = [];
  let capturedArgs;
  let capturedOptions;
  let stdinText = "";
  const spawnImpl = (_command, args, options) => {
    capturedArgs = args;
    capturedOptions = options;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.stdin.on("data", (chunk) => {
      stdinText += chunk;
    });
    child.kill = (signal) => {
      signals.push(signal);
      if (signal === "SIGKILL") queueMicrotask(() => child.emit("close", null, signal));
      return true;
    };
    return child;
  };
  await assert.rejects(
    runPi({
      model: ALLOWED_MODELS[0],
      prompt: "private blinded prompt",
      cwd: ".",
      spawnImpl,
      timeoutMs: 10,
      killGraceMs: 10,
    }),
    (error) => error.category === "timeout",
  );
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
  assert.equal(stdinText, "private blinded prompt");
  assert.ok(!capturedArgs.includes("private blinded prompt"));
  assert.equal(capturedOptions.stdio[0], "pipe");
  assert.equal(capturedOptions.env.PI_SKIP_VERSION_CHECK, "1");
  assert.equal(capturedOptions.env.PI_TELEMETRY, "0");

  let receivedTimeout;
  await executePlan(
    [{ model: ALLOWED_MODELS[0], protocol: "A", workload: "duplicate_targeting" }],
    async ({ timeoutMs }) => {
      receivedTimeout = timeoutMs;
      throw new Error("fake process failure");
    },
    { timeoutMs: 12_345 },
  );
  assert.equal(receivedTimeout, 12_345);
});

test(
  "timeout kills a TERM-ignoring descendant after the leader exits",
  { skip: process.platform === "win32" },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "model-screen-tree-"));
    const pidPath = join(directory, "descendant.pid");
    const termPath = join(directory, "leader-term");
    let leaderPid;
    let descendantPid;
    const leaderScript = `
      const { spawn } = require("node:child_process");
      const { writeFileSync } = require("node:fs");
      const descendant = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: "ignore" });
      writeFileSync(process.argv[1], String(descendant.pid));
      process.on("SIGTERM", () => {
        writeFileSync(process.argv[2], "received");
        process.exit(0);
      });
      setInterval(() => {}, 1000);
    `;
    const spawnImpl = (_command, _args, options) => {
      const child = spawn(process.execPath, ["-e", leaderScript, pidPath, termPath], options);
      leaderPid = child.pid;
      return child;
    };

    try {
      await assert.rejects(
        runPi({
          model: ALLOWED_MODELS[0],
          prompt: "tree cleanup test",
          cwd: ".",
          spawnImpl,
          timeoutMs: 200,
          killGraceMs: 100,
        }),
        (error) => error.category === "timeout",
      );
      descendantPid = Number(await readFile(pidPath, "utf8"));
      assert.ok(Number.isInteger(descendantPid));
      assert.equal(await readFile(termPath, "utf8"), "received");
      let descendantAlive = true;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          process.kill(descendantPid, 0);
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
          descendantAlive = false;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(descendantAlive, false, "descendant survived process-group SIGKILL");
    } finally {
      if (leaderPid) {
        try {
          process.kill(-leaderPid, "SIGKILL");
        } catch {}
      }
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("aggregate is content-free and sums only governed fields", () => {
  const aggregate = aggregateResults([
    {
      model: "zai/glm-5.2",
      protocol: "A",
      workload: "duplicate_targeting",
      validJson: true,
      correct: true,
      error: null,
      usage: { input: 10, output: 4, cacheRead: 2, cacheWrite: 1, total: 17, cost: 0.125 },
    },
  ]);
  assert.equal(aggregate.cells[0].attempts, 1);
  assert.equal(aggregate.cells[0].reportedCost, 0.125);
  const durable = JSON.stringify(aggregate);
  for (const forbidden of ["screen.txt", "repeat", "requestId", "sessionId", "responseId"])
    assert.ok(!durable.includes(forbidden));
});
