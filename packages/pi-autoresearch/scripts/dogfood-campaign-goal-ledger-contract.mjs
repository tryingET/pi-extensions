#!/usr/bin/env node
// Campaign goal ledger dogfood contract.
// Proves one package-local long-running goal accumulates progress across multiple explicit
// foreground segments and exposes legal active/paused/budget_limited/complete statuses plus an
// exact continuation call. It does not launch peers, install a daemon, mutate AK/KES, or promote.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeUrl = pathToFileURL(path.join(packageRoot, "src/runtime.ts")).href;
const tempRoot = process.env.PI_AUTORESEARCH_GOAL_LEDGER_DOGFOOD_ROOT
  ? path.resolve(process.env.PI_AUTORESEARCH_GOAL_LEDGER_DOGFOOD_ROOT)
  : mkdtempSync(path.join(os.tmpdir(), "autoresearch-goal-ledger-"));
const shouldCleanup = !process.env.PI_AUTORESEARCH_GOAL_LEDGER_DOGFOOD_ROOT;

const {
  beginAutoresearchCampaignGoal,
  buildAutoresearchCampaignGoalStatus,
  executeAutoresearchLoop,
  formatAutoresearchCampaignGoalStatus,
  setAutoresearchCampaignGoalControl,
} = await import(runtimeUrl);

const blockers = [];
const objective =
  "Dogfood a true long-running supervised autoresearch campaign goal across foreground segments.";
const metricName = "unresolved_campaign_goal_blockers";
const goalId = "dogfood-goal-ledger";

function addBlocker(id, details = undefined) {
  blockers.push(details === undefined ? id : `${id}:${JSON.stringify(details)}`);
}

function writeExecutable(cwd, name, content) {
  const target = path.join(cwd, name);
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
  return target;
}

try {
  const benchmark = writeExecutable(
    tempRoot,
    "bench.mjs",
    [
      "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
      "const statePath = 'goal-bench-state.json';",
      "const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { attempt: 0 };",
      "state.attempt += 1;",
      "writeFileSync(statePath, JSON.stringify(state));",
      "const metric = Math.max(0, 2 - state.attempt);",
      `console.log('METRIC ${metricName}=' + metric);`,
    ].join("\n"),
  );

  const created = beginAutoresearchCampaignGoal({
    cwd: tempRoot,
    objective,
    goalId,
    iterationBudget: 2,
    wallClockMinutesBudget: 5,
  });
  if (created.status !== "active") addBlocker("missing_active_status", { status: created.status });

  const first = await executeAutoresearchLoop({
    cwd: tempRoot,
    goal: objective,
    maxIterations: 1,
    name: "goal-ledger-dogfood",
    metricName,
    metricUnit: "blocker(s)",
    direction: "lower",
    metricThreshold: 0,
    benchmarkCommand: `node ${JSON.stringify(benchmark)}`,
    checksCommand: null,
    reconfigure: true,
    peerMode: "off",
    campaignGoalId: goalId,
    campaignGoalIterationBudget: 2,
    campaignGoalWallClockMinutesBudget: 5,
    stopOn: ["crash", "checks_failed", "blocked"],
  });
  if (first.campaignGoal.status !== "paused") {
    addBlocker("missing_paused_status_after_first_segment", { status: first.campaignGoal.status });
  }
  if (first.campaignGoal.usage.completedIterations !== 1) {
    addBlocker("first_segment_progress_not_recorded", first.campaignGoal.usage);
  }
  const continuation = first.campaignGoal.nextContinuationCall ?? "";
  if (!continuation.includes("autoresearch_runtime_loop")) {
    addBlocker("missing_exact_continuation_call", { continuation });
  }
  if (!continuation.includes('peerMode: "off"')) {
    addBlocker("continuation_allows_peer_or_implicit_background_behavior", { continuation });
  }

  const activeAgain = setAutoresearchCampaignGoalControl({
    cwd: tempRoot,
    action: "resume",
    reason: "dogfood explicit foreground continuation",
  });
  if (activeAgain.status !== "active") {
    addBlocker("missing_active_status_before_second_segment", { status: activeAgain.status });
  }

  const second = await executeAutoresearchLoop({
    cwd: tempRoot,
    goal: objective,
    maxIterations: 1,
    benchmarkCommand: `node ${JSON.stringify(benchmark)}`,
    checksCommand: null,
    peerMode: "off",
    campaignGoalId: goalId,
    campaignGoalIterationBudget: 2,
    campaignGoalWallClockMinutesBudget: 5,
    stopOn: ["crash", "checks_failed", "blocked"],
  });
  if (second.campaignGoal.status !== "budget_limited") {
    addBlocker("missing_budget_limited_status", { status: second.campaignGoal.status });
  }
  if (second.campaignGoal.usage.completedIterations !== 2) {
    addBlocker("multi_segment_progress_not_accumulated", second.campaignGoal.usage);
  }
  if (second.campaignGoal.usage.foregroundSegments !== 2) {
    addBlocker("foreground_segments_not_counted", second.campaignGoal.usage);
  }
  if (second.campaignGoal.nextContinuationCall !== null) {
    addBlocker("budget_limited_goal_still_has_continuation", {
      continuation: second.campaignGoal.nextContinuationCall,
    });
  }

  const complete = setAutoresearchCampaignGoalControl({
    cwd: tempRoot,
    action: "complete",
    reason: "dogfood acceptance reached",
  });
  if (complete.status !== "complete")
    addBlocker("missing_complete_status", { status: complete.status });

  const finalStatus = buildAutoresearchCampaignGoalStatus(tempRoot);
  const formatted = formatAutoresearchCampaignGoalStatus(finalStatus);
  if (!formatted.includes("foreground segments: 2")) {
    addBlocker("status_text_missing_foreground_segment_count");
  }
  if (!formatted.includes("autoresearch_runtime_control")) {
    addBlocker("status_text_missing_explicit_control_actions");
  }

  console.log("CAMPAIGN GOAL LEDGER CHECKPOINTS");
  console.log("1. active: goal ledger created with explicit iteration and wall-clock budgets");
  console.log("2. paused: first explicit foreground loop segment completed 1 iteration");
  console.log(`3. continuation: ${continuation}`);
  console.log("4. active: explicit goal_resume control action recorded before second segment");
  console.log("5. budget_limited: second foreground segment accumulated 2/2 iterations");
  console.log("6. complete: explicit goal_complete control action recorded");
  console.log(
    "7. daemon/peer boundary: no daemon, scheduler, or automatic peer launch is represented",
  );
  console.log(`METRIC unresolved_campaign_goal_blockers=${blockers.length}`);
  if (blockers.length > 0) {
    console.log(`BLOCKERS ${JSON.stringify(blockers, null, 2)}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.log("CAMPAIGN GOAL LEDGER CHECKPOINTS");
  console.log(`dogfood threw: ${error instanceof Error ? error.stack : String(error)}`);
  console.log("METRIC unresolved_campaign_goal_blockers=1");
  process.exitCode = 1;
} finally {
  if (shouldCleanup) rmSync(tempRoot, { recursive: true, force: true });
}
