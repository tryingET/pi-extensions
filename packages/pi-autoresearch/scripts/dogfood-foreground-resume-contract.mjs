#!/usr/bin/env node
// Foreground resume dogfood contract.
// Default cwd is the package root so operator dogfood exercises pi-autoresearch itself and appends
// ignored projection receipts. Set PI_AUTORESEARCH_DOGFOOD_CWD to a temp directory for non-mutating
// regression tests. DOGFOOD_CONTRACT_STRICT defaults to 1 so blockers fail the process by default.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeUrl = pathToFileURL(path.join(packageRoot, "src/runtime.ts")).href;
const workflowContractPath = path.join(packageRoot, "scripts/dogfood-workflow-contract.mjs");
const benchmarkLog = process.env.PI_AUTORESEARCH_FOREGROUND_RESUME_BENCHMARK_LOG
  ? path.resolve(process.env.PI_AUTORESEARCH_FOREGROUND_RESUME_BENCHMARK_LOG)
  : "/tmp/pi-autoresearch-foreground-resume-contract-benchmark.log";

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

const strictDefault = process.env.DOGFOOD_CONTRACT_STRICT ?? "1";
const workflowContractCommand = `DOGFOOD_CONTRACT_STRICT=1 node ${shellQuote(workflowContractPath)}`;

const runnerSource = `
import path from "node:path";

import {
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchRuntimeStatus,
  executeAutoresearchResumeApply,
  executeAutoresearchSetup,
} from ${JSON.stringify(runtimeUrl)};

const cwd = process.env.PI_AUTORESEARCH_DOGFOOD_CWD
  ? path.resolve(process.env.PI_AUTORESEARCH_DOGFOOD_CWD)
  : ${JSON.stringify(packageRoot)};
const benchmarkLog = ${JSON.stringify(benchmarkLog)};
const workflowContractCommand = ${JSON.stringify(workflowContractCommand)};
const blockers = [];
let baseline = null;
let plan = null;
let apply = null;

try {
  const benchmarkCommand =
    workflowContractCommand +
    " > " +
    benchmarkLog +
    " && printf 'METRIC unresolved_foreground_resume_blockers=0\\n'";

  baseline = await executeAutoresearchSetup({
    cwd,
    action: "baseline",
    reconfigure: true,
    name: "foreground-resume-dogfood",
    metricName: "unresolved_foreground_resume_blockers",
    metricUnit: "count",
    direction: "lower",
    metricThreshold: 0,
    benchmarkCommand,
    checksCommand: workflowContractCommand,
    description:
      "Baseline the reviewed foreground resume executor against the executable workflow contract.",
    timeoutSeconds: 120,
    checksTimeoutSeconds: 120,
  });

  if (baseline.run?.runReceipt.status !== "baseline") {
    blockers.push("baseline_not_valid:" + (baseline.run?.runReceipt.status ?? "missing"));
  }
  if (baseline.run?.primaryMetric !== 0) {
    blockers.push("baseline_metric_not_zero:" + String(baseline.run?.primaryMetric));
  }

  plan = buildAutoresearchResumeApplyPlan(cwd);
  if (!plan.planReady) {
    blockers.push("resume_apply_plan_not_ready:" + plan.blockedReasons.join("|"));
  }
  if (!plan.futureForegroundCall?.includes("autoresearch_runtime_resume_apply")) {
    blockers.push("missing_foreground_executor_call");
  }
  if (!plan.futureForegroundCall?.includes('operatorConfirmation: "RUN FOREGROUND RESUME"')) {
    blockers.push("missing_exact_confirmation_in_foreground_call");
  }

  if (blockers.length === 0) {
    apply = await executeAutoresearchResumeApply({
      cwd,
      segmentKey: plan.resumePlan.segmentKey,
      runtimeKey: plan.resumePlan.runtimeKey,
      maxIterations: 1,
      maxWallClockMinutes: 1,
      operatorConfirmation: "RUN FOREGROUND RESUME",
      description:
        "Dogfood the foreground resume executor from an inspected resume_apply_plan.",
      timeoutSeconds: 120,
      checksTimeoutSeconds: 120,
    });

    if (apply.loopResult.peerMode !== "off") {
      blockers.push("resume_apply_peer_mode_not_off");
    }
    if (!apply.authorityWarnings.some((warning) => warning.includes("no daemon"))) {
      blockers.push("resume_apply_missing_authority_warning");
    }
    if (apply.loopResult.completedIterations < 1) {
      blockers.push("resume_apply_no_foreground_iteration");
    }
    if (apply.loopResult.status.empiricalPosture.classification !== "threshold_preserved") {
      blockers.push(
        "resume_apply_unexpected_posture:" +
          apply.loopResult.status.empiricalPosture.classification,
      );
    }
  }
} catch (error) {
  blockers.push("exception:" + (error instanceof Error ? error.message : String(error)));
}

const status = buildAutoresearchRuntimeStatus(cwd);
const ok = blockers.length === 0;
console.log(
  "CONTRACT " +
    (ok ? "ok" : "fail") +
    " foreground-resume-apply: resume_apply_plan led to one explicit foreground executor call",
);
console.log(
  "CONTRACT " +
    (ok && apply?.loopResult.peerMode === "off" ? "ok" : "fail") +
    " foreground-resume-peer-boundary: executor kept peer launch off and authority warnings explicit",
);
console.log("METRIC unresolved_foreground_resume_blockers=" + blockers.length);
console.log(
  JSON.stringify(
    {
      blockers,
      baseline: baseline
        ? {
            metric: baseline.run?.primaryMetric,
            status: baseline.run?.runReceipt.status,
            decision: baseline.run?.status.empiricalPosture.classification,
          }
        : null,
      plan: plan
        ? {
            planReady: plan.planReady,
            segmentKey: plan.resumePlan.segmentKey,
            runtimeKey: plan.resumePlan.runtimeKey,
            blockedReasons: plan.blockedReasons,
          }
        : null,
      apply: apply
        ? {
            action: apply.action,
            executionAuthorized: apply.executionAuthorized,
            completedIterations: apply.loopResult.completedIterations,
            stopReason: apply.loopResult.stopReason,
            peerMode: apply.loopResult.peerMode,
            finalPosture: apply.loopResult.status.empiricalPosture.classification,
          }
        : null,
      current: {
        classification: status.empiricalPosture.classification,
        promotionReady: status.empiricalPosture.promotionReady,
      },
    },
    null,
    2,
  ),
);

if (process.env.DOGFOOD_CONTRACT_STRICT !== "0" && blockers.length > 0) {
  process.exitCode = 1;
}
`;

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", "--input-type=module", "--eval", runnerSource],
  {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...process.env, DOGFOOD_CONTRACT_STRICT: strictDefault },
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? (result.error ? 1 : 0);
