import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendReceipt, createConfigReceipt, createRunReceipt } from "../src/core/runtime.ts";
import { buildAutoresearchCandidateResultPacket } from "../src/core/runtime-candidate-result.ts";
export function withDashboardDir(fn: (cwd: string) => void): void {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "observatory-fixture-"));
  try {
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
export function writeDashboardSource(cwd: string, relative: string, value: unknown): string {
  const file = path.join(cwd, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
  return file;
}
export const PACKET = ".autoresearch/matrix-campaign/cell-01-01/candidate-01.candidate-result.json";
export const OBJECTIVE = "Exact research objective";
export function writeDashboardPlan(
  cwd: string,
  packets = [PACKET],
  taskId = 5621,
  objective = OBJECTIVE,
) {
  return writeDashboardSource(cwd, `.autoresearch/campaigns/${taskId}/plan.json`, {
    kind: "autoresearch.matrix_campaign_plan.v1",
    taskId,
    cwd,
    objective,
    cells: [
      {
        cellId: "cell-01-01",
        scenario: "50k nested rename",
        hypothesis: "Batched indexing reduces latency",
        prediction: "Lower total_ms with unchanged checks",
        candidateResultPacketPaths: packets,
      },
    ],
  });
}
export function measuredPacket(cwd: string) {
  appendReceipt(
    cwd,
    createConfigReceipt({
      name: OBJECTIVE,
      metricName: "total_ms",
      metricUnit: "ms",
      direction: "lower",
      benchmarkCommand: "node benchmark.mjs",
      checksCommand: "node checks.mjs",
      createdAt: 1,
    }),
  );
  const candidate = {
    source: "candidate_peer_spawn" as const,
    worktreePath: `${cwd}/candidate`,
    branch: "candidate-01",
    baseRef: "a".repeat(40),
    diffSummary: "Index update only",
    filesChanged: ["index.ts"],
  };
  for (const [iteration, metric] of [
    [1, 100],
    [2, 110],
  ])
    appendReceipt(
      cwd,
      createRunReceipt({
        status: "keep",
        metric,
        iteration,
        description: `attempt ${iteration}`,
        timestamp: 1000 + iteration,
        checksCommand: "node checks.mjs",
        checksPassed: true,
        empiricalDecisionClass: "candidate_regression",
        experiment: {
          hypothesis: "Batched indexing reduces latency",
          expectedPrimaryEffect: "Lower total_ms",
          candidate,
        },
      }),
    );
  return buildAutoresearchCandidateResultPacket(cwd);
}
export function level4Envelope(cwd: string, result: unknown, objective = OBJECTIVE, taskId = 5621) {
  return {
    kind: "autoresearch.level4_dashboard_observation.v1",
    observedAt: "2026-09-10T00:00:00.000Z",
    taskId,
    cwd,
    objective,
    nonAuthority: true,
    execution: "not_executed_by_orchestrator",
    result,
  };
}
export function level4Path(objective = OBJECTIVE, taskId = 5621) {
  return `.autoresearch/dashboard/level4/${taskId}-${createHash("sha256").update(objective).digest("hex")}.json`;
}
