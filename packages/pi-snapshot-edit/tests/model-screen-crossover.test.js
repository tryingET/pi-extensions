import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { aggregateResults, scorePiOutput } from "../scripts/model-screen-core.mjs";
import {
  buildScreenPrompt,
  CROSSOVER_PROTOCOLS,
  CROSSOVER_SIZES,
  crossoverFixture,
  crossoverWorkload,
} from "../scripts/model-screen-fixtures.mjs";
import { ALLOWED_MODELS, buildPlan, parseArgs } from "../scripts/run-model-screen.mjs";

function stream(text, model = ALLOWED_MODELS[0]) {
  const identity =
    model === ALLOWED_MODELS[0]
      ? { provider: "zai", model: "glm-5.2", api: "openai-completions" }
      : { provider: "openai-codex", model: "gpt-5.6-sol", api: "openai-codex-responses" };
  return `${JSON.stringify({
    type: "message_end",
    message: {
      role: "assistant",
      ...identity,
      content: [{ type: "text", text }],
      usage: {
        input: 10,
        output: 5,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 15,
        cost: null,
      },
    },
  })}\n`;
}

function answer(protocol, size) {
  const fixture = crossoverFixture(size);
  const second = fixture.duplicatePositions[1];
  if (protocol === "A")
    return {
      path: "screen.txt",
      base: "amber",
      edits: [
        { op: "replace", startLine: second, endLine: second, newText: "selected second target" },
      ],
    };
  return {
    path: "screen.txt",
    base: "amber",
    edits: [
      {
        op: "replace",
        oldText: "duplicate target",
        occurrence: 2,
        newText: "selected second target",
      },
    ],
  };
}

test("crossover fixtures have exact sizes and two separated deterministic targets", () => {
  for (const size of CROSSOVER_SIZES) {
    const first = crossoverFixture(size);
    const second = crossoverFixture(size);
    assert.equal(first.lines.length, size);
    assert.deepEqual(first, second);
    assert.equal(first.lines.filter((line) => line === "duplicate target").length, 2);
    assert.ok(first.duplicatePositions[1] - first.duplicatePositions[0] > 1);
    assert.equal(first.edits[0].startLine, first.duplicatePositions[1]);
  }
});

test("crossover prompts expose full protocol reads but never oracle edit JSON", () => {
  for (const size of CROSSOVER_SIZES) {
    for (const protocol of CROSSOVER_PROTOCOLS) {
      const prompt = JSON.parse(buildScreenPrompt(protocol, crossoverWorkload(size)));
      const read = prompt.readInteraction[1].content;
      assert.match(prompt.taskIntent, /second occurrence/);
      assert.equal(read.split("\n").filter((line) => line !== "").length, size + 1);
      if (protocol === "A") assert.match(read, new RegExp(`\\n${size}│`));
      else assert.ok(!read.includes("│"));
      const serialized = JSON.stringify(prompt);
      const oracle = answer(protocol, size);
      assert.ok(!serialized.includes(JSON.stringify(oracle)));
      assert.ok(
        !serialized.includes(`"startLine":${crossoverFixture(size).duplicatePositions[1]}`),
      );
      assert.ok(!serialized.includes('"occurrence":2'));
    }
  }
});

test("crossover plan is the unique fixed 12-cell matrix", () => {
  const options = parseArgs([
    "--suite",
    "crossover",
    "--model",
    ALLOWED_MODELS[0],
    "--model",
    ALLOWED_MODELS[1],
    "--max-calls",
    "12",
  ]);
  const plan = buildPlan(options.models, options.suite);
  assert.equal(plan.length, 12);
  assert.equal(new Set(plan.map((cell) => JSON.stringify(cell))).size, 12);
  for (const model of ALLOWED_MODELS)
    for (const protocol of CROSSOVER_PROTOCOLS)
      for (const size of CROSSOVER_SIZES)
        assert.equal(
          plan.filter(
            (cell) =>
              cell.model === model &&
              cell.protocol === protocol &&
              cell.workload === crossoverWorkload(size),
          ).length,
          1,
        );
  assert.throws(
    () =>
      parseArgs([
        "--suite",
        "crossover",
        "--model",
        ALLOWED_MODELS[0],
        "--model",
        ALLOWED_MODELS[1],
        "--max-calls",
        "30",
      ]),
    /requires --max-calls 12/,
  );
});

test("crossover dry run proves exactly 12 calls and no execution", () => {
  const result = spawnSync(
    process.execPath,
    [
      "./scripts/run-model-screen.mjs",
      "--suite",
      "crossover",
      "--model",
      ALLOWED_MODELS[0],
      "--model",
      ALLOWED_MODELS[1],
      "--max-calls",
      "12",
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.equal(plan.suite, "crossover");
  assert.equal(plan.externalCalls, 0);
  assert.equal(plan.callCount, 12);
  assert.equal(plan.cells.length, 12);
});

test("both crossover protocols are independently scored against exact bytes", () => {
  for (const size of CROSSOVER_SIZES)
    for (const protocol of CROSSOVER_PROTOCOLS) {
      const workload = crossoverWorkload(size);
      const correct = scorePiOutput({
        raw: stream(JSON.stringify(answer(protocol, size))),
        selectedModel: ALLOWED_MODELS[0],
        protocol,
        workload,
      });
      assert.equal(correct.correct, true);
      const wrong = answer(protocol, size);
      if (protocol === "A") {
        wrong.edits[0].startLine = crossoverFixture(size).duplicatePositions[0];
        wrong.edits[0].endLine = crossoverFixture(size).duplicatePositions[0];
      } else wrong.edits[0].occurrence = 1;
      const scoredWrong = scorePiOutput({
        raw: stream(JSON.stringify(wrong)),
        selectedModel: ALLOWED_MODELS[0],
        protocol,
        workload,
      });
      assert.equal(scoredWrong.correct, false);
      assert.equal(scoredWrong.error, "wrong_bytes");
    }
});

test("aggregate usage completeness distinguishes exact totals from lower bounds", () => {
  const base = {
    model: ALLOWED_MODELS[0],
    protocol: "A",
    workload: crossoverWorkload(20),
    validJson: false,
    correct: false,
    error: "process_error",
  };
  const incomplete = aggregateResults([base]);
  assert.equal(incomplete.cells[0].usageSamples, 0);
  assert.equal(incomplete.cells[0].usageComplete, false);
  assert.equal(incomplete.usageComplete, false);
  assert.equal(incomplete.observedTokenTotalsAreLowerBounds, true);
  assert.equal(incomplete.failedClosed, true);
  assert.equal(incomplete.cells[0].totalTokens, 0);

  const complete = aggregateResults([
    {
      ...base,
      validJson: true,
      correct: true,
      error: null,
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, total: 15, cost: null },
    },
  ]);
  assert.equal(complete.cells[0].usageSamples, 1);
  assert.equal(complete.cells[0].usageComplete, true);
  assert.equal(complete.usageComplete, true);
  assert.equal(complete.observedTokenTotalsAreLowerBounds, false);
  assert.equal(complete.failedClosed, false);
});
