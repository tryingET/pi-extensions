import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertInvariants,
  createEdgeMonotonicId,
  normalizeInput,
  shapeToolResult,
} from "../extensions/self/edge-contract-kernel.ts";
import { createSubagentState, registerSubagentTool } from "../extensions/self/subagent.ts";

test("normalizeInput returns empty object for malformed boundary payloads", () => {
  assert.deepEqual(normalizeInput(null), {});
  assert.deepEqual(normalizeInput(undefined), {});
  assert.deepEqual(normalizeInput(["not", "a", "record"]), {});
  assert.deepEqual(normalizeInput({ profile: "reviewer" }), { profile: "reviewer" });
});

test("assertInvariants reports failed checks deterministically", () => {
  const report = assertInvariants([
    { id: "ok", check: true, message: "fine" },
    { id: "broken", check: false, message: "broke" },
  ]);

  assert.equal(report.ok, false);
  assert.equal(report.checked, 2);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].id, "broken");
});

test("shapeToolResult enforces shared response envelope", () => {
  const shaped = shapeToolResult({
    status: "error",
    text: "broken",
    details: { reason: "invariant_failed" },
  });

  assert.equal(shaped.content.length, 1);
  assert.equal(shaped.content[0].text, "broken");
  assert.equal(shaped.details.status, "error");
  assert.equal(shaped.details.reason, "invariant_failed");
});

test("createEdgeMonotonicId preserves monotonic suffix semantics", () => {
  const originalNow = Date.now;
  Date.now = () => 1_740_000_000_000;

  try {
    const first = createEdgeMonotonicId("branch");
    const second = createEdgeMonotonicId("branch");

    assert.equal(first, "branch-1740000000000");
    assert.equal(second, "branch-1740000000000-1");
  } finally {
    Date.now = originalNow;
  }
});

test("dispatch_subagent rejects malformed objective via edge invariants", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "eck-dispatch-"));
  const state = createSubagentState(sessionsDir, { maxConcurrent: 1 });
  let spawnCalls = 0;
  let tool;

  const pi = {
    registerTool(definition) {
      tool = definition;
    },
  };

  registerSubagentTool(
    pi,
    state,
    () => "test/model",
    async () => {
      spawnCalls++;
      return {
        output: "ok",
        exitCode: 0,
        elapsed: 1,
        status: "done",
      };
    },
  );

  try {
    const result = await tool.execute(
      "tc-eck-1",
      {
        profile: "reviewer",
        objective: "   ",
      },
      null,
      null,
      { cwd: process.cwd() },
    );

    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "invariant_failed");
    assert.match(result.content[0].text, /dispatch.objective.required/);
    assert.equal(spawnCalls, 0);
    assert.equal(state.activeCount, 0);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
