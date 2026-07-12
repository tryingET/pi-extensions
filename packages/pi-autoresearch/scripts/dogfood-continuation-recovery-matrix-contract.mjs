#!/usr/bin/env node
// summary: Runs a continuation and recovery scenario matrix and writes measured campaign closeout artifacts.
// read_when:
//   - Exercising foreground resume, goal-ledger, auto-continuation, and long-campaign recovery together.
// Level-1 pi-autoresearch continuation/recovery matrix dogfood contract.
// Runs the strongest continuation-adjacent contracts as matrix cells and emits one campaign metric.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(path.dirname(scriptPath), "..");
const defaultArtifactRoot = path.join(
  packageRoot,
  ".autoresearch",
  `continuation-recovery-matrix-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}`,
);
const artifactRoot = path.resolve(
  process.env.PI_AUTORESEARCH_CONTINUATION_RECOVERY_ROOT ?? defaultArtifactRoot,
);

const controlledEnvNames = [
  "PI_AUTORESEARCH_CONTINUATION_RECOVERY_ROOT",
  "PI_AUTORESEARCH_DOGFOOD_CWD",
  "PI_AUTORESEARCH_FOREGROUND_RESUME_BENCHMARK_LOG",
  "PI_AUTORESEARCH_GOAL_LEDGER_DOGFOOD_ROOT",
  "PI_AUTORESEARCH_LONG_CAMPAIGN_DOGFOOD_ROOT",
];

const cells = [
  {
    cellId: "cell-01-01",
    scenario: "resume after budget stop",
    hypothesis:
      "Foreground resume can continue an explicitly stopped segment without daemonizing or spawning peers.",
    script: "scripts/dogfood-foreground-resume-contract.mjs",
    metricName: "unresolved_foreground_resume_blockers",
    tempPaths: [
      { envName: "PI_AUTORESEARCH_DOGFOOD_CWD", prefix: "autoresearch-continuation-resume-" },
      {
        envName: "PI_AUTORESEARCH_FOREGROUND_RESUME_BENCHMARK_LOG",
        prefix: "autoresearch-continuation-resume-log-",
        basename: "foreground-resume-benchmark.log",
      },
    ],
  },
  {
    cellId: "cell-02-01",
    scenario: "campaign goal multi-segment recovery",
    hypothesis:
      "The campaign-goal ledger can track active, paused, budget-limited, and complete posture across explicit foreground segments.",
    script: "scripts/dogfood-campaign-goal-ledger-contract.mjs",
    metricName: "unresolved_campaign_goal_blockers",
    tempPaths: [
      {
        envName: "PI_AUTORESEARCH_GOAL_LEDGER_DOGFOOD_ROOT",
        prefix: "autoresearch-continuation-goal-ledger-",
      },
    ],
  },
  {
    cellId: "cell-03-01",
    scenario: "session-local auto-continuation gates",
    hypothesis:
      "Auto-continuation can prepare visible follow-up only when session, budget, and control gates allow it.",
    script: "scripts/dogfood-auto-continuation-contract.mjs",
    metricName: "unresolved_auto_continuation_blockers",
  },
  {
    cellId: "cell-04-01",
    scenario: "long supervised campaign closeout after continuation",
    hypothesis:
      "A longer supervised campaign can continue, export candidate packets, and close out evidence handoffs without hidden peer launch or promotion.",
    script: "scripts/dogfood-long-supervised-campaign-contract.mjs",
    metricName: "unresolved_long_supervised_campaign_blockers",
    tempPaths: [
      {
        envName: "PI_AUTORESEARCH_LONG_CAMPAIGN_DOGFOOD_ROOT",
        prefix: "autoresearch-continuation-long-campaign-",
      },
    ],
  },
];

function parseMetric(output, metricName) {
  const pattern = new RegExp(`^METRIC\\s+${metricName}=(-?\\d+(?:\\.\\d+)?)\\s*$`, "mu");
  const match = output.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function prepareEnv(cell) {
  const env = {
    ...process.env,
    DOGFOOD_CONTRACT_STRICT: process.env.DOGFOOD_CONTRACT_STRICT ?? "1",
  };
  for (const envName of controlledEnvNames) delete env[envName];

  const cleanupPaths = [];
  for (const tempPath of cell.tempPaths ?? []) {
    const root = mkdtempSync(path.join(os.tmpdir(), tempPath.prefix));
    cleanupPaths.push(root);
    env[tempPath.envName] = tempPath.basename ? path.join(root, tempPath.basename) : root;
  }
  return { env, cleanupPaths };
}

function runCell(cell) {
  const { env, cleanupPaths } = prepareEnv(cell);
  try {
    const result = spawnSync(process.execPath, [cell.script], {
      cwd: packageRoot,
      encoding: "utf8",
      env,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const metric = parseMetric(output, cell.metricName);
    const signal = result.signal ?? null;
    const exitCode = result.status ?? (signal ? 1 : result.error ? 1 : 0);
    const blockers = Math.max(
      exitCode === 0 && !signal ? 0 : 1,
      metric === null || metric < 0 ? 1 : metric,
    );
    const ok = exitCode === 0 && !signal && metric === 0;
    return {
      cellId: cell.cellId,
      scenario: cell.scenario,
      hypothesis: cell.hypothesis,
      script: cell.script,
      metricName: cell.metricName,
      metric,
      exitCode,
      signal,
      blockers,
      ok,
      outputTail: output.trimEnd().split("\n").slice(-30),
    };
  } finally {
    for (const cleanupPath of cleanupPaths) rmSync(cleanupPath, { recursive: true, force: true });
  }
}

function buildPlan() {
  return {
    kind: "autoresearch.matrix_campaign_plan.v1",
    campaign: "autoresearch-continuation-recovery-matrix",
    objective:
      "Prove pi-autoresearch continuation, resume, campaign-goal, auto-continuation, dashboard/closeout recovery as a level-1 measured matrix without hidden authority mutation.",
    primaryMetric: {
      name: "autoresearch_continuation_recovery_blockers",
      direction: "lower",
      target: 0,
    },
    level: "level_1_default_route_checkpointed_command_packets_only",
    cells: cells.map((cell) => ({
      cellId: cell.cellId,
      scenario: cell.scenario,
      hypothesis: cell.hypothesis,
      metricName: cell.metricName,
      script: cell.script,
    })),
    boundaries: [
      "No hidden peer launch.",
      "No daemonized unbounded continuation.",
      "No automatic AK/KES/Oracle/Prompt Vault/ROCS mutation.",
      "No promotion, merge, or worktree cleanup automation.",
    ],
  };
}

export function runContinuationRecoveryMatrix() {
  const plan = buildPlan();
  const results = cells.map(runCell);
  const blockers = results.reduce((sum, result) => sum + result.blockers, 0);
  const closeout = {
    kind: "autoresearch.matrix_campaign_closeout.v1",
    campaign: plan.campaign,
    posture: blockers === 0 ? "target_met_level_1_recovery_ready" : "blocked",
    metric: {
      name: plan.primaryMetric.name,
      direction: "lower",
      target: 0,
      value: blockers,
      status: blockers === 0 ? "target_met" : "blocked",
    },
    cells: results,
    notDone: [
      "No hidden peer launch.",
      "No hidden benchmark/export/review chain beyond explicit child contract execution.",
      "No AK/KES/Oracle/Prompt Vault/ROCS write from runtime.",
      "No promotion, merge, or worktree cleanup automation.",
    ],
  };
  return { plan, closeout, blockers };
}

function main() {
  mkdirSync(path.join(artifactRoot, ".autoresearch"), { recursive: true });
  const { plan, closeout, blockers } = runContinuationRecoveryMatrix();
  writeFileSync(
    path.join(artifactRoot, ".autoresearch", "matrix-plan.json"),
    `${JSON.stringify(plan, null, 2)}\n`,
  );
  writeFileSync(
    path.join(artifactRoot, ".autoresearch", "campaign-closeout.json"),
    `${JSON.stringify(closeout, null, 2)}\n`,
  );
  writeFileSync(
    path.join(artifactRoot, "README.md"),
    `# autoresearch-continuation-recovery-matrix\n\nMETRIC autoresearch_continuation_recovery_blockers=${blockers}\n`,
  );
  console.log(`METRIC autoresearch_continuation_recovery_blockers=${blockers}`);
  console.log(JSON.stringify({ artifactRoot, ...closeout }, null, 2));
  if (blockers !== 0) process.exitCode = 1;
}

if (import.meta.url === `file://${scriptPath}`) main();
