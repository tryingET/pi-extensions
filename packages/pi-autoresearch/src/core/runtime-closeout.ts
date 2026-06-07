import path from "node:path";
import { classifyRunEmpiricalDecision, isSuccessfulMetricRun } from "./runtime-metrics.ts";
import type {
  AutoresearchCandidateBinding,
  AutoresearchEmpiricalDecisionClass,
  AutoresearchOracleEvidenceReadiness,
  AutoresearchSegmentCloseout,
} from "./runtime-model.ts";
import { loadReceiptLog, resolveAutoresearchPaths } from "./runtime-receipts.ts";
import { buildAutoresearchRuntimeStatusFromEntries, getCurrentSegment } from "./runtime-status.ts";
import { describeChecksState } from "./runtime-status-format.ts";

function summarizeAutoresearchOracleEvidenceReadiness(
  closeout: Omit<AutoresearchSegmentCloseout, "oracleReadyEvidence">,
): AutoresearchOracleEvidenceReadiness {
  const recordCount = closeout.runs.length;
  return {
    packetKind: "autoresearch.oracle_evidence.v1",
    recordCount,
    preflightStatus:
      recordCount === 0 ? "blocked_no_campaign_evidence" : "ready_for_dspx_owner_review",
    target: "dspx_oracle_postgres_pgvector",
    authorityBoundary:
      "Oracle-ready evidence is empirical memory input only; DSPx owns publication preflight/shared Oracle writes and AK/society.v2.db remains canonical authority.",
  };
}

export function buildAutoresearchSegmentCloseout(cwd: string): AutoresearchSegmentCloseout {
  const resolvedCwd = path.resolve(cwd);
  const paths = resolveAutoresearchPaths(resolvedCwd);
  const { entries, invalidLineCount } = loadReceiptLog(resolvedCwd);
  const status = buildAutoresearchRuntimeStatusFromEntries(
    resolvedCwd,
    paths,
    entries,
    invalidLineCount,
    { persistSnapshot: false },
  );
  const currentSegment = getCurrentSegment(entries);
  const successfulRuns = currentSegment.runs.filter(isSuccessfulMetricRun);
  const candidateBindings = currentSegment.runs
    .map((run) => run.experiment?.candidate)
    .filter((binding): binding is AutoresearchCandidateBinding => Boolean(binding));

  const adapterBoundary =
    "Segment closeout is package-local empirical evidence only; promote to AK evidence, KES learning, DSPx Oracle empirical memory, or another target through an explicit adapter or owner surface.";

  const closeoutWithoutOracle = {
    packetKind: "autoresearch.closeout.v1" as const,
    adapterContractVersion: 1 as const,
    targetKinds: [
      "adapter_source",
      "evidence",
      "learning",
      "task_system",
      "knowledge_base",
      "dspx_oracle",
      "empirical_memory",
    ],
    cwd: resolvedCwd,
    receiptPath: paths.jsonlPath,
    status,
    campaign: status.currentSegment.name,
    metricName: status.currentSegment.metricName,
    metricUnit: status.currentSegment.metricUnit,
    direction: status.currentSegment.direction,
    runCount: status.currentSegment.runCount,
    successfulRunCount: status.currentSegment.successfulRunCount,
    baselineMetric: status.currentSegment.baselineMetric,
    bestMetric: status.currentSegment.bestMetric,
    empiricalDecisionClass: status.currentSegment.empiricalDecisionClass,
    timingInterpretation: status.currentSegment.metricInterpretation,
    empiricalPosture: status.empiricalPosture,
    runs: currentSegment.runs.map((run) => ({
      iteration: run.iteration ?? null,
      status: run.status,
      runKind: run.runKind ?? "ordinary",
      empiricalDecisionClass:
        run.empiricalDecisionClass ??
        classifyRunEmpiricalDecision(
          run,
          successfulRuns,
          currentSegment.config,
          status.currentSegment.metricInterpretation,
        ),
      metric: run.metric,
      description: run.description,
      timestamp: run.timestamp,
      checks: describeChecksState(run),
      experiment: run.experiment ?? null,
    })),
    candidateBindings,
    recommendedAction: recommendSegmentCloseoutAction(status.currentSegment.empiricalDecisionClass),
    adapterBoundary,
    evidenceBoundary: adapterBoundary,
  };

  return {
    ...closeoutWithoutOracle,
    oracleReadyEvidence: summarizeAutoresearchOracleEvidenceReadiness(closeoutWithoutOracle),
  };
}

function recommendSegmentCloseoutAction(decisionClass: AutoresearchEmpiricalDecisionClass): string {
  switch (decisionClass) {
    case "candidate_improvement":
    case "threshold_satisfied":
    case "threshold_preserved":
      return "verify or finalize the candidate through explicit review/evidence promotion";
    case "candidate_regression":
    case "threshold_regressed":
    case "checks_failed":
    case "measurement_invalid":
      return "discard the candidate or diagnose the measurement/check failure before another optimization run";
    case "calibration_signal":
    case "insufficient_samples":
    case "possible_noise":
    case "threshold_not_met":
      return "collect more evidence or rebaseline before treating the segment as an improvement";
    case "baseline_drift":
      return "investigate environment drift and consider an explicit rebaseline";
    case "candidate_neutral":
      return "treat as neutral; keep only if there is a non-metric reason and record that separately";
    case "baseline":
      return "run a scoped candidate or calibration sample before finalizing";
    case "not_evaluated":
      return "configure and run a bounded segment before closeout";
  }
}
