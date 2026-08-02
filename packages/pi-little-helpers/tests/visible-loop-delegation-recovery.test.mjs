// summary: verifies delegated commit execution policy, canonical ASC receipts, and reload correlation.
// read_when:
//   - changing delegated commit admission, settlement receipts, persistence, or cache-distinct recovery.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";

import { createSidequestExtension } from "../extensions/sidequest.ts";
import {
  createVisibleLoopRunConfig,
  getVisibleLoopStatusPath,
  resetVisibleLoopRuntimeForRecoveryTest,
  writeVisibleLoopRunConfig,
} from "../src/visibleLoop.ts";
import { getActiveVisibleLoopSnapshotPath } from "../src/visibleLoopRecovery.ts";
import {
  createContext,
  observeVisibleLoopMessageAt,
  registerExtension,
  setTemporaryHomeWithPromptTemplates,
} from "./sidequest-harness.mjs";

function parseDelegatedCommitRequest(prompt) {
  const matches = [
    ...prompt.matchAll(
      /Call `dispatch_subagent` exactly once with this request:[\s\S]*?```json\n([\s\S]*?)\n```/g,
    ),
  ];
  assert.equal(matches.length, 1, "delegated commit must contain exactly one dispatch request");
  return JSON.parse(matches[0][1]);
}

async function startDelegatedCommitHarness(suffix) {
  resetVisibleLoopRuntimeForRecoveryTest();
  const stateHome = mkdtempSync(`${tmpdir()}/visible-loop-delegated-receipt-${suffix}-`);
  const restoreHome = setTemporaryHomeWithPromptTemplates(`${stateHome}/home`);
  const env = { ...process.env, XDG_STATE_HOME: stateHome };
  const repo = `${stateHome}/repo`;
  mkdirSync(repo, { recursive: true });
  const config = createVisibleLoopRunConfig({
    loopCount: 1,
    cwd: repo,
    reportBack: "none",
    commandName: "nexus-loop",
    title: "Nexus loop",
    executionBinding: { mode: "operator_objective", objective: `delegated receipt ${suffix}` },
    prompts: ["bounded implementation is already complete", "/commit"],
    commitDelegation: { mode: "dispatch_subagent", promptTemplate: "commit" },
    runId: `nexus-loop-delegated-receipt-${suffix}`,
  });
  const configPath = writeVisibleLoopRunConfig(config, env);
  const runtime = registerExtension(createSidequestExtension({ env }));
  const harness = createContext({ cwd: repo });
  await runtime.commands.get("visible-loop-child").handler(configPath, harness.ctx);
  await observeVisibleLoopMessageAt(runtime.events, runtime.userMessages, 0, harness.ctx);
  await runtime.events.get("agent_settled")[0]({}, harness.ctx);
  await observeVisibleLoopMessageAt(runtime.events, runtime.userMessages, 1, harness.ctx);
  return {
    ...runtime,
    ...harness,
    stateHome,
    env,
    config,
    configPath,
    request: parseDelegatedCommitRequest(runtime.userMessages.at(-1).message),
    cleanup() {
      resetVisibleLoopRuntimeForRecoveryTest();
      restoreHome();
      rmSync(stateHome, { recursive: true, force: true });
    },
  };
}

function settledDispatchDetails(harness, dispatchId, attemptId, receiptDispatchId = dispatchId) {
  const effectCorrelationId = `correlation-${attemptId}`;
  const sessionName = `session-${attemptId}`;
  const sessionsDir = `${harness.stateHome}/asc-sessions`;
  const receiptPath = `${sessionsDir}/${sessionName}.${attemptId}.effect-receipt.json`;
  const effectReceipt = {
    schema: "asc.dispatch_effect_receipt.v1",
    dispatchId: receiptDispatchId,
    attemptId,
    sessionName,
    consumerCorrelationId: effectCorrelationId,
    disposition: "settled",
    recordedAt: "2026-08-02T07:00:00.000Z",
    receiptPath,
  };
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(effectReceipt, null, 2)}\n`, { mode: 0o600 });
  return {
    status: "done",
    timedOut: false,
    executionTimeoutSeconds: 1_800,
    aborted: false,
    dispatchId,
    attemptId,
    sessionName,
    effectCorrelationId,
    effectReceipt,
  };
}

function writeSchema7Snapshot(snapshotPath) {
  const current = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const { continuationStartProof: _proof, ...snapshotWithoutProof } = current;
  const { receipt: _receipt, ...delegatedCommit } = current.delegatedCommit;
  const legacy = {
    ...snapshotWithoutProof,
    schemaVersion: 7,
    delegatedCommit,
  };
  writeFileSync(snapshotPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
  return legacy;
}

test("safe idle schema-7 snapshot migrates without fabricating receipt identity", async () => {
  const harness = await startDelegatedCommitHarness("schema-7-idle");
  let reloaded;
  try {
    const snapshotPath = getActiveVisibleLoopSnapshotPath(
      harness.ctx.sessionManager.getSessionId(),
      harness.env,
    );
    const legacy = writeSchema7Snapshot(snapshotPath);
    assert.equal(legacy.delegatedCommit.phase, "idle");
    assert.equal(Object.hasOwn(legacy.delegatedCommit, "receipt"), false);

    reloaded = await import(`../src/visibleLoop.ts?schema-7-idle=${Date.now()}-${Math.random()}`);
    const pi = { sendUserMessage() {} };
    const toolCallId = "schema-7-idle-first-dispatch";
    reloaded.handleVisibleLoopToolExecutionStart(
      { toolCallId, toolName: "dispatch_subagent", args: harness.request },
      pi,
      harness.ctx,
      harness.env,
    );
    assert.equal(
      reloaded.handleVisibleLoopToolCall(
        { toolCallId, toolName: "dispatch_subagent", input: harness.request },
        pi,
        harness.ctx,
        harness.env,
      ),
      undefined,
    );

    const migrated = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(migrated.schemaVersion, 8);
    assert.equal(migrated.delegatedCommit.phase, "admitted");
    assert.equal(migrated.delegatedCommit.receipt, null);
  } finally {
    reloaded?.resetVisibleLoopRuntimeForRecoveryTest();
    harness.cleanup();
  }
});

test("exact admitted schema-7 correlation migrates to accept its original settlement", async () => {
  const harness = await startDelegatedCommitHarness("schema-7-admitted");
  let reloaded;
  try {
    const toolCallId = "schema-7-correlated-dispatch";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: harness.request },
      harness.ctx,
    );
    assert.equal(
      await harness.events.get("tool_call")[0](
        { toolCallId, toolName: "dispatch_subagent", input: harness.request },
        harness.ctx,
      ),
      undefined,
    );
    const snapshotPath = getActiveVisibleLoopSnapshotPath(
      harness.ctx.sessionManager.getSessionId(),
      harness.env,
    );
    const legacy = writeSchema7Snapshot(snapshotPath);
    assert.equal(legacy.delegatedCommit.phase, "admitted");
    assert.equal(legacy.delegatedCommit.toolCallId, toolCallId);
    assert.equal(Object.hasOwn(legacy.delegatedCommit, "receipt"), false);

    reloaded = await import(
      `../src/visibleLoop.ts?schema-7-admitted=${Date.now()}-${Math.random()}`
    );
    const pi = { sendUserMessage() {} };
    const details = settledDispatchDetails(harness, "schema-7-dispatch", "schema-7-attempt");
    reloaded.handleVisibleLoopToolResult(
      {
        toolCallId,
        toolName: "dispatch_subagent",
        input: harness.request,
        details,
        isError: false,
      },
      pi,
      harness.ctx,
      harness.env,
    );
    reloaded.handleVisibleLoopToolExecutionEnd(
      {
        toolCallId,
        toolName: "dispatch_subagent",
        result: { details },
        isError: false,
      },
      pi,
      harness.ctx,
      harness.env,
    );

    const migrated = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(migrated.schemaVersion, 8);
    assert.equal(migrated.delegatedCommit.phase, "succeeded");
    assert.equal(migrated.delegatedCommit.completedToolCallId, toolCallId);
    assert.equal(migrated.delegatedCommit.receipt.receiptPath, details.effectReceipt.receiptPath);
    assert.match(migrated.delegatedCommit.receipt.receiptDigest, /^[a-f0-9]{64}$/u);
  } finally {
    reloaded?.resetVisibleLoopRuntimeForRecoveryTest();
    harness.cleanup();
  }
});

test("succeeded schema-7 snapshot fails closed without canonical receipt identity", async () => {
  const harness = await startDelegatedCommitHarness("schema-7-succeeded");
  let reloaded;
  try {
    const toolCallId = "schema-7-uncorrelatable-success";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: harness.request },
      harness.ctx,
    );
    assert.equal(
      await harness.events.get("tool_call")[0](
        { toolCallId, toolName: "dispatch_subagent", input: harness.request },
        harness.ctx,
      ),
      undefined,
    );
    const details = settledDispatchDetails(harness, "schema-7-old-success", "schema-7-old-attempt");
    await harness.events.get("tool_result")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        input: harness.request,
        details,
        isError: false,
      },
      harness.ctx,
    );
    await harness.events.get("tool_execution_end")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        result: { details },
        isError: false,
      },
      harness.ctx,
    );
    const snapshotPath = getActiveVisibleLoopSnapshotPath(
      harness.ctx.sessionManager.getSessionId(),
      harness.env,
    );
    const legacy = writeSchema7Snapshot(snapshotPath);
    assert.equal(legacy.delegatedCommit.phase, "succeeded");
    assert.equal(Object.hasOwn(legacy.delegatedCommit, "receipt"), false);

    reloaded = await import(
      `../src/visibleLoop.ts?schema-7-succeeded=${Date.now()}-${Math.random()}`
    );
    const completion = await reloaded.startVisibleLoopChildCompleteRunner(
      `${harness.configPath} --iteration 1`,
      { sendUserMessage() {} },
      harness.ctx,
      harness.env,
    );
    assert.equal(completion.accepted, false);
    assert.match(completion.reason, /active state unavailable/);
    assert.ok(
      harness.notifications.some(({ message }) =>
        message.includes("schema-7 delegated commit success lacks canonical ASC receipt identity"),
      ),
    );
    const retained = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(retained.schemaVersion, 7);
    assert.equal(Object.hasOwn(retained.delegatedCommit, "receipt"), false);
    const statuses = readFileSync(getVisibleLoopStatusPath(harness.config, harness.env), "utf8");
    assert.doesNotMatch(statuses, /"event":"iteration_completed"/u);
  } finally {
    reloaded?.resetVisibleLoopRuntimeForRecoveryTest();
    harness.cleanup();
  }
});

test("delegated completion requires one exactly correlated settled ASC receipt", async () => {
  const harness = await startDelegatedCommitHarness("success");
  try {
    const completionTool = harness.tools.get("visible_loop_child_complete");
    const beforeDispatch = await completionTool.execute(
      "completion-before-dispatch",
      { configPath: harness.configPath, iteration: 1 },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(beforeDispatch.details.accepted, false);
    assert.match(beforeDispatch.details.reason, /delegated commit settled ASC receipt is missing/);

    const toolCallId = "delegated-commit-success";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: harness.request },
      harness.ctx,
    );
    const block = await harness.events.get("tool_call")[0](
      { toolCallId, toolName: "dispatch_subagent", input: harness.request },
      harness.ctx,
    );
    assert.equal(block, undefined);
    const details = settledDispatchDetails(harness, "dispatch-success", "attempt-success");
    await harness.events.get("tool_result")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        input: harness.request,
        details,
        isError: false,
      },
      harness.ctx,
    );
    await harness.events.get("tool_execution_end")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        isError: false,
        result: { details },
      },
      harness.ctx,
    );

    const afterDispatch = await completionTool.execute(
      "completion-after-dispatch",
      { configPath: harness.configPath, iteration: 1 },
      undefined,
      undefined,
      harness.ctx,
    );
    assert.equal(afterDispatch.details.accepted, true);
  } finally {
    harness.cleanup();
  }
});

test("delegated commit blocks timeout drift before host execution", async () => {
  const harness = await startDelegatedCommitHarness("request-drift");
  try {
    const driftedRequest = { ...harness.request, timeout: 0, allowUnlimited: true };
    const toolCallId = "delegated-commit-request-drift";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: driftedRequest },
      harness.ctx,
    );
    const block = await harness.events.get("tool_call")[0](
      { toolCallId, toolName: "dispatch_subagent", input: driftedRequest },
      harness.ctx,
    );
    assert.deepEqual(block, {
      block: true,
      reason: "visible-loop blocked an uncorrelated or duplicate delegated commit dispatch",
    });
    const completion = await harness.tools
      .get("visible_loop_child_complete")
      .execute(
        "completion-after-request-drift",
        { configPath: harness.configPath, iteration: 1 },
        undefined,
        undefined,
        harness.ctx,
      );
    assert.equal(completion.details.accepted, false);
    assert.match(completion.details.reason, /loop already stopped/);
  } finally {
    harness.cleanup();
  }
});

test("delegated commit rejects a dispatch/receipt identity mismatch", async () => {
  const harness = await startDelegatedCommitHarness("receipt-mismatch");
  try {
    const toolCallId = "delegated-commit-receipt-mismatch";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: harness.request },
      harness.ctx,
    );
    assert.equal(
      await harness.events.get("tool_call")[0](
        { toolCallId, toolName: "dispatch_subagent", input: harness.request },
        harness.ctx,
      ),
      undefined,
    );
    const details = settledDispatchDetails(
      harness,
      "dispatch-returned",
      "attempt-returned",
      "dispatch-receipt-mismatch",
    );
    await harness.events.get("tool_result")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        input: harness.request,
        details,
        isError: false,
      },
      harness.ctx,
    );
    await harness.events.get("tool_execution_end")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        isError: false,
        result: { details },
      },
      harness.ctx,
    );
    const completion = await harness.tools
      .get("visible_loop_child_complete")
      .execute(
        "completion-after-receipt-mismatch",
        { configPath: harness.configPath, iteration: 1 },
        undefined,
        undefined,
        harness.ctx,
      );
    assert.equal(completion.details.accepted, false);
    assert.match(completion.details.reason, /loop already stopped/);
  } finally {
    harness.cleanup();
  }
});

test("delegated commit rejects a truncated ASC settlement receipt", async () => {
  const harness = await startDelegatedCommitHarness("truncated-receipt");
  try {
    const toolCallId = "delegated-commit-truncated-receipt";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: harness.request },
      harness.ctx,
    );
    assert.equal(
      await harness.events.get("tool_call")[0](
        { toolCallId, toolName: "dispatch_subagent", input: harness.request },
        harness.ctx,
      ),
      undefined,
    );
    const details = settledDispatchDetails(harness, "dispatch-truncated", "attempt-truncated");
    details.effectReceipt = {
      schema: details.effectReceipt.schema,
      dispatchId: details.effectReceipt.dispatchId,
      attemptId: details.effectReceipt.attemptId,
      consumerCorrelationId: details.effectReceipt.consumerCorrelationId,
      disposition: details.effectReceipt.disposition,
    };
    await harness.events.get("tool_result")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        input: harness.request,
        details,
        isError: false,
      },
      harness.ctx,
    );
    await harness.events.get("tool_execution_end")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        result: { details },
        isError: false,
      },
      harness.ctx,
    );
    const completion = await harness.tools
      .get("visible_loop_child_complete")
      .execute(
        "completion-after-truncated-receipt",
        { configPath: harness.configPath, iteration: 1 },
        undefined,
        undefined,
        harness.ctx,
      );
    assert.equal(completion.details.accepted, false);
    assert.match(completion.details.reason, /loop already stopped/);
  } finally {
    harness.cleanup();
  }
});

test("delegated commit fails closed when a later handler mutates the admitted execution policy", async () => {
  const harness = await startDelegatedCommitHarness("post-admission-policy-drift");
  try {
    const toolCallId = "delegated-commit-post-admission-policy-drift";
    const actualInput = { ...harness.request };
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: actualInput },
      harness.ctx,
    );
    const toolCallEvent = {
      toolCallId,
      toolName: "dispatch_subagent",
      input: actualInput,
    };
    assert.equal(await harness.events.get("tool_call")[0](toolCallEvent, harness.ctx), undefined);

    // Adversarial later tool_call handler: the host executes this same mutable input object.
    toolCallEvent.input.timeout = 0;
    toolCallEvent.input.allowUnlimited = true;
    const details = settledDispatchDetails(harness, "dispatch-mutated", "attempt-mutated");
    details.executionTimeoutSeconds = 0;
    await harness.events.get("tool_result")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        input: toolCallEvent.input,
        details,
        isError: false,
      },
      harness.ctx,
    );
    await harness.events.get("tool_execution_end")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        result: { details },
        isError: false,
      },
      harness.ctx,
    );

    const completion = await harness.tools
      .get("visible_loop_child_complete")
      .execute(
        "completion-after-post-admission-policy-drift",
        { configPath: harness.configPath, iteration: 1 },
        undefined,
        undefined,
        harness.ctx,
      );
    assert.equal(completion.details.accepted, false);
    assert.match(completion.details.reason, /loop already stopped/);
    const status = readFileSync(getVisibleLoopStatusPath(harness.config, harness.env), "utf8");
    assert.match(status, /commit_delegation_execution_policy_drift_failed_closed/);
  } finally {
    harness.cleanup();
  }
});

test("cache-distinct same-process reload retains an indeterminate delegation frontier", async () => {
  const harness = await startDelegatedCommitHarness("cache-distinct-indeterminate");
  let reloaded;
  try {
    const originalToolCallId = "delegated-commit-before-cache-distinct-reload";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId: originalToolCallId, toolName: "dispatch_subagent", args: harness.request },
      harness.ctx,
    );
    assert.equal(
      await harness.events.get("tool_call")[0](
        {
          toolCallId: originalToolCallId,
          toolName: "dispatch_subagent",
          input: harness.request,
        },
        harness.ctx,
      ),
      undefined,
    );

    const snapshotPath = getActiveVisibleLoopSnapshotPath(
      harness.ctx.sessionManager.getSessionId(),
      harness.env,
    );
    const beforeReload = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(beforeReload.schemaVersion, 8);
    assert.equal(beforeReload.delegatedCommit.phase, "admitted");
    assert.equal(beforeReload.delegatedCommit.toolCallId, originalToolCallId);
    assert.deepEqual(beforeReload.delegatedCommit.admittedExecutionPolicy, {
      timeout: 1_800,
      allowUnlimited: null,
    });
    assert.equal(beforeReload.delegatedCommit.frontier.runId, beforeReload.runId);
    assert.equal(beforeReload.delegatedCommit.frontier.iteration, 1);

    reloaded = await import(
      `../src/visibleLoop.ts?delegated-reload=${Date.now()}-${Math.random()}`
    );
    const pi = { sendUserMessage() {} };
    const duplicateToolCallId = "delegated-commit-after-cache-distinct-reload";
    reloaded.handleVisibleLoopToolExecutionStart(
      { toolCallId: duplicateToolCallId, toolName: "dispatch_subagent", args: harness.request },
      pi,
      harness.ctx,
      harness.env,
    );
    const block = reloaded.handleVisibleLoopToolCall(
      { toolCallId: duplicateToolCallId, toolName: "dispatch_subagent", input: harness.request },
      pi,
      harness.ctx,
      harness.env,
    );
    assert.deepEqual(block, {
      block: true,
      reason: "visible-loop blocked an uncorrelated or duplicate delegated commit dispatch",
    });

    const afterDuplicate = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(afterDuplicate.delegatedCommit.phase, "failed_closed");
    assert.equal(afterDuplicate.delegatedCommit.toolCallId, originalToolCallId);
    assert.equal(afterDuplicate.delegatedCommit.frontier.runId, beforeReload.runId);
    const statusPath = getVisibleLoopStatusPath(harness.config, harness.env);
    const statuses = readFileSync(statusPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.equal(
      statuses.filter((entry) => entry.event === "commit_delegation_tool_call_admitted").length,
      1,
    );
    assert.ok(
      statuses.some((entry) => entry.event === "commit_delegation_duplicate_call_rejected"),
    );
  } finally {
    reloaded?.resetVisibleLoopRuntimeForRecoveryTest();
    harness.cleanup();
  }
});

test("cache-distinct reload requires the original dispatch terminal settlement", async () => {
  const harness = await startDelegatedCommitHarness("cache-distinct-terminal-settlement");
  let reloaded;
  try {
    const toolCallId = "delegated-commit-original-terminal-after-reload";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: harness.request },
      harness.ctx,
    );
    assert.equal(
      await harness.events.get("tool_call")[0](
        { toolCallId, toolName: "dispatch_subagent", input: harness.request },
        harness.ctx,
      ),
      undefined,
    );

    const snapshotPath = getActiveVisibleLoopSnapshotPath(
      harness.ctx.sessionManager.getSessionId(),
      harness.env,
    );
    reloaded = await import(
      `../src/visibleLoop.ts?delegated-terminal-reload=${Date.now()}-${Math.random()}`
    );
    const pi = { sendUserMessage() {} };
    const details = settledDispatchDetails(
      harness,
      "dispatch-after-reload",
      "attempt-after-reload",
    );
    reloaded.handleVisibleLoopToolResult(
      {
        toolCallId,
        toolName: "dispatch_subagent",
        input: harness.request,
        details,
        isError: false,
      },
      pi,
      harness.ctx,
      harness.env,
    );
    const settled = JSON.parse(readFileSync(snapshotPath, "utf8")).delegatedCommit;
    assert.equal(settled.phase, "settled");
    assert.deepEqual(settled.settledExecutionPolicy, {
      timeout: 1_800,
      allowUnlimited: null,
    });
    reloaded.handleVisibleLoopToolExecutionEnd(
      {
        toolCallId,
        toolName: "dispatch_subagent",
        result: { details },
        isError: false,
      },
      pi,
      harness.ctx,
      harness.env,
    );
    const terminal = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(terminal.delegatedCommit.phase, "succeeded");
    assert.equal(terminal.delegatedCommit.completedToolCallId, toolCallId);
    assert.equal(terminal.delegatedCommit.receipt.sessionName, details.sessionName);
    assert.equal(terminal.delegatedCommit.receipt.receiptPath, details.effectReceipt.receiptPath);
    assert.match(terminal.delegatedCommit.receipt.receiptDigest, /^[a-f0-9]{64}$/u);

    const completion = await reloaded.startVisibleLoopChildCompleteRunner(
      `${harness.configPath} --iteration 1`,
      pi,
      harness.ctx,
      harness.env,
    );
    assert.equal(completion.accepted, true);
  } finally {
    reloaded?.resetVisibleLoopRuntimeForRecoveryTest();
    harness.cleanup();
  }
});

test("cache-distinct reload rejects persisted success after ASC receipt artifact drift", async () => {
  const harness = await startDelegatedCommitHarness("reload-receipt-drift");
  let reloaded;
  try {
    const toolCallId = "delegated-commit-before-receipt-drift";
    await harness.events.get("tool_execution_start")[0](
      { toolCallId, toolName: "dispatch_subagent", args: harness.request },
      harness.ctx,
    );
    assert.equal(
      await harness.events.get("tool_call")[0](
        { toolCallId, toolName: "dispatch_subagent", input: harness.request },
        harness.ctx,
      ),
      undefined,
    );
    const details = settledDispatchDetails(
      harness,
      "dispatch-receipt-drift",
      "attempt-receipt-drift",
    );
    await harness.events.get("tool_result")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        input: harness.request,
        details,
        isError: false,
      },
      harness.ctx,
    );
    await harness.events.get("tool_execution_end")[0](
      {
        toolCallId,
        toolName: "dispatch_subagent",
        result: { details },
        isError: false,
      },
      harness.ctx,
    );
    const snapshotPath = getActiveVisibleLoopSnapshotPath(
      harness.ctx.sessionManager.getSessionId(),
      harness.env,
    );
    const beforeDrift = JSON.parse(readFileSync(snapshotPath, "utf8"));
    assert.equal(beforeDrift.delegatedCommit.phase, "succeeded");
    assert.match(beforeDrift.delegatedCommit.receipt.receiptDigest, /^[a-f0-9]{64}$/u);

    const driftedReceipt = {
      ...details.effectReceipt,
      recordedAt: "2026-08-02T07:00:01.000Z",
    };
    writeFileSync(
      details.effectReceipt.receiptPath,
      `${JSON.stringify(driftedReceipt, null, 2)}\n`,
    );
    reloaded = await import(
      `../src/visibleLoop.ts?delegated-receipt-drift=${Date.now()}-${Math.random()}`
    );
    const completion = await reloaded.startVisibleLoopChildCompleteRunner(
      `${harness.configPath} --iteration 1`,
      { sendUserMessage() {} },
      harness.ctx,
      harness.env,
    );
    assert.equal(completion.accepted, false);
    assert.match(completion.reason, /active state unavailable/);
    const statuses = readFileSync(getVisibleLoopStatusPath(harness.config, harness.env), "utf8");
    assert.doesNotMatch(statuses, /"event":"iteration_completed"/u);
  } finally {
    reloaded?.resetVisibleLoopRuntimeForRecoveryTest();
    harness.cleanup();
  }
});
