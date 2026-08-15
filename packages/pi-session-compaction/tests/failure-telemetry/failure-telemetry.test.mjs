/**
 * Failure-chain telemetry: every fallback/failure site in runSessionCompaction emits
 * a stage-tagged compaction failure record through the injectable dep.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { runSessionCompaction } from "../../extensions/session-compaction/handler.js";

function baseEvent(overrides = {}) {
  return {
    customInstructions: undefined,
    preparation: {
      firstKeptEntryId: "e1",
      isSplitTurn: false,
      messagesToSummarize: [],
      turnPrefixMessages: [],
      settings: { reserveTokens: 15000 },
    },
    branchEntries: [],
    reason: "threshold",
    willRetry: false,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function failingDeps(failures) {
  return {
    loadConfig: async () => ({
      includeFilesTouched: true,
      includeLastAssistantMessage: true,
      defaultPreset: "current",
      presets: {},
    }),
    loadCompactionPrompt: async () => "prompt",
    complete: async () => {
      throw new Error("provider exploded with 529");
    },
    recordFailureTelemetry: async (input) => {
      failures.push(input);
    },
  };
}

test("final failure path emits a stage-tagged failure record", async () => {
  const failures = [];
  const result = await runSessionCompaction(baseEvent(), undefined, failingDeps(failures));
  assert.equal(result, undefined); // non-preset path: stock compaction takes over
  assert.equal(failures.length, 1);
  assert.equal(failures[0].stage, "final");
  assert.ok(failures[0].error instanceof Error && failures[0].error.message.length > 0);
});

test("preset failure path emits the preset-stage record", async () => {
  const failures = [];
  const event = baseEvent({ customInstructions: "/compact --preset missing-preset" });
  const result = await runSessionCompaction(event, undefined, failingDeps(failures));
  assert.equal(result, undefined);
  assert.ok(failures.some((entry) => entry.stage === "preset" || entry.stage === "final"));
});

test("abort errors emit nothing", async () => {
  const failures = [];
  const controller = new AbortController();
  controller.abort();
  const event = baseEvent({ signal: controller.signal });
  const result = await runSessionCompaction(event, undefined, failingDeps(failures));
  assert.deepEqual(result, { cancel: true });
  assert.equal(failures.length, 0);
});
