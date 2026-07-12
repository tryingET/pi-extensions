#!/usr/bin/env node
// summary: Aggregates strict autoresearch product dogfood contracts under suite-owned temporary paths.
// read_when:
//   - Running or extending the foreground dogfood contract suite and blocker metric aggregation.
// Aggregated pi-autoresearch dogfood contract suite.
// Runs the current strict product dogfood contracts in one foreground command. Child contracts get
// suite-owned temporary paths so known dogfood artifact env vars cannot redirect durable artifacts.
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = realpathSync(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(path.dirname(scriptPath), "..");
const strictDefault = process.env.DOGFOOD_CONTRACT_STRICT ?? "1";
const controlledEnvNames = [
  "PI_AUTORESEARCH_CANDIDATE_DOGFOOD_ROOT",
  "PI_AUTORESEARCH_DOGFOOD_CWD",
  "PI_AUTORESEARCH_FOREGROUND_RESUME_BENCHMARK_LOG",
  "PI_AUTORESEARCH_GOAL_LEDGER_DOGFOOD_ROOT",
  "PI_AUTORESEARCH_LONG_CAMPAIGN_DOGFOOD_ROOT",
  "PI_AUTORESEARCH_RESUME_UI_DOGFOOD_CWD",
  "PI_AUTORESEARCH_SELF_HOSTING_DOGFOOD_ROOT",
];

const contracts = [
  {
    id: "workflow-contract",
    script: "scripts/dogfood-workflow-contract.mjs",
    metricName: "unresolved_dogfood_blockers",
  },
  {
    id: "foreground-resume-contract",
    script: "scripts/dogfood-foreground-resume-contract.mjs",
    metricName: "unresolved_foreground_resume_blockers",
    tempPaths: [
      {
        envName: "PI_AUTORESEARCH_DOGFOOD_CWD",
        prefix: "autoresearch-suite-resume-",
        kind: "directory",
      },
      {
        envName: "PI_AUTORESEARCH_FOREGROUND_RESUME_BENCHMARK_LOG",
        prefix: "autoresearch-suite-resume-log-",
        kind: "file",
        basename: "foreground-resume-benchmark.log",
      },
    ],
  },
  {
    id: "resume-ui-contract",
    script: "scripts/dogfood-resume-ui-contract.mjs",
    metricName: "unresolved_resume_ui_blockers",
    tempPaths: [
      {
        envName: "PI_AUTORESEARCH_RESUME_UI_DOGFOOD_CWD",
        prefix: "autoresearch-suite-resume-ui-",
        kind: "directory",
      },
    ],
  },
  {
    id: "candidate-handoff-contract",
    script: "scripts/dogfood-candidate-handoff-contract.mjs",
    metricName: "unresolved_candidate_handoff_blockers",
    tempPaths: [
      {
        envName: "PI_AUTORESEARCH_CANDIDATE_DOGFOOD_ROOT",
        prefix: "autoresearch-suite-candidate-",
        kind: "directory",
      },
    ],
  },
  {
    id: "long-supervised-campaign-contract",
    script: "scripts/dogfood-long-supervised-campaign-contract.mjs",
    metricName: "unresolved_long_supervised_campaign_blockers",
    tempPaths: [
      {
        envName: "PI_AUTORESEARCH_LONG_CAMPAIGN_DOGFOOD_ROOT",
        prefix: "autoresearch-suite-long-campaign-",
        kind: "directory",
      },
    ],
  },
  {
    id: "campaign-goal-ledger-contract",
    script: "scripts/dogfood-campaign-goal-ledger-contract.mjs",
    metricName: "unresolved_campaign_goal_blockers",
    tempPaths: [
      {
        envName: "PI_AUTORESEARCH_GOAL_LEDGER_DOGFOOD_ROOT",
        prefix: "autoresearch-suite-goal-ledger-",
        kind: "directory",
      },
    ],
  },
  {
    id: "self-hosting-endurance-contract",
    script: "scripts/dogfood-self-hosting-endurance-contract.mjs",
    metricName: "unresolved_self_hosting_safety_blockers",
    tempPaths: [
      {
        envName: "PI_AUTORESEARCH_SELF_HOSTING_DOGFOOD_ROOT",
        prefix: "autoresearch-suite-self-hosting-",
        kind: "directory",
      },
    ],
  },
  {
    id: "auto-continuation-contract",
    script: "scripts/dogfood-auto-continuation-contract.mjs",
    metricName: "unresolved_auto_continuation_blockers",
  },
];

export function parseMetric(output, metricName) {
  const pattern = new RegExp(`^METRIC\\s+${metricName}=(-?\\d+(?:\\.\\d+)?)\\s*$`, "mu");
  const match = output.match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function prepareTempEnv(contract) {
  const env = { ...process.env, DOGFOOD_CONTRACT_STRICT: strictDefault };
  for (const envName of controlledEnvNames) delete env[envName];

  const cleanupPaths = [];
  for (const tempPath of contract.tempPaths ?? []) {
    const root = mkdtempSync(path.join(os.tmpdir(), tempPath.prefix));
    cleanupPaths.push(root);
    env[tempPath.envName] =
      tempPath.kind === "file" ? path.join(root, tempPath.basename ?? "artifact.log") : root;
  }
  return { env, cleanupPaths };
}

export function blockerCount({ exitCode, signalFailure, metric }) {
  const metricBlockers = metric === null || metric < 0 ? 1 : metric;
  const executionBlockers = exitCode === 0 && !signalFailure ? 0 : 1;
  return Math.max(metricBlockers, executionBlockers);
}

function runContract(contract) {
  const { env, cleanupPaths } = prepareTempEnv(contract);
  try {
    const result = spawnSync(process.execPath, [contract.script], {
      cwd: packageRoot,
      encoding: "utf8",
      env,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const metric = parseMetric(output, contract.metricName);
    const signalFailure = result.signal ? `signal:${result.signal}` : null;
    const exitCode = result.status ?? (signalFailure ? 1 : result.error ? 1 : 0);
    const blockers = blockerCount({ exitCode, signalFailure, metric });
    const ok = exitCode === 0 && metric === 0 && !signalFailure;
    return {
      id: contract.id,
      script: contract.script,
      ok,
      exitCode,
      signal: result.signal ?? null,
      metricName: contract.metricName,
      metric,
      blockers,
      output,
    };
  } finally {
    for (const cleanupPath of cleanupPaths) rmSync(cleanupPath, { recursive: true, force: true });
  }
}

export function aggregateSuiteResults(results) {
  const unresolved = results.reduce((sum, result) => sum + result.blockers, 0);
  const hasFailures = results.some((result) => !result.ok);
  return { unresolved, hasFailures };
}

export function runSuite() {
  const results = contracts.map(runContract);
  return { results, ...aggregateSuiteResults(results) };
}

function printSuiteResult({ results, unresolved, hasFailures }) {
  for (const result of results) {
    console.log(
      `CONTRACT ${result.ok ? "ok" : "fail"} ${result.id}: ${result.script} ${
        result.metricName
      }=${result.metric ?? "missing"} exit=${result.exitCode}${
        result.signal ? ` signal=${result.signal}` : ""
      }`,
    );
  }

  console.log(`METRIC unresolved_autoresearch_dogfood_suite_blockers=${unresolved}`);
  console.log(
    JSON.stringify(
      {
        unresolved,
        hasFailures,
        results: results.map((result) => ({
          id: result.id,
          script: result.script,
          ok: result.ok,
          exitCode: result.exitCode,
          signal: result.signal,
          metricName: result.metricName,
          metric: result.metric,
          blockers: result.blockers,
        })),
      },
      null,
      2,
    ),
  );

  if (process.env.DOGFOOD_CONTRACT_VERBOSE === "1") {
    for (const result of results) {
      console.log(`\n## ${result.id} output\n${result.output.trimEnd()}`);
    }
  }
}

function main() {
  const suiteResult = runSuite();
  printSuiteResult(suiteResult);

  if (
    process.env.DOGFOOD_CONTRACT_STRICT !== "0" &&
    (suiteResult.unresolved > 0 || suiteResult.hasFailures)
  ) {
    process.exitCode = 1;
  }
}

export function isMainModule(moduleUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  try {
    const modulePath = realpathSync(fileURLToPath(moduleUrl));
    const entryPath = realpathSync(path.resolve(argvPath));
    return pathToFileURL(entryPath).href === pathToFileURL(modulePath).href;
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url)) main();
