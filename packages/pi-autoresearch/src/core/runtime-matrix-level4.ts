import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  cellFor,
  createCampaign,
  laneFor,
  packetPath,
  summarizeMatrixArtifact,
} from "./runtime-matrix-cells.ts";
import {
  getArrayField as arr,
  getNumberField as num,
  getRecordField as rec,
  record,
  getStringField as str,
  getStringArrayField as strings,
} from "./runtime-matrix-fields.ts";
import type { DashboardCampaign } from "./runtime-matrix-model.ts";

const ENVELOPE = "autoresearch.level4_dashboard_observation.v1";
export function projectLevel4Observation(
  value: unknown,
  cwd: string,
  source: string,
): DashboardCampaign {
  const taskId = num(value, "taskId");
  const objective = str(value, "objective");
  const observedAt = str(value, "observedAt");
  const result = rec(value, "result");
  if (
    str(value, "kind") !== ENVELOPE ||
    !taskId ||
    !Number.isSafeInteger(taskId) ||
    taskId <= 0 ||
    !objective ||
    !observedAt ||
    !/^\d{4}-\d\d-\d\dT.*Z$/u.test(observedAt) ||
    !Number.isFinite(Date.parse(observedAt)) ||
    new Date(observedAt).toISOString() !== observedAt ||
    str(value, "cwd") !== cwd ||
    record(value)?.nonAuthority !== true ||
    str(value, "execution") !== "not_executed_by_orchestrator"
  )
    throw new Error("Malformed or identity-mismatched Level 4 envelope.");
  const expected = `${taskId}-${createHash("sha256").update(objective, "utf8").digest("hex")}.json`;
  if (path.basename(source) !== expected)
    throw new Error("Level 4 filename/task/exact-objective digest mismatch.");
  if (
    str(result, "kind") !== "autoresearch.level4_autoresearch_campaign_runner.v1" ||
    str(result, "execution") !== "not_executed_by_orchestrator" ||
    num(result, "taskId") !== taskId ||
    str(result, "objective") !== objective
  )
    throw new Error("Level 4 owner result identity or execution boundary mismatch.");
  const ownerCwd = str(result, "cwd");
  // Relative cwd cannot be resolved without knowing the producer process's original cwd.
  if (!ownerCwd || !path.isAbsolute(ownerCwd) || realpathSync(ownerCwd) !== cwd)
    throw new Error("Level 4 result cwd is mismatched or unresolved (relative cwd).");
  const executor = rec(result, "sourceLevel3Executor");
  const runner = rec(executor, "level3Runner");
  const bundle = rec(result, "promptRunnerBundle");
  const closeout = rec(bundle, "candidateCloseoutPacket");
  const inventory = rec(closeout, "packetInventory");
  const watch = rec(bundle, "visibleLaunchWatchPlan");
  if (
    str(executor, "kind") !== "autoresearch.level3_matrix_cell_executor.v1" ||
    num(executor, "taskId") !== taskId ||
    str(executor, "objective") !== objective ||
    str(executor, "cwd") !== ownerCwd ||
    str(runner, "kind") !== "autoresearch.matrix_campaign_runner_checkpoint.v1" ||
    num(runner, "taskId") !== taskId ||
    str(runner, "cwd") !== ownerCwd ||
    str(runner, "objective") !== objective ||
    str(bundle, "kind") !== "autoresearch.level4_prompt_runner_bundle.v1" ||
    str(closeout, "kind") !== "autoresearch.level4_visible_candidate_closeout_packet.v1" ||
    str(closeout, "execution") !== "plan_only_controller_verified_closeout" ||
    !Array.isArray(inventory?.rows) ||
    !Array.isArray(watch?.lanePlans) ||
    !Array.isArray(bundle?.promptBundle)
  )
    throw new Error("Malformed Level 4 nested owner projection.");
  const completed = num(result, "completedActionCount");
  if (
    completed === null ||
    !Number.isSafeInteger(completed) ||
    completed < 0 ||
    !str(result, "posture")
  )
    throw new Error("Malformed Level 4 controller cursor/posture.");
  const campaign = createCampaign(JSON.stringify([taskId, cwd, objective]), cwd, taskId, objective);
  campaign.declaredLevel = "Level 4 observation";
  campaign.execution = "not_executed_by_orchestrator";
  campaign.observedAt = observedAt;
  campaign.reportedPosture = str(result, "posture");
  campaign.controllerCompletedActionCount = completed;
  campaign.nextActor = "External controller";
  campaign.nextAction = str(result, "nextStep") ?? "Inspect owner blockers and exact gates.";
  campaign.sourcePaths = [source];
  campaign.ownerReports = [result];
  summarizeMatrixArtifact(campaign, runner, source);
  // The checkpoint is the actual sourceLevel3Executor.level3Runner, not a fabricated level3 cells object.
  for (const row of arr(inventory, "rows")) {
    const cellId = str(row, "cellId");
    const laneId = str(row, "laneId");
    const packet = packetPath(campaign, str(row, "packetPath"));
    if (
      !cellId ||
      !laneId ||
      !packet ||
      typeof record(row)?.controllerVerified !== "boolean" ||
      typeof record(row)?.measuredPacket !== "boolean"
    )
      throw new Error("Malformed Level 4 packet inventory row.");
    const cell = cellFor(campaign, cellId);
    const lane = laneFor(cell, laneId, packet);
    lane.reportedState = str(row, "status") ?? "unknown";
    lane.verificationReport = `Owner reports controllerVerified=${String(record(row)?.controllerVerified)}, measuredPacket=${String(record(row)?.measuredPacket)}; not independently authenticated.`;
    lane.verificationReport += strings(row, "verificationIssues").length
      ? ` Issues: ${strings(row, "verificationIssues").join("; ")}`
      : "";
  }
  for (const row of arr(watch, "lanePlans")) {
    const cellId = str(row, "cellId");
    const laneId = str(row, "laneId");
    if (!cellId || !laneId || !str(row, "state"))
      throw new Error("Malformed Level 4 launch/watch lane.");
    const lane = laneFor(cellFor(campaign, cellId), laneId);
    lane.reportedState += `; launch/watch plan: ${str(row, "state")}`;
  }
  for (const row of arr(bundle, "promptBundle")) {
    const cellId = str(row, "cellId");
    const laneId = str(row, "laneId");
    if (!cellId || !laneId) throw new Error("Malformed Level 4 prompt lane.");
    const cell = cellFor(campaign, cellId);
    const lane = laneFor(cell, laneId);
    lane.objective = str(row, "objective");
    lane.promptTitle = str(row, "promptTitle");
    lane.promptMarkdown = str(row, "promptMarkdown");
    // Prompt prose isn't parsed into hypotheses or rejection rules.
    if (!cell.objective) cell.objective = str(row, "objective");
  }
  campaign.issues.push(
    ...strings(rec(watch, "metric"), "blockers"),
    ...strings(rec(closeout, "metric"), "blockers"),
  );
  const ownerBlockers = num(rec(result, "metric"), "value");
  if (ownerBlockers !== null && ownerBlockers > 0)
    campaign.issues.push(
      `Owner reports ${ownerBlockers} Level 4 automation blockers (workflow count, not candidate performance).`,
    );
  if (Date.parse(observedAt) > Date.now())
    campaign.issues.push("Observation timestamp is in the future; freshness unresolved.");
  campaign.nextAction = str(result, "nextStep") ?? campaign.nextAction;
  return campaign;
}
