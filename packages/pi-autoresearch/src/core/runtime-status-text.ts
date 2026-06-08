import { formatAutoresearchAutoContinuationGateLines } from "./autoContinuation.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
} from "./llamacppCampaign.ts";
import { formatAutoresearchRuntimeSnapshotReuse } from "./resume.ts";
import {
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
} from "./runtime-constants.ts";
import { formatAllowedActions } from "./runtime-control.ts";
import {
  formatAutoresearchGuidedCandidateJourneyLines,
  formatAutoresearchSetupGuideLines,
} from "./runtime-dashboard-guidance.ts";
import {
  formatConfidenceValue,
  formatEmpiricalPosture,
  formatLastRun,
  formatMetricInterpretation,
  formatMetricThresholdValue,
  formatMetricValue,
  formatTimestamp,
} from "./runtime-format.ts";
import type { AutoresearchRuntimeStatus, AutoresearchSegmentCloseout } from "./runtime-model.ts";
import { formatAutoresearchPeerLaneRecommendations } from "./runtime-peer-assist.ts";
import {
  formatLastPostRunDecision,
  formatLlamacppCampaignProjectionAvailability,
  formatLlamacppCampaignProjectionLabel,
  formatPromptVaultDecisionAvailability,
} from "./runtime-status.ts";
import { formatCandidateBindingLines, formatExperimentLabel } from "./runtime-status-format.ts";
import { AUTORESEARCH_SELF_HOSTING_TOOL_NAME } from "./selfHosting.ts";

export function formatAutoresearchStatusText(status: AutoresearchRuntimeStatus): string {
  const currentSegmentLines = status.currentSegment.configured
    ? [
        `- configured campaign: ${status.currentSegment.name ?? "(unnamed)"}`,
        `- primary metric: ${status.currentSegment.metricName ?? "(unset)"} (${status.currentSegment.metricUnit || "unitless"}, ${status.currentSegment.direction ?? "unset"} is better)`,
        `- success threshold: ${formatMetricThresholdValue(status.currentSegment.metricThreshold, status.currentSegment.metricUnit)}`,
        `- benchmark command: ${status.currentSegment.benchmarkCommand ?? "(unset)"}`,
        `- checks command: ${status.currentSegment.checksCommand ?? "(none)"}`,
        `- current-segment runs: ${status.currentSegment.runCount} total / ${status.currentSegment.successfulRunCount} successful`,
        `- baseline metric: ${formatMetricValue(status.currentSegment.baselineMetric, status.currentSegment.metricUnit)}`,
        `- best metric: ${formatMetricValue(status.currentSegment.bestMetric, status.currentSegment.metricUnit)}`,
        `- confidence: ${formatConfidenceValue(status.currentSegment.confidence)}`,
        `- empirical decision: ${status.currentSegment.empiricalDecisionClass}`,
        `- empirical posture: ${formatEmpiricalPosture(status.empiricalPosture)}`,
        `- timing interpretation: ${formatMetricInterpretation(status.currentSegment.metricInterpretation, status.currentSegment.metricUnit)}`,
        `- last run: ${formatLastRun(status.currentSegment.lastRunStatus, status.currentSegment.lastRunMetric, status.currentSegment.metricUnit, status.currentSegment.lastRunKind)}`,
      ]
    : [
        "- configured campaign: no",
        "- current-segment runs: 0 total / 0 successful",
        "- baseline metric: (n/a)",
        "- best metric: (n/a)",
        "- confidence: (n/a)",
        "- empirical decision: not_evaluated",
        `- empirical posture: ${formatEmpiricalPosture(status.empiricalPosture)}`,
        "- last run: (none)",
      ];

  const projection = status.runtimeProjection;

  return [
    "# PI-AUTORESEARCH STATUS",
    "",
    `- phase: ${status.phase}`,
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    status.cwd ? `- cwd: ${status.cwd}` : "- cwd: (unset)",
    status.receiptPath ? `- receipt log: ${status.receiptPath}` : "- receipt log: (unresolved)",
    projection.ledgerPath
      ? `- event ledger: ${projection.ledgerPath}`
      : "- event ledger: (unresolved)",
    status.runtimeSnapshot.path
      ? `- runtime snapshot: ${status.runtimeSnapshot.path}`
      : "- runtime snapshot: (unresolved)",
    `- local artifacts: ${status.localArtifacts.join(", ")}`,
    `- receipt entry types: ${status.receiptEntryTypes.join(", ")}`,
    `- benchmark script present: ${status.hasBenchmarkScript ? "yes" : "no"}`,
    `- checks script present: ${status.hasChecksScript ? "yes" : "no"}`,
    `- invalid receipt lines: ${status.invalidReceiptLines}`,
    `- machine state: ${projection.state}`,
    `- machine resume state: ${projection.resumeState ?? "(none)"}`,
    `- machine blocked reason: ${projection.blockedReason ?? "(none)"}`,
    `- machine completion reason: ${projection.completionReason ?? "(none)"}`,
    `- machine projection source: ${projection.source}`,
    `- snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
    `- snapshot discard reason: ${status.runtimeSnapshot.discardedReason ?? "(none)"}`,
    `- control state: ${status.control.kind}`,
    `- allowed actions: ${formatAllowedActions(status.control.allowedActions)}`,
    `- control reason: ${status.control.reason ?? "(none)"}`,
    `- control selected at: ${formatTimestamp(status.control.selectedAt)}`,
    `- campaign goal status: ${status.campaignGoal.status}`,
    `- campaign goal objective: ${status.campaignGoal.objective ?? "(none)"}`,
    `- campaign goal progress: ${status.campaignGoal.usage.completedIterations}/${status.campaignGoal.budget.iterations ?? "unbounded"} iteration(s) across ${status.campaignGoal.usage.foregroundSegments} foreground segment(s)`,
    `- campaign goal next continuation: ${status.campaignGoal.nextContinuationCall ?? "(none)"}`,
    `- auto-continuation eligible: ${status.autoContinuation.eligible ? "yes" : "no"}`,
    `- auto-continuation follow-up: ${status.autoContinuation.eligible ? "will be sent after settle window" : "will not be sent"}`,
    `- auto-continuation blockers: ${status.autoContinuation.blockedReasons.length > 0 ? status.autoContinuation.blockedReasons.join(", ") : "(none)"}`,
    ...formatAutoresearchAutoContinuationGateLines(status.autoContinuation),
    `- event ledger present: ${projection.hasLedger ? "yes" : "no"}`,
    `- invalid ledger lines: ${projection.invalidLedgerLines}`,
    `- ledger replay: ${projection.replayedEventCount}/${projection.eventCount} events accepted`,
    `- ledger replay issues: ${projection.rejectedEvents.length}`,
    `- projection sync issues: ${projection.syncIssues.length}`,
    `- live Prompt Vault decisions: ${formatPromptVaultDecisionAvailability(status.promptVaultDecisions.availability)}`,
    `- last post-run decision: ${formatLastPostRunDecision(status.promptVaultDecisions.lastPostRunDecision)}`,
    `- manifest campaign projection: ${formatLlamacppCampaignProjectionAvailability(status.llamacppCampaignProjection.availability)}`,
    `- manifest campaign projection path: ${status.llamacppCampaignProjection.projectionPath ?? "(unresolved)"}`,
    `- projected manifest campaign: ${formatLlamacppCampaignProjectionLabel(status.llamacppCampaignProjection)}`,
    `- projected receipt root: ${status.llamacppCampaignProjection.receiptRootPath ?? "(none)"}`,
    `- projected overall state: ${status.llamacppCampaignProjection.overallState ?? "(none)"}`,
    `- projection stale reason: ${status.llamacppCampaignProjection.staleReason ?? "(none)"}`,
    ...currentSegmentLines,
    `- ready Prompt Vault templates: ${status.readyPromptVaultTemplates.join(", ")}`,
    `- blocked Prompt Vault templates: ${status.blockedPromptVaultTemplates.join(", ")}`,
    `- next slices: ${formatNextSlices(status.nextSlices)}`,
    "",
    "## Setup guide",
    ...(status.cwd
      ? formatAutoresearchSetupGuideLines(status.cwd)
      : ["- provide cwd to show exact setup calls"]),
    "",
    "## Guided candidate journey: bind -> measure -> candidate_result_export",
    ...(status.cwd
      ? formatAutoresearchGuidedCandidateJourneyLines(status.cwd)
      : ["- provide cwd to show exact bind/measure/export calls"]),
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({ cwd: status.cwd }),
  ].join("\n");
}

export function formatAutoresearchSegmentCloseout(closeout: AutoresearchSegmentCloseout): string {
  const metricUnit = closeout.metricUnit;
  const runLines = closeout.runs.map((run) => {
    const experimentLabel = run.experiment
      ? ` | hypothesis ${formatExperimentLabel(run.experiment)}`
      : "";
    const candidateLabel = run.experiment?.candidate?.branch
      ? ` | candidate ${run.experiment.candidate.branch}`
      : "";
    return `- iteration ${run.iteration ?? "?"}: ${run.status}/${run.runKind} | empirical ${run.empiricalDecisionClass} | metric ${formatMetricValue(run.metric, metricUnit)} | checks ${run.checks}${experimentLabel}${candidateLabel} | ${run.description}`;
  });
  const candidateLines = closeout.candidateBindings.flatMap((binding, index) => [
    `- candidate ${index + 1}:`,
    ...formatCandidateBindingLines(binding).map((line) => `  ${line}`),
  ]);

  return [
    "# PI-AUTORESEARCH SEGMENT CLOSEOUT",
    "",
    `- packet kind: ${closeout.packetKind}`,
    `- adapter contract version: ${closeout.adapterContractVersion}`,
    `- target kinds: ${closeout.targetKinds.join(", ")}`,
    `- cwd: ${closeout.cwd}`,
    `- receipt log: ${closeout.receiptPath}`,
    `- campaign: ${closeout.campaign ?? "(unnamed)"}`,
    `- metric: ${closeout.metricName ?? "(unset)"} (${metricUnit || "unitless"}, ${closeout.direction ?? "unset"} is better)`,
    `- runs: ${closeout.runCount} total / ${closeout.successfulRunCount} successful`,
    `- baseline: ${formatMetricValue(closeout.baselineMetric, metricUnit)}`,
    `- best: ${formatMetricValue(closeout.bestMetric, metricUnit)}`,
    `- empirical decision: ${closeout.empiricalDecisionClass}`,
    `- empirical posture: ${formatEmpiricalPosture(closeout.empiricalPosture)}`,
    `- timing interpretation: ${formatMetricInterpretation(closeout.timingInterpretation, metricUnit)}`,
    `- recommended action: ${closeout.recommendedAction}`,
    `- Oracle-ready evidence records: ${closeout.oracleReadyEvidence.recordCount}`,
    `- Oracle preflight status: ${closeout.oracleReadyEvidence.preflightStatus}`,
    `- Oracle target: ${closeout.oracleReadyEvidence.target}`,
    `- adapter boundary: ${closeout.adapterBoundary}`,
    `- evidence boundary: ${closeout.evidenceBoundary}`,
    "",
    "## Runs",
    ...(runLines.length > 0 ? runLines : ["- (none)"]),
    "",
    "## Candidate bindings",
    ...(candidateLines.length > 0 ? candidateLines : ["- (none)"]),
    "",
    "## Oracle-ready evidence boundary",
    `- packet: ${closeout.oracleReadyEvidence.packetKind}`,
    `- records: ${closeout.oracleReadyEvidence.recordCount}`,
    `- preflight status: ${closeout.oracleReadyEvidence.preflightStatus}`,
    `- boundary: ${closeout.oracleReadyEvidence.authorityBoundary}`,
  ].join("\n");
}

export function buildAutoresearchHelpText(status: AutoresearchRuntimeStatus): string {
  const segment = status.currentSegment;
  const projection = status.runtimeProjection;
  const configurationBlock = segment.configured
    ? [
        "## Current bounded runtime",
        `- campaign: ${segment.name ?? "(unnamed)"}`,
        `- metric: ${segment.metricName ?? "(unset)"} (${segment.metricUnit || "unitless"}, ${segment.direction ?? "unset"} is better)`,
        `- benchmark command: ${segment.benchmarkCommand ?? "(unset)"}`,
        `- checks command: ${segment.checksCommand ?? "(none)"}`,
        `- current-segment runs: ${segment.runCount} total / ${segment.successfulRunCount} successful`,
        `- baseline: ${formatMetricValue(segment.baselineMetric, segment.metricUnit)}`,
        `- best: ${formatMetricValue(segment.bestMetric, segment.metricUnit)}`,
        `- confidence: ${formatConfidenceValue(segment.confidence)}`,
        `- machine state: ${projection.state}`,
        `- machine resume state: ${projection.resumeState ?? "(none)"}`,
        `- machine projection source: ${projection.source}`,
        `- runtime snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
        `- control state: ${status.control.kind} (${formatAllowedActions(status.control.allowedActions)})`,
        `- event ledger: ${projection.ledgerPath ?? "(unresolved)"}`,
        `- replayed events: ${projection.replayedEventCount}/${projection.eventCount}`,
      ]
    : [
        "## Current bounded runtime",
        "- no config receipt yet",
        `- machine state: ${projection.state}`,
        `- machine projection source: ${projection.source}`,
        `- runtime snapshot reuse: ${formatAutoresearchRuntimeSnapshotReuse(status.runtimeSnapshot.reuse)}`,
        `- control state: ${status.control.kind} (${formatAllowedActions(status.control.allowedActions)})`,
        `- event ledger: ${projection.ledgerPath ?? "(unresolved)"}`,
        "- use autoresearch_runtime_run with name + metricName to bootstrap the first local segment",
      ];

  return [
    "# /autoresearch",
    "",
    "The bounded runtime kernel is available through the /autoresearch <objective> front door, local benchmark/check execution, machine projection, append-only receipt/event logging, governed Prompt Vault decision requests, bounded loop execution, posture-gated runs, peer-assist planning/launch handoff, bounded finalization orchestration, one bounded supervised self-hosting public seam, and manifest-driven llama.cpp campaign planning/fork preparation/stage binding plus package-local campaign receipt/status projection, exact-task AK-binding snapshot derivation, one-step campaign-local advancement, and one dedicated public manifest campaign-control seam.",
    "This package now owns bounded finalization planning, approval, local branch materialization, one public `autoresearch_self_hosting_run` seam for controller/candidate/evaluator/promotion orchestration under the supervised self-hosting contract, checked manifest-driven branch/lane planning, one exact 41/42/43 stage-binding surface, one projection-only llama.cpp campaign status artifact, one non-mutating AK-ready manifest-campaign binding helper, one bounded one-step campaign-local advance helper, one dedicated public `autoresearch_llamacpp_campaign_control` seam for current status plus one-step public advancement with optional exact-task AK context, and a bounded in-call autoresearch loop. The technical `autoresearch_llamacpp_campaign` tool remains available below that public seam for raw matrix/fork/stage actions; the current package still does not own hidden daemonized self-improvement, direct AK mutation policy, automatic controller rotation, whole-campaign execution, automatic visible peer spawning, or remote review choreography.",
    "",
    "## Available surfaces",
    `- command: /${status.commandName}`,
    `- tools: ${status.toolNames.join(", ")}`,
    `- use ${AUTORESEARCH_CAMPAIGN_START_TOOL_NAME} as the supervised campaign front door from one bounded objective; plan first, then optionally bootstrap a baseline or bounded loop`,
    "- use autoresearch_runtime_status to inspect the current bounded runtime state",
    `- use ${AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME} to inspect a candidate worktree/branch and prepare the exact measurement call without running or mutating anything`,
    `- use ${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME} to inspect or plan candidate keep/discard/rewind decisions without mutating worktrees or promoting`,
    "- use autoresearch_runtime_status with action=setup or action=finalize to request governed setup/finalize packets",
    "- use autoresearch_runtime_control to inspect or set continue / rebaseline / finalize / stop operator intent",
    "- use autoresearch_runtime_finalize to inspect, plan, approve, and materialize a bounded finalization workflow",
    "- use autoresearch_runtime_run to execute one bounded local run and optionally request a governed post-run next-hypothesis decision with decisionGoal; postureCommand can fail closed before benchmark execution",
    `- use ${AUTORESEARCH_AUTOPLAN_TOOL_NAME} to inspect the repo/problem space and propose bounded campaign setup; planner=dspx_program can materialize a DSPx-generated DSPy planner assembly`,
    `- use ${AUTORESEARCH_SETUP_TOOL_NAME} to plan/apply a config receipt or bootstrap a baseline run without needing a slash-command wizard`,
    `- use ${AUTORESEARCH_PEER_ASSIST_TOOL_NAME} to plan one canonical visible peer lane without launching it`,
    `- use ${AUTORESEARCH_LOOP_TOOL_NAME} to execute a bounded in-call loop with maxIterations, optional wall-clock/posture gates, live progress updates, and optional explicit peer-launch handoff`,
    `- use ${AUTORESEARCH_SELF_HOSTING_TOOL_NAME} for the public supervised self-hosting seam: inspect controller/candidate/evaluator state, prepare the candidate worktree, run one bounded self-hosting wave, use action=start_and_watch for in-call progress updates, and optionally plan/apply promotion or rollback records without package-local self-promotion`,
    `- use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME} for the public manifest campaign-control seam: current status, optional exact-task AK context, and one-step public advance without raw stage/build inputs`,
    `- use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} for lower-level technical manifest work such as branch/lane matrix planning, fork preparation, raw stage binding, exact AK-ready snapshots, or technical one-step advancement`,
    "",
    "## Peer lane recommendations",
    ...formatAutoresearchPeerLaneRecommendations({ cwd: status.cwd }),
    "",
    ...configurationBlock,
    "",
    "## Local artifact plan",
    ...status.localArtifacts.map((artifact) => `- ${artifact}`),
    "",
    "## Manifest campaign projection",
    `- availability: ${formatLlamacppCampaignProjectionAvailability(status.llamacppCampaignProjection.availability)}`,
    `- projection path: ${status.llamacppCampaignProjection.projectionPath ?? "(unresolved)"}`,
    `- projected manifest: ${formatLlamacppCampaignProjectionLabel(status.llamacppCampaignProjection)}`,
    `- projected receipt root: ${status.llamacppCampaignProjection.receiptRootPath ?? "(none)"}`,
    `- projected overall state: ${status.llamacppCampaignProjection.overallState ?? "(none)"}`,
    `- stale reason: ${status.llamacppCampaignProjection.staleReason ?? "(none)"}`,
    `- refresh path: use ${AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME} with the current manifestPath to create or refresh the projection artifact`,
    "",
    "## Prompt Vault alignment",
    "Ready now:",
    ...status.readyPromptVaultTemplates.map((name) => `- ${name}`),
    "",
    `Live post-run decision state: ${formatPromptVaultDecisionAvailability(status.promptVaultDecisions.availability)}`,
    `Last post-run decision: ${formatLastPostRunDecision(status.promptVaultDecisions.lastPostRunDecision)}`,
    "",
    "Blocked until governed router vocabulary expands:",
    ...status.blockedPromptVaultTemplates.map((name) => `- ${name}`),
    "",
    "## Next bounded slices",
    ...(status.nextSlices.length > 0
      ? status.nextSlices.map((slice) => `- ${slice}`)
      : ["- none currently committed in product-posture"]),
  ].join("\n");
}

function formatNextSlices(slices: readonly string[]): string {
  return slices.length > 0 ? slices.join(", ") : "(none currently committed)";
}
