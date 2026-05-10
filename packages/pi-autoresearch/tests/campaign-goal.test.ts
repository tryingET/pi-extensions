import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  beginAutoresearchCampaignGoal,
  buildAutoresearchCampaignGoalStatus,
  executeAutoresearchLoop,
  setAutoresearchCampaignGoalControl,
} from "../src/runtime.ts";

function writeExecutable(cwd: string, name: string, content: string): string {
  const target = path.join(cwd, name);
  writeFileSync(target, content, "utf8");
  chmodSync(target, 0o755);
  return target;
}

test("campaign goal ledger accumulates multiple foreground segments with legal statuses", async () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "autoresearch-campaign-goal-"));
  try {
    const objective = "Reduce campaign goal blockers without hidden daemon behavior";
    const metricName = "unresolved_campaign_goal_blockers";
    const benchmark = writeExecutable(
      cwd,
      "bench.mjs",
      [
        "import { existsSync, readFileSync, writeFileSync } from 'node:fs';",
        "const statePath = 'bench-state.json';",
        "const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : { attempt: 0 };",
        "state.attempt += 1;",
        "writeFileSync(statePath, JSON.stringify(state));",
        `console.log('METRIC ${metricName}=' + Math.max(0, 2 - state.attempt));`,
      ].join("\n"),
    );

    const created = beginAutoresearchCampaignGoal({
      cwd,
      objective,
      goalId: "goal-test",
      iterationBudget: 2,
      wallClockMinutesBudget: 5,
    });
    assert.equal(created.status, "active");

    const first = await executeAutoresearchLoop({
      cwd,
      goal: objective,
      maxIterations: 1,
      name: "campaign-goal-test",
      metricName,
      metricUnit: "blocker(s)",
      direction: "lower",
      metricThreshold: 0,
      benchmarkCommand: `node ${JSON.stringify(benchmark)}`,
      checksCommand: null,
      reconfigure: true,
      peerMode: "off",
      campaignGoalId: "goal-test",
      campaignGoalIterationBudget: 2,
      campaignGoalWallClockMinutesBudget: 5,
      stopOn: ["crash", "checks_failed", "blocked"],
    });
    assert.equal(first.completedIterations, 1);
    assert.equal(first.campaignGoal.status, "paused");
    assert.equal(first.campaignGoal.usage.completedIterations, 1);
    assert.equal(first.campaignGoal.usage.foregroundSegments, 1);
    assert.match(first.campaignGoal.nextContinuationCall ?? "", /autoresearch_runtime_loop/);
    assert.match(first.campaignGoal.nextContinuationCall ?? "", /peerMode: "off"/);

    const resumed = setAutoresearchCampaignGoalControl({ cwd, action: "resume" });
    assert.equal(resumed.status, "active");

    const second = await executeAutoresearchLoop({
      cwd,
      goal: objective,
      maxIterations: 1,
      benchmarkCommand: `node ${JSON.stringify(benchmark)}`,
      checksCommand: null,
      peerMode: "off",
      campaignGoalId: "goal-test",
      campaignGoalIterationBudget: 2,
      campaignGoalWallClockMinutesBudget: 5,
      stopOn: ["crash", "checks_failed", "blocked"],
    });
    assert.equal(second.completedIterations, 1);
    assert.equal(second.campaignGoal.status, "budget_limited");
    assert.equal(second.campaignGoal.usage.completedIterations, 2);
    assert.equal(second.campaignGoal.usage.foregroundSegments, 2);
    assert.equal(second.campaignGoal.nextContinuationCall, null);

    const complete = setAutoresearchCampaignGoalControl({ cwd, action: "complete" });
    assert.equal(complete.status, "complete");
    const status = buildAutoresearchCampaignGoalStatus(cwd);
    assert.equal(status.status, "complete");
    assert.equal(status.usage.completedIterations, 2);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
