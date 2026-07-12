#!/usr/bin/env node
// summary: Tests isolated candidate binding, measurement, result packets, and plan-only lifecycle decisions.
// read_when:
//   - Validating the visible candidate handoff path without candidate or package-root mutation.
// Visible-candidate handoff dogfood contract.
// Creates an isolated controller repo + candidate worktree and exercises the package runtime through
// candidate_bind -> candidate measurement -> candidate_result -> candidate_decision. No package-root
// receipts, worktrees, durable evidence, or candidate lifecycle mutations are written.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeUrl = pathToFileURL(path.join(packageRoot, "src/runtime.ts")).href;
const workflowContractPath = path.join(packageRoot, "scripts/dogfood-workflow-contract.mjs");
const strictDefault = process.env.DOGFOOD_CONTRACT_STRICT ?? "1";

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

const workflowContractCommand = `DOGFOOD_CONTRACT_STRICT=1 node ${shellQuote(workflowContractPath)}`;
const tempRoot = process.env.PI_AUTORESEARCH_CANDIDATE_DOGFOOD_ROOT
  ? path.resolve(process.env.PI_AUTORESEARCH_CANDIDATE_DOGFOOD_ROOT)
  : mkdtempSync(path.join(os.tmpdir(), "autoresearch-candidate-handoff-"));
const shouldCleanup = !process.env.PI_AUTORESEARCH_CANDIDATE_DOGFOOD_ROOT;

const runnerSource = `
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildAutoresearchCandidateBindPlan,
  buildAutoresearchCandidateDecisionWorkbench,
  buildAutoresearchCandidateResultPacket,
  executeAutoresearchRun,
  executeAutoresearchSetup,
} from ${JSON.stringify(runtimeUrl)};

const root = ${JSON.stringify(tempRoot)};
const workflowContractCommand = ${JSON.stringify(workflowContractCommand)};
const blockers = [];
const controller = path.join(root, "controller");
const candidate = path.join(root, "candidate-worktree");

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function quote(value) {
  return "'" + value + "'";
}

function snapshotCandidateLifecycleState() {
  return {
    controllerHead: git(controller, ["rev-parse", "HEAD"]),
    candidateHead: git(candidate, ["rev-parse", "HEAD"]),
    controllerStatus: git(controller, ["status", "--short", "--untracked-files=all"]),
    candidateStatus: git(candidate, ["status", "--short", "--untracked-files=all"]),
    worktreeList: git(controller, ["worktree", "list", "--porcelain"]),
    candidateBranch: git(controller, ["branch", "--list", "candidate/handoff"]),
  };
}

try {
  mkdirSync(controller, { recursive: true });
  git(controller, ["init"]);
  git(controller, ["config", "user.email", "pi-autoresearch@example.invalid"]);
  git(controller, ["config", "user.name", "pi Autoresearch Dogfood"]);
  writeFileSync(path.join(controller, "score.txt"), "1\\n");
  git(controller, ["add", "score.txt"]);
  git(controller, ["commit", "-m", "baseline score"]);
  const baseRef = git(controller, ["rev-parse", "HEAD"]);

  git(controller, ["worktree", "add", "-b", "candidate/handoff", candidate, "HEAD"]);
  writeFileSync(path.join(candidate, "score.txt"), "0\\n");
  git(candidate, ["add", "score.txt"]);
  git(candidate, ["commit", "-m", "candidate reaches threshold"]);

  const baselineBenchmarkPath = path.join(controller, "baseline-benchmark.mjs");
  const candidateBenchmarkPath = path.join(controller, "candidate-benchmark.mjs");
  writeFileSync(
    baselineBenchmarkPath,
    [
      "import { readFileSync } from 'node:fs';",
      "const v = Number(readFileSync('score.txt', 'utf8'));",
      "console.log('METRIC unresolved_candidate_handoff_blockers=' + v);",
    ].join("\\n"),
  );
  writeFileSync(
    candidateBenchmarkPath,
    [
      "import { readFileSync } from 'node:fs';",
      "const v = Number(readFileSync(" + JSON.stringify(path.join(candidate, "score.txt")) + ", 'utf8'));",
      "console.log('METRIC unresolved_candidate_handoff_blockers=' + v);",
    ].join("\\n"),
  );
  const baselineBenchmark = "node " + JSON.stringify(baselineBenchmarkPath);
  const candidateBenchmark = "node " + JSON.stringify(candidateBenchmarkPath);

  const baseline = await executeAutoresearchSetup({
    cwd: controller,
    action: "baseline",
    reconfigure: true,
    name: "visible-candidate-handoff-dogfood",
    metricName: "unresolved_candidate_handoff_blockers",
    metricUnit: "count",
    direction: "lower",
    metricThreshold: 0,
    benchmarkCommand: baselineBenchmark,
    checksCommand: workflowContractCommand,
    description: "Baseline before binding an isolated visible candidate worktree.",
    timeoutSeconds: 120,
    checksTimeoutSeconds: 120,
  });
  if (baseline.run?.primaryMetric !== 1) {
    blockers.push("baseline_metric_not_one:" + String(baseline.run?.primaryMetric));
  }

  const bind = buildAutoresearchCandidateBindPlan({
    cwd: controller,
    action: "plan_run",
    candidateWorktree: candidate,
    candidateSource: "candidate_peer_spawn",
    candidateBaseRef: baseRef,
    description: "Measure isolated visible candidate handoff",
  });
  if (bind.inspection.readiness !== "ready") {
    blockers.push("candidate_bind_not_ready:" + bind.inspection.readinessReasons.join("|"));
  }
  if (!bind.inspection.filesChanged.includes("score.txt")) {
    blockers.push("candidate_bind_missing_changed_file");
  }
  const bindNextCallText = bind.exactNextCalls.join("\\n");
  if (!bindNextCallText.includes("autoresearch_runtime_run")) {
    blockers.push("candidate_bind_missing_measurement_call");
  }
  for (const requiredFragment of [candidate, baseRef, "score.txt", "candidate_peer_spawn"]) {
    if (!bindNextCallText.includes(requiredFragment)) {
      blockers.push("candidate_bind_next_call_missing:" + requiredFragment);
    }
  }

  const run = await executeAutoresearchRun({
    cwd: controller,
    runKind: "ordinary",
    description: "Measure isolated visible candidate after controller-verified bind facts.",
    experiment: {
      hypothesisId: "visible-candidate-handoff-001",
      hypothesis:
        "A candidate worktree that changes score.txt from 1 to 0 should satisfy the explicit zero-blocker threshold.",
      interventionSummary: "Candidate worktree changes score.txt to 0.",
      expectedPrimaryEffect: "unresolved_candidate_handoff_blockers reaches zero",
      targetFiles: ["score.txt"],
      risk:
        "Synthetic visible-candidate handoff dogfood; lifecycle commands remain external and plan-only.",
      candidate: {
        source: "candidate_peer_spawn",
        worktreePath: candidate,
        branch: "candidate/handoff",
        baseRef,
        diffSummary: bind.inspection.diffSummary,
        filesChanged: bind.inspection.filesChanged,
      },
    },
    benchmarkCommand: candidateBenchmark,
    checksCommand: workflowContractCommand,
    timeoutSeconds: 120,
    checksTimeoutSeconds: 120,
  });
  if (run.primaryMetric !== 0) {
    blockers.push("candidate_metric_not_zero:" + String(run.primaryMetric));
  }
  if (run.status.empiricalPosture.classification !== "threshold_satisfied") {
    blockers.push("candidate_posture_not_threshold_satisfied:" + run.status.empiricalPosture.classification);
  }

  const candidateResult = buildAutoresearchCandidateResultPacket(controller);
  if (candidateResult.packetKind !== "autoresearch.candidate_result.v1") {
    blockers.push("candidate_result_wrong_packet_kind");
  }
  if (candidateResult.candidate?.worktreePath !== candidate) {
    blockers.push("candidate_result_missing_worktree");
  }
  if (candidateResult.candidate?.baseRef !== baseRef) {
    blockers.push("candidate_result_missing_base_ref");
  }
  if (!candidateResult.candidate?.filesChanged.includes("score.txt")) {
    blockers.push("candidate_result_missing_changed_file");
  }
  if (candidateResult.candidate?.diffSummary !== bind.inspection.diffSummary) {
    blockers.push("candidate_result_diff_summary_drift");
  }
  if (candidateResult.candidate?.source !== "candidate_peer_spawn") {
    blockers.push("candidate_result_missing_source");
  }
  if (candidateResult.candidate?.branch !== "candidate/handoff") {
    blockers.push("candidate_result_missing_branch");
  }

  const beforeDecisionSnapshot = snapshotCandidateLifecycleState();
  const keep = buildAutoresearchCandidateDecisionWorkbench({ cwd: controller, action: "plan_keep" });
  const discard = buildAutoresearchCandidateDecisionWorkbench({ cwd: controller, action: "plan_discard" });
  const rewind = buildAutoresearchCandidateDecisionWorkbench({ cwd: controller, action: "plan_rewind" });
  if (keep.recommendedDecision !== "keep") {
    blockers.push("keep_plan_not_keep:" + keep.recommendedDecision);
  }
  if (keep.confirmation.blockedReasons.length > 0) {
    blockers.push("keep_plan_blocked:" + keep.confirmation.blockedReasons.join("|"));
  }
  if (!keep.confirmation.checklist.join("\\n").includes("durable evidence")) {
    blockers.push("keep_plan_missing_external_promotion_checklist");
  }
  const discardRemovePrefix =
    "git -C " + quote(controller) + " worktree remove " + quote(candidate) + " ";
  const discardBranchPrefix =
    "git -C " + quote(controller) + " branch -D 'candidate/handoff' ";
  const rewindResetPrefix =
    "git -C " + quote(candidate) + " reset --hard " + quote(baseRef) + " ";
  const discardRemovesWorktree = discard.plannedCommands.some((command) =>
    command.startsWith(discardRemovePrefix) && command.includes("# plan only"),
  );
  const discardDeletesBranch = discard.plannedCommands.some((command) =>
    command.startsWith(discardBranchPrefix) && command.includes("# plan only"),
  );
  const rewindResetsToBase = rewind.plannedCommands.some((command) =>
    command.startsWith(rewindResetPrefix) && command.includes("# plan only"),
  );
  if (!discardRemovesWorktree) {
    blockers.push("discard_plan_missing_structured_worktree_cleanup_command");
  }
  if (!discardDeletesBranch) {
    blockers.push("discard_plan_missing_structured_branch_cleanup_command");
  }
  if (!rewindResetsToBase) {
    blockers.push("rewind_plan_missing_structured_reset_command");
  }
  if (!keep.boundaryWarnings.join("\\n").includes("does not merge")) {
    blockers.push("candidate_decision_missing_boundary_warning");
  }
  const afterDecisionSnapshot = snapshotCandidateLifecycleState();
  if (JSON.stringify(beforeDecisionSnapshot) !== JSON.stringify(afterDecisionSnapshot)) {
    blockers.push("candidate_decision_mutated_lifecycle_state");
  }

  const ok = blockers.length === 0;
  console.log(
    "CONTRACT " +
      (bind.inspection.readiness === "ready" ? "ok" : "fail") +
      " candidate-bind-ready: visible candidate worktree is controller-verified and measurement-ready",
  );
  console.log(
    "CONTRACT " +
      (ok ? "ok" : "fail") +
      " candidate-decision-plan-only: keep/discard/rewind are reviewable plans without package-owned lifecycle mutation",
  );
  console.log("METRIC unresolved_candidate_handoff_blockers=" + blockers.length);
  console.log(
    JSON.stringify(
      {
        blockers,
        baseline: {
          metric: baseline.run?.primaryMetric,
          status: baseline.run?.runReceipt.status,
          decision: baseline.run?.status.empiricalPosture.classification,
        },
        bind: {
          readiness: bind.inspection.readiness,
          filesChanged: bind.inspection.filesChanged,
          baseResolved: bind.inspection.baseResolved,
        },
        candidate: {
          metric: run.primaryMetric,
          status: run.runReceipt.status,
          decision: run.status.empiricalPosture.classification,
          promotionReady: run.status.empiricalPosture.promotionReady,
        },
        decision: {
          keep: keep.recommendedDecision,
          keepBlockedReasons: keep.confirmation.blockedReasons,
          discardCommands: discard.plannedCommands,
          discardCommandKinds: [
            ...(discardRemovesWorktree ? ["remove_worktree"] : []),
            ...(discardDeletesBranch ? ["delete_branch"] : []),
          ],
          rewindCommands: rewind.plannedCommands,
          rewindCommandKinds: rewindResetsToBase ? ["reset_to_base"] : [],
          lifecycleStateUnchanged:
            JSON.stringify(beforeDecisionSnapshot) === JSON.stringify(afterDecisionSnapshot),
        },
      },
      null,
      2,
    ),
  );
} catch (error) {
  blockers.push("exception:" + (error instanceof Error ? error.message : String(error)));
  console.log("CONTRACT fail candidate-handoff-exception: " + blockers[0]);
  console.log("METRIC unresolved_candidate_handoff_blockers=" + blockers.length);
  console.log(JSON.stringify({ blockers }, null, 2));
  process.exitCode = 1;
}

if (process.env.DOGFOOD_CONTRACT_STRICT !== "0" && blockers.length > 0) {
  process.exitCode = 1;
}
`;

try {
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
  if (result.signal) {
    console.error(`dogfood candidate handoff child exited by signal: ${result.signal}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
} finally {
  if (shouldCleanup) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
