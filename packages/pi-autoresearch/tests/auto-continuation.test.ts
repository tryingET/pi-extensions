import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { registerPiAutoresearchExtension } from "../extensions/pi-autoresearch.ts";
import {
  type AutoresearchCampaignGoalStatusView,
  appendReceipt,
  beginAutoresearchCampaignGoal,
  buildAutoresearchAutoContinuationDecision,
  buildAutoresearchAutoContinuationSessionGateFromEnv,
  createConfigReceipt,
  executeAutoresearchLoop,
  formatAutoresearchAutoContinuationDecision,
} from "../src/runtime.ts";

function writeExecutable(cwd: string, name: string, content: string): string {
  const target = path.join(cwd, name);
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
  return target;
}

function activeGoal(overrides: Partial<AutoresearchCampaignGoalStatusView> = {}) {
  return {
    exists: true,
    path: "/tmp/autoresearch.goal.json",
    goalId: "goal-auto",
    objective: "Continue governed autoresearch without hidden daemons",
    status: "active" as const,
    budget: { iterations: 3, wallClockSeconds: 300, tokenLikeUnits: null },
    usage: { foregroundSegments: 1, completedIterations: 1, elapsedSeconds: 30, tokenLikeUnits: 0 },
    remainingBudget: { iterations: 2, wallClockSeconds: 270, tokenLikeUnits: null },
    nextContinuationCall:
      'autoresearch_runtime_loop({ cwd: "/tmp/project", goal: "Continue governed autoresearch without hidden daemons", maxIterations: 1, campaignGoalId: "goal-auto", campaignGoalIterationBudget: 3, campaignGoalWallClockMinutesBudget: 5, campaignGoalAutoContinue: true, peerMode: "off" })',
    exactControlActions: {
      pause: 'autoresearch_runtime_control({ cwd: "/tmp/project", action: "goal_pause" })',
      resume: 'autoresearch_runtime_control({ cwd: "/tmp/project", action: "goal_resume" })',
      complete: 'autoresearch_runtime_control({ cwd: "/tmp/project", action: "goal_complete" })',
    },
    authorityWarnings: [],
    parseError: null,
    ...overrides,
  } satisfies AutoresearchCampaignGoalStatusView;
}

test("auto-continuation helper returns the exact visible follow-up call for eligible campaign goals", () => {
  const decision = buildAutoresearchAutoContinuationDecision({
    cwd: "/tmp/project",
    campaignGoal: activeGoal(),
    runtime: { machineState: "ready", controlKind: "none" },
    session: { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
  });

  assert.equal(decision.eligible, true);
  assert.deepEqual(decision.blockedReasons, []);
  assert.match(decision.exactContinuationCall ?? "", /autoresearch_runtime_loop/);
  assert.match(decision.exactContinuationCall ?? "", /peerMode: "off"/);
  assert.match(
    decision.visibleFollowUpMessage ?? "",
    /autoresearch_runtime_loop` tool is not active\/available/,
  );
  assert.match(decision.visibleFollowUpMessage ?? "", /autoresearch mutating toolbox profile/);
  assert.match(
    decision.visibleFollowUpMessage ?? "",
    /toolbox\(\{ action: "activate", bundle: "autoresearch", profile: "mutating"/,
  );
  assert.match(decision.visibleFollowUpMessage ?? "", /Exact continuation call/);
  assert.match(decision.visibleFollowUpMessage ?? "", /no hidden daemon/);
  assert.match(decision.visibleFollowUpMessage ?? "", /ASC rewind/);
});

test("auto-continuation helper formats disabled env/session gate diagnostics", () => {
  const session = buildAutoresearchAutoContinuationSessionGateFromEnv({
    env: {},
    autoContinueCount: 0,
  });
  const decision = buildAutoresearchAutoContinuationDecision({
    cwd: "/tmp/project",
    campaignGoal: activeGoal(),
    runtime: { machineState: "ready", controlKind: "none" },
    session,
  });
  const formatted = formatAutoresearchAutoContinuationDecision(decision);

  assert.equal(decision.eligible, false);
  assert.equal(decision.sessionGate.enabled, false);
  assert.equal(decision.sessionGate.envValue, null);
  assert.match(
    formatted,
    /session env gate: disabled \(PI_AUTORESEARCH_AUTO_CONTINUE=\(unset\); required PI_AUTORESEARCH_AUTO_CONTINUE=1\)/,
  );
  assert.match(formatted, /follow-up: will not be sent/);
  assert.match(formatted, /auto_continuation_disabled/);
});

test("auto-continuation helper formats enabled env/session gate diagnostics", () => {
  const session = buildAutoresearchAutoContinuationSessionGateFromEnv({
    env: { PI_AUTORESEARCH_AUTO_CONTINUE: "1", PI_AUTORESEARCH_AUTO_CONTINUE_MAX: "2" },
    autoContinueCount: 1,
  });
  const decision = buildAutoresearchAutoContinuationDecision({
    cwd: "/tmp/project",
    campaignGoal: activeGoal(),
    runtime: { machineState: "ready", controlKind: "none" },
    session,
  });
  const formatted = formatAutoresearchAutoContinuationDecision(decision);

  assert.equal(decision.eligible, true);
  assert.equal(decision.sessionGate.maxAutoContinueCount, 2);
  assert.equal(decision.sessionGate.remainingAutoContinueCount, 1);
  assert.match(
    formatted,
    /session env gate: enabled \(PI_AUTORESEARCH_AUTO_CONTINUE=1; required PI_AUTORESEARCH_AUTO_CONTINUE=1\)/,
  );
  assert.match(formatted, /session count: 1\/2 used; 1 remaining/);
  assert.match(formatted, /follow-up: will be sent after settle window/);
});

test("auto-continuation helper blocks disabled opt-in and exhausted session count", () => {
  const disabled = buildAutoresearchAutoContinuationDecision({
    cwd: "/tmp/project",
    campaignGoal: activeGoal(),
    runtime: { machineState: "ready", controlKind: "none" },
    session: { enabled: false, autoContinueCount: 0, maxAutoContinueCount: 1 },
  });
  assert.equal(disabled.eligible, false);
  assert.ok(disabled.blockedReasons.includes("auto_continuation_disabled"));
  assert.equal(disabled.exactContinuationCall, null);

  const countedOut = buildAutoresearchAutoContinuationDecision({
    cwd: "/tmp/project",
    campaignGoal: activeGoal(),
    runtime: { machineState: "ready", controlKind: "none" },
    session: { enabled: true, autoContinueCount: 1, maxAutoContinueCount: 1 },
  });
  assert.equal(countedOut.eligible, false);
  assert.ok(countedOut.blockedReasons.includes("max_auto_continue_count_reached"));
});

test("auto-continuation helper blocks goal terminal states, operator pause, runtime blockers, and missing calls", () => {
  const cases = [
    {
      name: "budget_limited",
      campaignGoal: activeGoal({
        status: "budget_limited",
        remainingBudget: { iterations: 0, wallClockSeconds: 270, tokenLikeUnits: null },
        nextContinuationCall: null,
      }),
      runtime: { machineState: "ready", controlKind: "none" },
      reason: "campaign_goal_budget_limited",
    },
    {
      name: "complete",
      campaignGoal: activeGoal({ status: "complete", nextContinuationCall: null }),
      runtime: { machineState: "ready", controlKind: "none" },
      reason: "campaign_goal_complete",
    },
    {
      name: "operator paused",
      campaignGoal: activeGoal({ status: "paused" }),
      runtime: { machineState: "ready", controlKind: "none" },
      reason: "campaign_goal_not_active",
    },
    {
      name: "runtime blocked",
      campaignGoal: activeGoal(),
      runtime: { machineState: "blocked", controlKind: "none", blockedReason: "posture gate" },
      reason: "runtime_blocked",
    },
    {
      name: "control blocked",
      campaignGoal: activeGoal(),
      runtime: { machineState: "ready", controlKind: "awaiting_operator" },
      reason: "operator_control_blocking",
    },
    {
      name: "missing continuation call",
      campaignGoal: activeGoal({ nextContinuationCall: null }),
      runtime: { machineState: "ready", controlKind: "none" },
      reason: "campaign_goal_missing_continuation_call",
    },
    {
      name: "missing auto-continue policy consent",
      campaignGoal: activeGoal({
        nextContinuationCall:
          'autoresearch_runtime_loop({ cwd: "/tmp/project", goal: "Manual", maxIterations: 1, campaignGoalId: "goal-auto", campaignGoalIterationBudget: 3, peerMode: "off" })',
      }),
      runtime: { machineState: "ready", controlKind: "none" },
      reason: "campaign_goal_auto_continue_not_consented",
    },
  ] as const;

  for (const entry of cases) {
    const decision = buildAutoresearchAutoContinuationDecision({
      cwd: "/tmp/project",
      campaignGoal: entry.campaignGoal,
      runtime: entry.runtime,
      session: { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
    });
    assert.equal(decision.eligible, false, entry.name);
    assert.ok(decision.blockedReasons.includes(entry.reason), entry.name);
    assert.equal(decision.exactContinuationCall, null, entry.name);
  }
});

test("extension hook sends one follow-up user message after settled eligible agent_end", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-auto-extension-"));
  const previousEnabled = process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
  const previousSettle = process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS;
  const sentUserMessages: Array<{ content: string; options: unknown }> = [];
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  try {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "auto-continuation-extension",
        metricName: "remaining_blockers",
        metricUnit: "count",
        direction: "lower",
        benchmarkCommand: "node bench.mjs",
        createdAt: 1,
      }),
    );
    beginAutoresearchCampaignGoal({
      cwd,
      objective: "Continue via extension sendUserMessage",
      goalId: "goal-extension-auto",
      iterationBudget: 3,
      autoContinue: true,
      now: 2,
    });

    process.env.PI_AUTORESEARCH_AUTO_CONTINUE = "1";
    process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS = "0";
    registerPiAutoresearchExtension({
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
      registerCommand() {},
      registerTool() {},
      sendUserMessage(content: string, options: unknown) {
        sentUserMessages.push({ content, options });
      },
    } as never);

    handlers.get("agent_end")?.({}, { cwd });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(sentUserMessages.length, 1);
    assert.match(sentUserMessages[0]?.content, /PI-AUTORESEARCH AUTO-CONTINUATION REQUEST/);
    assert.match(
      sentUserMessages[0]?.content,
      /autoresearch_runtime_loop` tool is not active\/available/,
    );
    assert.match(sentUserMessages[0]?.content, /autoresearch mutating toolbox profile/);
    assert.match(sentUserMessages[0]?.content, /autoresearch_runtime_loop/);
    assert.match(sentUserMessages[0]?.content, /peerMode: "off"/);
    assert.deepEqual(sentUserMessages[0]?.options, { deliverAs: "followUp" });

    handlers.get("agent_end")?.({}, { cwd });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sentUserMessages.length, 1, "default max count allows only one send");
  } finally {
    if (previousEnabled === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE = previousEnabled;
    if (previousSettle === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS = previousSettle;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("extension hook cancels pending auto-continuation on a new agent_start before count increments", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-auto-cancel-"));
  const previousEnabled = process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
  const previousSettle = process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS;
  const sentUserMessages: string[] = [];
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  try {
    appendReceipt(
      cwd,
      createConfigReceipt({
        name: "auto-continuation-cancel",
        metricName: "remaining_blockers",
        metricUnit: "count",
        direction: "lower",
        benchmarkCommand: "node bench.mjs",
        createdAt: 1,
      }),
    );
    beginAutoresearchCampaignGoal({
      cwd,
      objective: "Cancel pending auto-continuation",
      goalId: "goal-extension-cancel",
      iterationBudget: 3,
      autoContinue: true,
      now: 2,
    });

    process.env.PI_AUTORESEARCH_AUTO_CONTINUE = "1";
    process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS = "50";
    registerPiAutoresearchExtension({
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
      registerCommand() {},
      registerTool() {},
      sendUserMessage(content: string) {
        sentUserMessages.push(content);
      },
    } as never);

    handlers.get("agent_end")?.({}, { cwd });
    handlers.get("agent_start")?.({}, { cwd });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(sentUserMessages.length, 0);
  } finally {
    if (previousEnabled === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE = previousEnabled;
    if (previousSettle === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS = previousSettle;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("actual loop rejects campaignGoalAutoContinue without an explicit campaign goal budget", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-auto-no-budget-"));
  try {
    await assert.rejects(
      () =>
        executeAutoresearchLoop({
          cwd,
          goal: "Auto-continue must be budget bounded",
          maxIterations: 1,
          name: "auto-continue-no-budget",
          metricName: "remaining_blockers",
          metricUnit: "count",
          direction: "lower",
          benchmarkCommand: "node bench.mjs",
          checksCommand: null,
          reconfigure: true,
          peerMode: "off",
          campaignGoalId: "goal-no-budget-auto",
          campaignGoalAutoContinue: true,
        }),
      /campaignGoalAutoContinue requires an explicit package-local campaign goal budget/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("actual loop with campaignGoalAutoContinue stays active and extension sends follow-up", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-auto-loop-"));
  const previousEnabled = process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
  const previousSettle = process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS;
  const sentUserMessages: Array<{ content: string; options: unknown }> = [];
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  try {
    const benchmark = writeExecutable(
      cwd,
      "bench.mjs",
      'console.log("METRIC remaining_blockers=1");\n',
    );
    const loop = await executeAutoresearchLoop({
      cwd,
      goal: "Actual auto-continue campaign goal",
      maxIterations: 1,
      name: "actual-auto-continue",
      metricName: "remaining_blockers",
      metricUnit: "count",
      direction: "lower",
      benchmarkCommand: `node ${JSON.stringify(benchmark)}`,
      checksCommand: null,
      reconfigure: true,
      peerMode: "off",
      campaignGoalId: "goal-actual-auto",
      campaignGoalIterationBudget: 3,
      campaignGoalAutoContinue: true,
    });
    assert.equal(loop.campaignGoal.status, "active");
    assert.match(loop.campaignGoal.nextContinuationCall ?? "", /campaignGoalAutoContinue: true/);

    process.env.PI_AUTORESEARCH_AUTO_CONTINUE = "1";
    process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS = "0";
    registerPiAutoresearchExtension({
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
      registerCommand() {},
      registerTool() {},
      sendUserMessage(content: string, options: unknown) {
        sentUserMessages.push({ content, options });
      },
    } as never);

    handlers.get("agent_end")?.({}, { cwd });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(sentUserMessages.length, 1);
    assert.match(
      sentUserMessages[0]?.content,
      /autoresearch_runtime_loop` tool is not active\/available/,
    );
    assert.match(sentUserMessages[0]?.content, /autoresearch mutating toolbox profile/);
    assert.match(sentUserMessages[0]?.content, /autoresearch_runtime_loop/);
    assert.match(sentUserMessages[0]?.content, /campaignGoalAutoContinue: true/);
    assert.deepEqual(sentUserMessages[0]?.options, { deliverAs: "followUp" });
  } finally {
    if (previousEnabled === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE = previousEnabled;
    if (previousSettle === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS = previousSettle;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("actual loop without campaignGoalAutoContinue stays paused and extension does not follow up", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-manual-loop-"));
  const previousEnabled = process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
  const previousSettle = process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS;
  const sentUserMessages: string[] = [];
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  try {
    const benchmark = writeExecutable(
      cwd,
      "bench.mjs",
      'console.log("METRIC remaining_blockers=1");\n',
    );
    const loop = await executeAutoresearchLoop({
      cwd,
      goal: "Manual campaign goal remains paused",
      maxIterations: 1,
      name: "manual-auto-continue-disabled",
      metricName: "remaining_blockers",
      metricUnit: "count",
      direction: "lower",
      benchmarkCommand: `node ${JSON.stringify(benchmark)}`,
      checksCommand: null,
      reconfigure: true,
      peerMode: "off",
      campaignGoalId: "goal-manual-auto",
      campaignGoalIterationBudget: 3,
    });
    assert.equal(loop.campaignGoal.status, "paused");
    assert.doesNotMatch(loop.campaignGoal.nextContinuationCall ?? "", /campaignGoalAutoContinue/);

    process.env.PI_AUTORESEARCH_AUTO_CONTINUE = "1";
    process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS = "0";
    registerPiAutoresearchExtension({
      on(event: string, handler: (...args: unknown[]) => unknown) {
        handlers.set(event, handler);
      },
      registerCommand() {},
      registerTool() {},
      sendUserMessage(content: string) {
        sentUserMessages.push(content);
      },
    } as never);

    handlers.get("agent_end")?.({}, { cwd });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(sentUserMessages.length, 0);
  } finally {
    if (previousEnabled === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE = previousEnabled;
    if (previousSettle === undefined) delete process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS;
    else process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS = previousSettle;
    rmSync(cwd, { recursive: true, force: true });
  }
});
