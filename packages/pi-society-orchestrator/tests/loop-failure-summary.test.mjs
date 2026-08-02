import assert from "node:assert/strict";
import test from "node:test";
import {
  compactLoopResult,
  formatCompactPhaseResult,
  summarizeLoopPhaseFailure,
} from "../src/loops/engine.ts";

const failedPhase = {
  phase: "diagnose",
  output: [
    "child wrapper",
    "Subagent transport stderr:",
    "Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: raw TypeScript cannot run from node_modules",
    "at internal loader",
  ].join("\n"),
  stderr: [
    "Subagent transport stderr:",
    "Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: raw TypeScript cannot run from node_modules",
    "at internal loader",
  ].join("\n"),
  exitCode: 1,
  status: "error",
  failureKind: "subagent_helper_bootstrap_failed",
  elapsed: 25,
  artifacts: [],
  timestamp: new Date("2026-08-02T00:00:00.000Z"),
};

test("loop failure summaries expose a bounded actionable bootstrap cause", () => {
  const summary = summarizeLoopPhaseFailure(failedPhase);
  assert.equal(
    summary,
    "Subagent transport stderr: Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: raw TypeScript cannot run from node_modules at internal loader",
  );

  const compact = compactLoopResult({
    plugin: "transcendent",
    sessionId: "transcendent-test",
    objective: "Improve the artifact",
    resumed: false,
    phases: [failedPhase],
    artifacts: [],
    success: false,
    elapsed: 25,
  });
  assert.equal(compact.phases[0].failureSummary, summary);
  assert.match(
    formatCompactPhaseResult(compact.phases[0]),
    /subagent_helper_bootstrap_failed[\s\S]*cause: Subagent transport stderr:/,
  );
});

test("loop summaries do not expose arbitrary failed agent prose", () => {
  for (const failureKind of ["closure_gate_incomplete", "transport_error"]) {
    assert.equal(
      summarizeLoopPhaseFailure({
        status: "error",
        failureKind,
        output:
          "potentially long task-specific prose Subagent transport stderr: SPOOFED_TASK_PROSE",
      }),
      undefined,
    );
  }
});

test("loop summaries use structured stderr instead of spoofable assistant output", () => {
  const summary = summarizeLoopPhaseFailure({
    status: "error",
    failureKind: "assistant_protocol_incomplete",
    output: "assistant says Subagent transport stderr: SECRET_TASK_PROSE",
    stderr: "Subagent transport stderr:\nactual transport diagnostic",
  });
  assert.equal(summary, "Subagent transport stderr: actual transport diagnostic");
  assert.doesNotMatch(summary, /SECRET_TASK_PROSE/u);
});

test("loop summaries redact credentials and normalize control characters", () => {
  const summary = summarizeLoopPhaseFailure({
    status: "error",
    failureKind: "transport_error",
    stderr: "transport\u0000failed\napi_key=super-secret-value\nghp_abcdefghijk",
  });
  assert.equal(summary, "transport failed api_key=[REDACTED] [REDACTED GITHUB TOKEN]");
});

test("loop failure summaries stay bounded", () => {
  const summary = summarizeLoopPhaseFailure({
    status: "error",
    failureKind: "transport_error",
    stderr: `Subagent transport stderr:\n${"x".repeat(2000)}`,
  });
  assert.equal(summary.length, 640);
  assert.match(summary, /…$/u);
});
