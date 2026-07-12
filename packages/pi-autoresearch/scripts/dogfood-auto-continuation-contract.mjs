#!/usr/bin/env node
// summary: Verifies campaign-goal auto-continuation eligibility, budgets, status diagnostics, and refusal gates.
// read_when:
//   - Testing visible session-local continuation without daemon, peer, or authority mutation.
// Campaign-goal auto-continuation dogfood contract.
// Proves an actual loop with campaignGoalAutoContinue keeps the goal active and eligible for one
// visible exact follow-up call while disabled/manual and blocked states refuse continuation. It does
// not install a daemon, spawn peers, run the continuation, use ASC rewind, mutate AK/KES/Oracle, or
// promote candidates.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeUrl = pathToFileURL(path.join(packageRoot, "src/runtime.ts")).href;
const {
  buildAutoresearchAutoContinuationDecision,
  buildAutoresearchRuntimeStatus,
  executeAutoresearchLoop,
  formatAutoresearchAutoContinuationDecision,
  formatAutoresearchCampaignGoalStatus,
  formatAutoresearchStatusText,
} = await import(runtimeUrl);

const blockers = [];
const cwd = "/tmp/pi-autoresearch-auto-continuation-dogfood";
const exactCall = `autoresearch_runtime_loop({ cwd: ${JSON.stringify(cwd)}, goal: "Dogfood governed auto-continuation", maxIterations: 1, campaignGoalId: "goal-dogfood-auto", campaignGoalIterationBudget: 3, campaignGoalAutoContinue: true, peerMode: "off" })`;

function addBlocker(id, details = undefined) {
  blockers.push(details === undefined ? id : `${id}:${JSON.stringify(details)}`);
}

function writeExecutable(cwd, name, content) {
  const target = path.join(cwd, name);
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
  return target;
}

function goal(overrides = {}) {
  return {
    exists: true,
    path: path.join(cwd, "autoresearch.goal.json"),
    goalId: "goal-dogfood-auto",
    objective: "Dogfood governed auto-continuation",
    status: "active",
    budget: { iterations: 3, wallClockSeconds: null, tokenLikeUnits: null },
    usage: { foregroundSegments: 1, completedIterations: 1, elapsedSeconds: 10, tokenLikeUnits: 0 },
    remainingBudget: { iterations: 2, wallClockSeconds: null, tokenLikeUnits: null },
    nextContinuationCall: exactCall,
    exactControlActions: {
      pause: `autoresearch_runtime_control({ cwd: ${JSON.stringify(cwd)}, action: "goal_pause" })`,
      resume: `autoresearch_runtime_control({ cwd: ${JSON.stringify(cwd)}, action: "goal_resume" })`,
      complete: `autoresearch_runtime_control({ cwd: ${JSON.stringify(cwd)}, action: "goal_complete" })`,
    },
    authorityWarnings: [],
    parseError: null,
    ...overrides,
  };
}

try {
  const eligible = buildAutoresearchAutoContinuationDecision({
    cwd,
    campaignGoal: goal(),
    runtime: { machineState: "ready", controlKind: "none" },
    session: { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.exactContinuationCall, exactCall);
  assert.match(
    eligible.visibleFollowUpMessage,
    /autoresearch_runtime_loop` tool is not active\/available/,
  );
  assert.match(eligible.visibleFollowUpMessage, /autoresearch mutating toolbox profile/);
  assert.match(
    eligible.visibleFollowUpMessage,
    /toolbox\(\{ action: "activate", bundle: "autoresearch", profile: "mutating"/,
  );
  assert.match(eligible.visibleFollowUpMessage, /Exact continuation call/);
  assert.match(eligible.visibleFollowUpMessage, /no hidden daemon/);
  assert.match(eligible.visibleFollowUpMessage, /ASC rewind/);

  const disabledDiagnostic = formatAutoresearchAutoContinuationDecision(
    buildAutoresearchAutoContinuationDecision({
      cwd,
      campaignGoal: goal(),
      runtime: { machineState: "ready", controlKind: "none" },
      session: { enabled: false, envValue: null, autoContinueCount: 0, maxAutoContinueCount: 1 },
    }),
  );
  if (!disabledDiagnostic.includes("PI_AUTORESEARCH_AUTO_CONTINUE=(unset)")) {
    addBlocker("disabled_env_gate_not_diagnostic", disabledDiagnostic);
  }

  const noBudgetCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-auto-no-budget-dogfood-"));
  try {
    await assert.rejects(
      () =>
        executeAutoresearchLoop({
          cwd: noBudgetCwd,
          goal: "Dogfood auto-continuation must be budget bounded",
          maxIterations: 1,
          name: "dogfood-auto-no-budget",
          metricName: "remaining_blockers",
          metricUnit: "count",
          direction: "lower",
          benchmarkCommand: "node bench.mjs",
          checksCommand: null,
          reconfigure: true,
          peerMode: "off",
          campaignGoalId: "goal-dogfood-no-budget-auto",
          campaignGoalAutoContinue: true,
        }),
      /campaignGoalAutoContinue requires an explicit package-local campaign goal budget/,
    );
  } finally {
    rmSync(noBudgetCwd, { recursive: true, force: true });
  }

  const actualCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-auto-dogfood-"));
  try {
    const benchmark = writeExecutable(
      actualCwd,
      "bench.mjs",
      'console.log("METRIC remaining_blockers=1");\n',
    );
    const actualLoop = await executeAutoresearchLoop({
      cwd: actualCwd,
      goal: "Dogfood actual auto-continuation loop",
      maxIterations: 1,
      name: "dogfood-actual-auto-continuation",
      metricName: "remaining_blockers",
      metricUnit: "count",
      direction: "lower",
      benchmarkCommand: `node ${JSON.stringify(benchmark)}`,
      checksCommand: null,
      reconfigure: true,
      peerMode: "off",
      campaignGoalId: "goal-dogfood-actual-auto",
      campaignGoalIterationBudget: 3,
      campaignGoalAutoContinue: true,
    });
    if (actualLoop.campaignGoal.status !== "active") {
      addBlocker("actual_loop_auto_continue_not_active", actualLoop.campaignGoal);
    }
    const actualDecision = buildAutoresearchAutoContinuationDecision({
      cwd: actualCwd,
      campaignGoal: actualLoop.campaignGoal,
      runtime: {
        machineState: actualLoop.status.runtimeProjection.state,
        controlKind: actualLoop.status.control.kind,
      },
      session: { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
    });
    if (!actualDecision.eligible || !actualDecision.exactContinuationCall) {
      addBlocker("actual_loop_auto_continue_not_eligible", actualDecision);
    }
    if (!String(actualDecision.exactContinuationCall).includes("campaignGoalAutoContinue: true")) {
      addBlocker("actual_loop_continuation_drops_auto_continue_policy", actualDecision);
    }
    const actualStatus = buildAutoresearchRuntimeStatus(actualCwd, {
      persistSnapshot: false,
      autoContinuationSession: {
        enabled: true,
        envValue: "1",
        autoContinueCount: 0,
        maxAutoContinueCount: 1,
      },
    });
    const actualStatusText = formatAutoresearchStatusText(actualStatus);
    const actualGoalText = formatAutoresearchCampaignGoalStatus(actualStatus.campaignGoal, {
      autoContinuation: actualStatus.autoContinuation,
    });
    if (!actualStatusText.includes("auto-continuation eligible: yes")) {
      addBlocker("status_surface_missing_auto_continuation_eligibility", actualStatusText);
    }
    if (!actualStatusText.includes("PI_AUTORESEARCH_AUTO_CONTINUE=1")) {
      addBlocker("status_surface_missing_env_gate", actualStatusText);
    }
    if (!actualGoalText.includes("Auto-continuation eligibility")) {
      addBlocker("campaign_goal_surface_missing_auto_continuation_section", actualGoalText);
    }
  } finally {
    rmSync(actualCwd, { recursive: true, force: true });
  }

  const manualCwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-manual-dogfood-"));
  try {
    const benchmark = writeExecutable(
      manualCwd,
      "bench.mjs",
      'console.log("METRIC remaining_blockers=1");\n',
    );
    const manualLoop = await executeAutoresearchLoop({
      cwd: manualCwd,
      goal: "Dogfood manual continuation remains paused",
      maxIterations: 1,
      name: "dogfood-manual-continuation",
      metricName: "remaining_blockers",
      metricUnit: "count",
      direction: "lower",
      benchmarkCommand: `node ${JSON.stringify(benchmark)}`,
      checksCommand: null,
      reconfigure: true,
      peerMode: "off",
      campaignGoalId: "goal-dogfood-manual",
      campaignGoalIterationBudget: 3,
    });
    if (manualLoop.campaignGoal.status !== "paused") {
      addBlocker("manual_loop_did_not_pause", manualLoop.campaignGoal);
    }
    const manualDecision = buildAutoresearchAutoContinuationDecision({
      cwd: manualCwd,
      campaignGoal: manualLoop.campaignGoal,
      runtime: {
        machineState: manualLoop.status.runtimeProjection.state,
        controlKind: manualLoop.status.control.kind,
      },
      session: { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
    });
    if (manualDecision.eligible) {
      addBlocker("manual_loop_auto_continued_without_policy", manualDecision);
    }
  } finally {
    rmSync(manualCwd, { recursive: true, force: true });
  }

  const blockedCases = [
    [
      "disabled",
      goal(),
      { machineState: "ready", controlKind: "none" },
      { enabled: false, autoContinueCount: 0, maxAutoContinueCount: 1 },
    ],
    [
      "budget_limited",
      goal({
        status: "budget_limited",
        remainingBudget: { iterations: 0, wallClockSeconds: null, tokenLikeUnits: null },
        nextContinuationCall: null,
      }),
      { machineState: "ready", controlKind: "none" },
      { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
    ],
    [
      "complete",
      goal({ status: "complete", nextContinuationCall: null }),
      { machineState: "ready", controlKind: "none" },
      { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
    ],
    [
      "operator_paused",
      goal({ status: "paused" }),
      { machineState: "ready", controlKind: "none" },
      { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
    ],
    [
      "runtime_control",
      goal(),
      { machineState: "ready", controlKind: "awaiting_operator" },
      { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
    ],
    [
      "max_count",
      goal(),
      { machineState: "ready", controlKind: "none" },
      { enabled: true, autoContinueCount: 1, maxAutoContinueCount: 1 },
    ],
    [
      "missing_call",
      goal({ nextContinuationCall: null }),
      { machineState: "ready", controlKind: "none" },
      { enabled: true, autoContinueCount: 0, maxAutoContinueCount: 1 },
    ],
  ];

  for (const [name, campaignGoal, runtime, session] of blockedCases) {
    const decision = buildAutoresearchAutoContinuationDecision({
      cwd,
      campaignGoal,
      runtime,
      session,
    });
    if (decision.eligible || decision.exactContinuationCall !== null) {
      addBlocker("blocked_case_continued", { name, decision });
    }
  }

  console.log("AUTO-CONTINUATION CHECKPOINTS");
  console.log(`1. eligible exact call: ${eligible.exactContinuationCall}`);
  console.log(
    "2. visible message includes toolbox mutating-profile preflight, exact call, no-daemon boundary, and ASC boundary",
  );
  console.log("3. campaignGoalAutoContinue without an explicit campaign goal budget is rejected");
  console.log("4. actual loop with campaignGoalAutoContinue remains active and eligible");
  console.log("5. actual loop without campaignGoalAutoContinue remains paused and ineligible");
  console.log(
    "6. disabled/budget_limited/complete/operator_paused/runtime_control/max_count/missing_call are blocked",
  );
  console.log("7. status/campaign-goal surfaces expose env/session gate diagnostics");
  console.log(
    "8. no peer spawn, daemon install, continuation execution, ASC rewind, AK/KES/Oracle write, or promotion occurs",
  );
  console.log(`METRIC unresolved_auto_continuation_blockers=${blockers.length}`);
  if (blockers.length > 0) {
    console.log(`BLOCKERS ${JSON.stringify(blockers, null, 2)}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.log("AUTO-CONTINUATION CHECKPOINTS");
  console.log(`dogfood threw: ${error instanceof Error ? error.stack : String(error)}`);
  console.log("METRIC unresolved_auto_continuation_blockers=1");
  process.exitCode = 1;
}
