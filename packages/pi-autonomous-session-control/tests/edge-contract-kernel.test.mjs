// ---
// summary: tests shared edge normalization, invariant reporting, tool-result shaping, monotonic ids, and malformed dispatch rejection.
// read_when:
//   - evolving boundary contracts used to validate and shape autonomous control tool calls.
// ---

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
import {
  createSubagentState,
  DISPATCH_SUBAGENT_TOOL_FAILURE_METADATA_PREFIX,
  registerSubagentTool,
} from "../extensions/self/subagent.ts";

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
    const error = await tool
      .execute(
        "tc-eck-1",
        {
          profile: "reviewer",
          objective: "   ",
        },
        null,
        null,
        { cwd: process.cwd() },
      )
      .then(
        () => assert.fail("expected dispatch_subagent to throw an invariant tool error"),
        (caught) => caught,
      );
    const result = error.result;

    assert.equal(result.details.status, "error");
    assert.equal(result.details.reason, "invariant_failed");
    assert.equal(result.details.effectDisposition, "confirmed_no_effects");
    assert.deepEqual(result.details.preDispatchFailure, {
      schema: "asc.dispatch_pre_dispatch_failure.v1",
      phase: "pre_dispatch",
      identityAllocated: false,
      spawnAttempted: false,
      effectDisposition: "confirmed_no_effects",
      failureKind: "invariant_failed",
    });
    assert.match(result.text, /dispatch.objective.required/);
    assert.match(error.message, new RegExp(`\\n${DISPATCH_SUBAGENT_TOOL_FAILURE_METADATA_PREFIX}`));
    assert.equal(spawnCalls, 0);
    assert.equal(state.activeCount, 0);
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});

test("dispatch_subagent admits long delegated objectives without a package-owned bound and attests pre-dispatch invariant failures", async () => {
  const sessionsDir = await mkdtemp(join(tmpdir(), "eck-dispatch-objective-bound-"));
  const state = createSubagentState(sessionsDir, { maxConcurrent: 1 });
  let spawnCalls = 0;
  let tool;
  let toolResultHandler;

  const pi = {
    registerTool(definition) {
      tool = definition;
    },
    on(event, handler) {
      if (event === "tool_result") toolResultHandler = handler;
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
    const observedDelegatedObjective = "x".repeat(8_732);
    const accepted = await tool.execute(
      "tc-eck-observed-delegation",
      { profile: "minimal", objective: observedDelegatedObjective },
      null,
      null,
      { cwd: process.cwd() },
    );
    assert.equal(accepted.details.status, "done");
    const currentDelegatedObjective = await tool.execute(
      "tc-eck-current-delegation",
      { profile: "minimal", objective: "x".repeat(32_000) },
      null,
      null,
      { cwd: process.cwd() },
    );
    assert.equal(currentDelegatedObjective.details.status, "done");
    assert.equal(spawnCalls, 2);

    const error = await tool
      .execute(
        "tc-eck-malformed-objective",
        {
          profile: "minimal",
          objective: 12345,
        },
        null,
        null,
        { cwd: process.cwd() },
      )
      .then(
        () => assert.fail("expected over-bound objective rejection"),
        (caught) => caught,
      );

    assert.equal(spawnCalls, 2, "malformed objective must fail before spawn");
    assert.equal(error.result.details.effectDisposition, "confirmed_no_effects");
    assert.match(error.message, /objective must be a non-empty string/);
    const metadataLine = error.message
      .split("\n")
      .find((line) => line.startsWith(DISPATCH_SUBAGENT_TOOL_FAILURE_METADATA_PREFIX));
    assert.ok(metadataLine, "tool error must expose machine-readable failure metadata");
    assert.deepEqual(
      JSON.parse(metadataLine.slice(DISPATCH_SUBAGENT_TOOL_FAILURE_METADATA_PREFIX.length)),
      {
        schema: "asc.dispatch_tool_failure.v1",
        status: "error",
        failureKind: "invariant_failed",
        effectDisposition: "confirmed_no_effects",
        phase: "pre_dispatch",
        identityAllocated: false,
        spawnAttempted: false,
      },
    );
    assert.equal(typeof toolResultHandler, "function");
    const patch = toolResultHandler({
      toolCallId: "tc-eck-malformed-objective",
      toolName: "dispatch_subagent",
      details: {},
      isError: true,
    });
    assert.deepEqual(patch, {
      details: {
        ascPreDispatchFailure: {
          schema: "asc.dispatch_pre_dispatch_failure.v1",
          phase: "pre_dispatch",
          identityAllocated: false,
          spawnAttempted: false,
          effectDisposition: "confirmed_no_effects",
          failureKind: "invariant_failed",
        },
      },
    });
  } finally {
    await rm(sessionsDir, { recursive: true, force: true });
  }
});
