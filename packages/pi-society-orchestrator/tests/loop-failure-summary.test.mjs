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
    "The subagent helper could not start. Verify the installed package and child-runtime compatibility.",
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
    /subagent_helper_bootstrap_failed[\s\S]*cause: The subagent helper could not start\./,
  );
});

test("loop summaries do not expose arbitrary failed agent prose", () => {
  assert.equal(
    summarizeLoopPhaseFailure({
      status: "error",
      failureKind: "closure_gate_incomplete",
      output: "potentially long task-specific prose Subagent transport stderr: SPOOFED_TASK_PROSE",
    }),
    undefined,
  );
  const transportSummary = summarizeLoopPhaseFailure({
    status: "error",
    failureKind: "transport_error",
    output: "potentially long task-specific prose Subagent transport stderr: SPOOFED_TASK_PROSE",
  });
  assert.equal(
    transportSummary,
    "The child transport failed. Inspect the private checkpoint and owner runtime diagnostics.",
  );
  assert.doesNotMatch(transportSummary, /SPOOFED_TASK_PROSE/u);
});

test("loop summaries use structured stderr instead of spoofable assistant output", () => {
  const summary = summarizeLoopPhaseFailure({
    status: "error",
    failureKind: "assistant_protocol_incomplete",
    output: "assistant says Subagent transport stderr: SECRET_TASK_PROSE",
    stderr: "Subagent transport stderr:\nactual transport diagnostic",
  });
  assert.equal(
    summary,
    "The child response ended before the assistant protocol settled. Inspect the private checkpoint.",
  );
  assert.doesNotMatch(summary, /SECRET_TASK_PROSE|actual transport diagnostic/u);
});

test("loop summaries never render arbitrary secret-bearing diagnostics", () => {
  const awsAccessKeyId = `AKIA${"A".repeat(16)}`;
  const awsSecretAccessKey = `${"AWS_SECRET"}_ACCESS_KEY=${"a".repeat(40)}`;
  const npmToken = `npm_${"a".repeat(26)}`;
  const secrets = [
    "Authorization: Bearer topsecretvalue",
    "Authorization:\u000bBearer multiline-secret",
    awsAccessKeyId,
    awsSecretAccessKey,
    npmToken,
    "KES_CLAIM: Authorization Bearer claim-secret",
    `multiline\npassword=hunter2\r\n${"x".repeat(2000)}`,
  ];
  for (const stderr of secrets) {
    const summary = summarizeLoopPhaseFailure({
      status: "error",
      failureKind: "transport_error",
      stderr,
    });
    assert.equal(
      summary,
      "The child transport failed. Inspect the private checkpoint and owner runtime diagnostics.",
    );
    assert.doesNotMatch(summary, /topsecret|AKIA|AWS_|npm_|KES_CLAIM|hunter2|Bearer/u);
  }
});

test("unknown failure kinds expose no arbitrary diagnostic", () => {
  assert.equal(
    summarizeLoopPhaseFailure({
      status: "error",
      failureKind: "future_failure_kind",
      stderr: "Authorization: Bearer must-stay-private",
    }),
    undefined,
  );
});
