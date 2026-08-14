// ---
// summary: "Pure markdown report renderers for autoresearch supervision tool results; extracted verbatim from extensions/society-orchestrator.ts."
// read_when:
//  - "Changing the operator-visible markdown layout of autoresearch supervision reports."
//  - "Refactoring autoresearch report formatting or its typed input shapes."
// ---

import * as path from "node:path";

import type {
  AutoresearchLearningKesAdapterAction,
  AutoresearchLearningKesAdapterResult,
} from "./autoresearch-learning-kes-adapter.ts";
import type {
  AutoresearchManifestCampaignEvidenceResult,
  AutoresearchManifestCampaignObservation,
  AutoresearchManifestCampaignTaskAnchor,
} from "./autoresearch-manifest-campaign-supervision.ts";
import type {
  AutoresearchSelfHostingEvidenceResult,
  AutoresearchSelfHostingObservation,
  AutoresearchSelfHostingSupervisionAction,
  AutoresearchSelfHostingTaskAnchor,
} from "./autoresearch-self-hosting-supervision.ts";
import {
  type AutoresearchCandidateWavePlan,
  type AutoresearchCandidateWaveReview,
  type AutoresearchLevel3AuthorizedFinalizerCleanupPlan,
  type AutoresearchLevel3CampaignManifestPreflight,
  type AutoresearchLevel3MatrixCellExecutor,
  type AutoresearchLevel3MatrixCellRunner,
  type AutoresearchLevel3MeasureExportReviewPlan,
  type AutoresearchLevel3SliceSequenceDryRun,
  type AutoresearchLevel3VisibleCandidateLifecyclePlan,
  type AutoresearchLevel4CampaignRunner,
  type AutoresearchLivePollResult,
  type AutoresearchLiveStartCampaignResult,
  type AutoresearchLiveStartResult,
  type AutoresearchLiveStopResult,
  type AutoresearchLiveSupervisionSessionV1,
  type AutoresearchMatrixCampaignCockpit,
  type AutoresearchMatrixCampaignControllerCommandPacket,
  type AutoresearchMatrixCampaignOperatorFollowup,
  type AutoresearchMatrixCampaignPlan,
  type AutoresearchMatrixCampaignReview,
  type AutoresearchMatrixCampaignRunnerCheckpoint,
  type AutoresearchMatrixCampaignRunnerContract,
  type AutoresearchPostFaninFinalizerResult,
  describeAutoresearchLiveNextStep,
} from "./autoresearch-supervisor-runner.ts";

export type AutoresearchLiveSupervisionAction =
  | "status"
  | "observe"
  | "start"
  | "start_campaign"
  | "plan_candidate_wave"
  | "level3_manifest_preflight"
  | "level3_slice_sequence_dry_run"
  | "level3_visible_candidate_lifecycle_plan"
  | "level3_measure_export_review_plan"
  | "level3_matrix_cell_runner"
  | "level3_authorized_finalizer_cleanup_plan"
  | "level3_matrix_cell_executor"
  | "level4_autoresearch_campaign_runner"
  | "plan_matrix_campaign"
  | "prepare_matrix_campaign_runner"
  | "checkpoint_matrix_campaign_runner"
  | "review_matrix_campaign"
  | "review_candidate_wave"
  | "finalize_post_fanin"
  | "stop";

export type AutoresearchManifestCampaignSupervisionAction = "observe" | "record_evidence";

export type AutoresearchLiveSupervisionToolDetails = {
  ok: boolean;
  action: AutoresearchLiveSupervisionAction;
  activeSessionCount?: number;
  sessions?: AutoresearchLiveSupervisionSessionV1[];
  sessionKey?: string;
  session?: AutoresearchLiveSupervisionSessionV1 | null;
  nextStep?: string;
  projector?: AutoresearchLivePollResult["projector"];
  lifecycle?: AutoresearchLivePollResult["lifecycle"];
  reused?: boolean;
  poll?: AutoresearchLiveStartResult["poll"];
  campaign?: AutoresearchLiveStartCampaignResult["campaign"];
  candidateWave?: AutoresearchCandidateWavePlan;
  level3ManifestPreflight?: AutoresearchLevel3CampaignManifestPreflight;
  level3SliceSequenceDryRun?: AutoresearchLevel3SliceSequenceDryRun;
  level3VisibleCandidateLifecyclePlan?: AutoresearchLevel3VisibleCandidateLifecyclePlan;
  level3MeasureExportReviewPlan?: AutoresearchLevel3MeasureExportReviewPlan;
  level3MatrixCellRunner?: AutoresearchLevel3MatrixCellRunner;
  level3AuthorizedFinalizerCleanupPlan?: AutoresearchLevel3AuthorizedFinalizerCleanupPlan;
  level3MatrixCellExecutor?: AutoresearchLevel3MatrixCellExecutor;
  level4CampaignRunner?: AutoresearchLevel4CampaignRunner;
  matrixCampaign?: AutoresearchMatrixCampaignPlan;
  matrixCampaignRunner?: AutoresearchMatrixCampaignRunnerContract;
  matrixCampaignRunnerCheckpoint?: AutoresearchMatrixCampaignRunnerCheckpoint;
  matrixCampaignReview?: AutoresearchMatrixCampaignReview;
  candidateWaveReview?: AutoresearchCandidateWaveReview;
  postFaninFinalizer?: AutoresearchPostFaninFinalizerResult;
  stopped?: boolean;
  error?: string;
};

export type AutoresearchManifestCampaignSupervisionToolDetails = {
  ok: boolean;
  action: AutoresearchManifestCampaignSupervisionAction;
  observation?: AutoresearchManifestCampaignObservation;
  task?: AutoresearchManifestCampaignTaskAnchor;
  evidenceAction?: AutoresearchManifestCampaignEvidenceResult["action"];
  evidenceVia?: Exclude<AutoresearchManifestCampaignEvidenceResult["evidence"], undefined>["via"];
  existingEvidenceId?: number;
  nextStep?: string;
  error?: string;
};

export type AutoresearchSelfHostingSupervisionToolDetails = {
  ok: boolean;
  action: AutoresearchSelfHostingSupervisionAction;
  observation?: AutoresearchSelfHostingObservation;
  task?: AutoresearchSelfHostingTaskAnchor;
  evidenceAction?: AutoresearchSelfHostingEvidenceResult["action"];
  evidenceVia?: Exclude<AutoresearchSelfHostingEvidenceResult["evidence"], undefined>["via"];
  existingEvidenceId?: number;
  nextStep?: string;
  error?: string;
};

export type AutoresearchLearningKesAdapterToolDetails = {
  ok: boolean;
  action: AutoresearchLearningKesAdapterAction;
  result?: AutoresearchLearningKesAdapterResult;
  nextStep?: string;
  error?: string;
};

export function formatAutoresearchLiveTimestamp(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "-";
  }

  return new Date(value).toISOString();
}

export function formatAutoresearchLiveSessionReport(input: {
  action: AutoresearchLiveSupervisionAction;
  session: AutoresearchLiveSupervisionSessionV1;
  nextStep: string;
  sessionKey?: string;
  extraLines?: string[];
}): string {
  const { action, session, nextStep, sessionKey, extraLines = [] } = input;
  const lines = [
    `Autoresearch live supervision — ${action}`,
    `Task: #${session.taskId}`,
    `CWD: ${session.cwd}`,
    `Session state: ${session.state}`,
    `Polling interval: ${session.policy.intervalSeconds}s`,
    `Started at: ${formatAutoresearchLiveTimestamp(session.startedAt)}`,
    `Last poll: ${formatAutoresearchLiveTimestamp(session.lastPolledAt)}`,
    `Poll count: ${session.pollCount}`,
    `Last runtime state: ${session.lastRuntimeState || "-"}`,
    `Last projection action: ${session.lastProjectionAction || "-"}`,
    `Last lifecycle action: ${session.lastLifecycleAction}`,
    `Last summary: ${session.lastSummary || "-"}`,
    `Last error: ${session.lastError || "-"}`,
    `Next step: ${nextStep}`,
  ];

  if (sessionKey) {
    lines.splice(1, 0, `Session key: ${sessionKey}`);
  }

  if (extraLines.length > 0) {
    lines.push("", ...extraLines);
  }

  return lines.join("\n");
}

export function formatAutoresearchLiveSessionList(
  sessions: readonly AutoresearchLiveSupervisionSessionV1[],
): string {
  if (sessions.length === 0) {
    return "No active live autoresearch supervision sessions.";
  }

  const lines = [`Active live autoresearch supervision sessions: ${sessions.length}`, ""];
  for (const session of sessions) {
    lines.push(
      `- #${session.taskId} ${session.cwd}`,
      `  state: ${session.state}`,
      `  interval: ${session.policy.intervalSeconds}s`,
      `  last runtime: ${session.lastRuntimeState || "-"}`,
      `  projection: ${session.lastProjectionAction || "-"}`,
      `  lifecycle: ${session.lastLifecycleAction}`,
      `  next step: ${describeAutoresearchLiveNextStep(session)}`,
      "",
    );
  }

  return lines.join("\n").trimEnd();
}

export function formatAutoresearchLivePollExtras(
  poll: Pick<AutoresearchLivePollResult, "observation" | "projector" | "lifecycle">,
): string[] {
  const lines: string[] = [];
  if (poll.observation) {
    lines.push(`Observed runtime state: ${poll.observation.runtime.runtimeProjection.state}`);
    lines.push(`Observed finalization next step: ${poll.observation.finalization.nextStep}`);
    lines.push(
      `Oracle-ready evidence: ${poll.observation.oracleEvidence.records.length} record(s); preflight=${poll.observation.oracleEvidence.publicationPreflight.status}`,
    );
    lines.push(
      'Export first: autoresearch_runtime_status({ action: "oracle_evidence_export", cwd, overwrite: true })',
    );
    lines.push(
      `DSPx preflight command template: ${poll.observation.oracleEvidence.publicationPreflight.suggestedDspxPreflightCommandTemplate}`,
    );
    lines.push(
      "Oracle boundary: reported as DSPx empirical-memory handoff only; pi-autoresearch export is an explicit local file write, DSPx owns preflight/shared writes, and orchestrator does not write Oracle Postgres, migrate local coordinates.db, or make Oracle memory authoritative.",
    );
  }
  if (poll.projector) {
    lines.push(`Projection outcome: ${poll.projector.action}`);
  }
  if (poll.lifecycle) {
    lines.push(`Lifecycle outcome: ${poll.lifecycle.action}`);
  }
  return lines;
}

export function formatAutoresearchLiveStartReport(result: AutoresearchLiveStartResult): string {
  const extraLines = [
    `Reused existing session: ${result.reused ? "yes" : "no"}`,
    ...(result.poll ? formatAutoresearchLivePollExtras(result.poll) : []),
  ];

  return formatAutoresearchLiveSessionReport({
    action: "start",
    sessionKey: result.sessionKey,
    session: result.session,
    nextStep: result.poll?.nextStep || describeAutoresearchLiveNextStep(result.session),
    extraLines,
  });
}

export function formatAutoresearchCampaignStartUnderSupervisionReport(
  input: AutoresearchLiveStartCampaignResult,
): string {
  const dspxProgramGen = input.campaign.autoplan.dspxProgramGen;
  const dspxProgramGenRun = input.campaign.dspxProgramGenRun;
  const dspxAdvisory = input.campaign.autoplan.dspxAdvisory;
  return [
    "Autoresearch live supervision — start_campaign",
    `Task: #${input.supervision.session.taskId}`,
    `CWD: ${input.campaign.cwd}`,
    `Objective: ${input.campaign.objective}`,
    `Planner: ${input.campaign.autoplan.planner}`,
    `Run mode: ${input.campaign.runMode}`,
    `Max iterations: ${input.campaign.maxIterations}`,
    `Runtime state: ${input.campaign.status.runtimeProjection.state}`,
    `Supervision state: ${input.supervision.session.state}`,
    `Supervision session: ${input.supervision.sessionKey}`,
    `Next step: ${input.supervision.poll?.nextStep || describeAutoresearchLiveNextStep(input.supervision.session)}`,
    ...(dspxProgramGen
      ? [
          "",
          "DSPx generated DSPy planner assembly:",
          `- intent: ${dspxProgramGen.intentPath}`,
          `- outdir: ${dspxProgramGen.outdir}`,
          `- materialized: ${dspxProgramGen.materialized ? "yes" : "no"}`,
          `- command: ${dspxProgramGen.command}`,
          `- note: ${dspxProgramGen.note}`,
        ]
      : []),
    ...(dspxProgramGenRun
      ? [
          "",
          "DSPx program-gen run:",
          `- exit: ${String(dspxProgramGenRun.exitCode)}`,
          `- timed out: ${dspxProgramGenRun.timedOut ? "yes" : "no"}`,
          `- duration: ${dspxProgramGenRun.durationSeconds.toFixed(2)}s`,
        ]
      : []),
    ...(dspxAdvisory
      ? [
          "",
          dspxAdvisory.authority === "validated_generated_dspy_planner_output"
            ? "Generated DSPy planner output:"
            : "DSPx advisory:",
          `- behavior: ${dspxAdvisory.behaviorPath}`,
          `- available: ${dspxAdvisory.available ? "yes" : "no"}`,
          `- status: ${dspxAdvisory.status ?? "unknown"}`,
          `- matched objective: ${dspxAdvisory.matchedObjective ? "yes" : "no"}`,
          ...(dspxAdvisory.proposal
            ? [
                `- campaign plan: ${dspxAdvisory.proposal.campaignName ?? "(missing)"}`,
                `- metric plan: ${dspxAdvisory.proposal.metricName ?? "(missing)"}`,
                `- benchmark plan: ${dspxAdvisory.proposal.benchmarkCommand ?? "(missing)"}`,
                `- checks plan: ${dspxAdvisory.proposal.checksCommand ?? "(none)"}`,
              ]
            : []),
        ]
      : []),
    "",
    "Boundaries:",
    "- Campaign execution is delegated to pi-autoresearch runtime semantics.",
    "- DSPx program-gen materializes and runs the DSPy planner assembly inside the pi-autoresearch/DSPx owner seam; orchestrator only requests that bounded seam and supervises the result.",
    "- Live supervision may report pi-autoresearch Oracle-ready evidence refs; DSPx owns publication preflight/shared Oracle writes, and Oracle memory remains empirical rather than authoritative.",
    "- Live supervision may project verified AK milestones through its existing orchestrator-gated projector; it does not write KES, write Oracle Postgres, change direction, spawn peers, or promote candidates.",
    "- Direction changes remain proposals unless routed through AK/decision authority.",
    "",
    ...formatAutoresearchLivePollExtras(
      input.supervision.poll ?? { observation: null, projector: null, lifecycle: null },
    ),
  ]
    .filter((line, index, lines) => line.length > 0 || lines[index - 1]?.length !== 0)
    .join("\n");
}

export function formatAutoresearchCandidateWavePlanReport(
  plan: AutoresearchCandidateWavePlan,
): string {
  const lines = [
    "Autoresearch live supervision — plan_candidate_wave",
    `Task: #${plan.taskId}`,
    `CWD: ${plan.cwd}`,
    `Objective: ${plan.objective}`,
    `Candidate lanes: ${plan.candidateCount}`,
    `Candidate packet directory: ${plan.candidatePacketDirectory}`,
    `Parent peer target: ${plan.parentPeerTarget ?? "required before launch"}`,
    "",
    "Candidate lanes:",
    ...plan.lanes.flatMap((lane) => [
      `- ${lane.laneId}: ${lane.objective}`,
      `  launch: ${lane.candidatePeerCall}`,
      `  measure: ${lane.measurementPlan.join(" -> ")}`,
      `  packet path: ${lane.candidateResultPacketPath}`,
      `  review: ${lane.ownerReviewCall}`,
    ]),
    "",
    "Owner selection:",
    `aggregate review: ${plan.ownerSelection.aggregateReviewCall}`,
    `packet paths: ${plan.ownerSelection.candidateResultPacketPaths.join(", ")}`,
    ...plan.ownerSelection.reviewInstructions.map((instruction) => `- ${instruction}`),
    "",
    "Wave fan-in management:",
    `- kind: ${plan.management.kind}`,
    `- wave id: ${plan.management.waveId}`,
    `- posture: ${plan.management.posture}`,
    `- lane progress: ${plan.management.completedLaneCount}/${plan.management.expectedLaneCount}`,
    `- final-only scoring: ${plan.management.finalOnlyScoring ? "yes" : "no"}`,
    `- controller measurement required: ${plan.management.controllerMeasurementRequired ? "yes" : "no"}`,
    `- required runner: ${plan.management.handoffContract.requiredRunner}`,
    `- handoff: ${plan.management.handoffContract.handoff}`,
    `- controller-inline implementation: ${plan.management.handoffContract.controllerInlineImplementation}`,
    `- controller role: ${plan.management.handoffContract.controllerRole}`,
    `- pi-autoresearch peer spawning: ${plan.management.handoffContract.piAutoresearchPeerSpawning}`,
    ...plan.management.laneStates.map(
      (lane) =>
        `- ${lane.laneId}: ${lane.state}; packet=${lane.candidateResultPacketPath ?? "none"}; next=${lane.nextStep}`,
    ),
    ...plan.management.fanInChecklist.map((item) => `- checklist: ${item}`),
    `- non-selected lane policy: ${plan.management.nonSelectedLanePolicy}`,
    ...plan.management.exactNextCalls.map((call) => `- fan-in call: ${call}`),
    "",
    "Boundaries:",
    ...plan.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${plan.nextStep}`,
  ];
  return lines.join("\n");
}

export function formatAutoresearchLevel3ManifestPreflightReport(
  preflight: AutoresearchLevel3CampaignManifestPreflight,
): string {
  return [
    "Autoresearch live supervision — level3_manifest_preflight",
    `Task: #${preflight.taskId}`,
    `CWD: ${preflight.cwd}`,
    `Manifest kind: ${preflight.manifestKind}`,
    `Manifest path: ${preflight.manifestPath ?? "inline_or_missing"}`,
    `Manifest hash: ${preflight.manifestHash ?? "missing"}`,
    `Read only: ${preflight.readOnly ? "yes" : "no"}`,
    `Execution: ${preflight.execution}`,
    `level3_manifest_preflight_blockers: ${preflight.metric.value} (target=${preflight.metric.target}, ${preflight.metric.status})`,
    `manifest_schema_blockers: ${preflight.cellMetrics.manifestSchemaBlockers.value} (${preflight.cellMetrics.manifestSchemaBlockers.status})`,
    `manifest_policy_gate_blockers: ${preflight.cellMetrics.manifestPolicyGateBlockers.value} (${preflight.cellMetrics.manifestPolicyGateBlockers.status})`,
    `manifest_preflight_ux_blockers: ${preflight.cellMetrics.manifestPreflightUxBlockers.value} (${preflight.cellMetrics.manifestPreflightUxBlockers.status})`,
    `Campaign: ${preflight.schema.campaignId ?? "missing"}`,
    `Autonomy level: ${preflight.schema.autonomyLevel ?? "missing"}`,
    `Primary metric: ${preflight.schema.primaryMetricName ?? "missing"}`,
    `Slices: ${preflight.schema.sliceCount}; files in scope: ${preflight.schema.fileScopeCount}; off-limits: ${preflight.schema.offLimitsCount}`,
    "",
    "Policy gates:",
    ...preflight.policyGates.map(
      (gate) =>
        `- ${gate.gate}: ${gate.posture}; value=${String(gate.value)}; expected=${gate.requiredPolicy.join("|")}; boundary=${gate.boundary}`,
    ),
    "",
    "Blockers:",
    ...(preflight.blockers.length > 0
      ? preflight.blockers.map((blocker) => `- ${blocker}`)
      : ["- none"]),
    "",
    "Next legal actions:",
    ...preflight.nextLegalActions.map((action) => `- ${action}`),
    "",
    "Non-actions:",
    ...preflight.nonActions.map((action) => `- ${action}`),
    "",
    `Level-2 fallback: ${preflight.level2FallbackRoute}`,
    "",
    "Boundaries:",
    ...preflight.boundaries.map((boundary) => `- ${boundary}`),
  ].join("\n");
}

export function formatAutoresearchLevel3SliceSequenceDryRunReport(
  dryRun: AutoresearchLevel3SliceSequenceDryRun,
): string {
  return [
    "Autoresearch live supervision — level3_slice_sequence_dry_run",
    `Task: #${dryRun.taskId}`,
    `CWD: ${dryRun.cwd}`,
    `Manifest kind: ${dryRun.manifestKind}`,
    `Manifest path: ${dryRun.manifestPath ?? "inline_or_missing"}`,
    `Manifest hash: ${dryRun.manifestHash ?? "missing"}`,
    `Read only: ${dryRun.readOnly ? "yes" : "no"}`,
    `Execution: ${dryRun.execution}`,
    `autonomous_slice_sequence_blockers: ${dryRun.metric.value} (target=${dryRun.metric.target}, ${dryRun.metric.status})`,
    `slice_ordering_blockers: ${dryRun.cellMetrics.sliceOrderingBlockers.value} (${dryRun.cellMetrics.sliceOrderingBlockers.status})`,
    `dry_run_receipt_blockers: ${dryRun.cellMetrics.dryRunReceiptBlockers.value} (${dryRun.cellMetrics.dryRunReceiptBlockers.status})`,
    `slice_sequence_recovery_blockers: ${dryRun.cellMetrics.sliceSequenceRecoveryBlockers.value} (${dryRun.cellMetrics.sliceSequenceRecoveryBlockers.status})`,
    "",
    "Ordered dry-run states:",
    ...(dryRun.orderedStates.length > 0
      ? dryRun.orderedStates.map(
          (state) =>
            `- ${state.order}. ${state.sliceId}/${state.cellId}: ${state.state}; deps=${state.dependencies.join(", ") || "none"}; policy=${state.policyPosture}; metric=${state.metricName ?? "none"}; next=${state.nextLegalAction}`,
        )
      : ["- none"]),
    "",
    "Dry-run transition receipts:",
    ...(dryRun.receipts.length > 0
      ? dryRun.receipts.map(
          (receipt) =>
            `- ${receipt.outputRefs.receiptIndex}: ${receipt.kind}; non-authoritative=${receipt.nonAuthoritative ? "yes" : "no"}; durable evidence=${receipt.durableEvidence ? "yes" : "no"}; next=${receipt.nextState}`,
        )
      : ["- none"]),
    "",
    "Blockers:",
    ...(dryRun.blockers.length > 0 ? dryRun.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "Next legal actions:",
    ...dryRun.nextLegalActions.map((action) => `- ${action}`),
    `Safe rerun: ${dryRun.safeRerunCommand}`,
    `Level-2 fallback: ${dryRun.level2FallbackRoute}`,
    "",
    "Non-actions:",
    ...dryRun.nonActions.map((action) => `- ${action}`),
    "",
    "Boundaries:",
    ...dryRun.boundaries.map((boundary) => `- ${boundary}`),
  ].join("\n");
}

export function formatAutoresearchLevel3VisibleCandidateLifecyclePlanReport(
  plan: AutoresearchLevel3VisibleCandidateLifecyclePlan,
): string {
  return [
    "Autoresearch live supervision — level3_visible_candidate_lifecycle_plan",
    `Task: #${plan.taskId}`,
    `CWD: ${plan.cwd}`,
    `Manifest kind: ${plan.manifestKind}`,
    `Manifest path: ${plan.manifestPath ?? "inline_or_missing"}`,
    `Manifest hash: ${plan.manifestHash ?? "missing"}`,
    `Execution: ${plan.execution}`,
    `candidate_lifecycle_automation_blockers: ${plan.metric.value} (target=${plan.metric.target}, ${plan.metric.status})`,
    `visible_launch_policy_blockers: ${plan.cellMetrics.visibleLaunchPolicyBlockers.value} (${plan.cellMetrics.visibleLaunchPolicyBlockers.status})`,
    `candidate_binding_lifecycle_blockers: ${plan.cellMetrics.candidateBindingLifecycleBlockers.value} (${plan.cellMetrics.candidateBindingLifecycleBlockers.status})`,
    `candidate_cleanup_policy_blockers: ${plan.cellMetrics.candidateCleanupPolicyBlockers.value} (${plan.cellMetrics.candidateCleanupPolicyBlockers.status})`,
    `Launch authorization: ${plan.launchAuthorization.posture}`,
    `Required launch token: ${plan.launchAuthorization.requiredToken}`,
    "",
    "Candidate lanes:",
    ...plan.lanes.flatMap((lane) => [
      `- ${lane.laneId}: cell=${lane.cellId ?? "none"}; launch=${lane.launchPosture}; binding=${lane.bindingPosture}; cleanup=${lane.cleanupPosture}`,
      `  objective: ${lane.objective}`,
      `  metric: ${lane.metricName ?? "none"} (${lane.metricDirection} is better; target=${lane.metricTarget ?? "none"})`,
      `  files: ${lane.filesInScope.join(", ") || "none"}`,
      `  off-limits: ${lane.offLimits.join(", ") || "none"}`,
      `  candidate_peer_spawn: ${lane.candidatePeerCall ?? "withheld"}`,
      ...lane.cleanupPlan.map((item) => `  cleanup plan: ${item}`),
      ...(lane.blockers.length > 0 ? lane.blockers.map((blocker) => `  blocker: ${blocker}`) : []),
    ]),
    "",
    "Blockers:",
    ...(plan.blockers.length > 0 ? plan.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "Next legal actions:",
    ...plan.nextLegalActions.map((action) => `- ${action}`),
    "",
    "Non-actions:",
    ...plan.nonActions.map((action) => `- ${action}`),
    "",
    "Boundaries:",
    ...plan.boundaries.map((boundary) => `- ${boundary}`),
  ].join("\n");
}

export function formatAutoresearchLevel3MeasureExportReviewPlanReport(
  plan: AutoresearchLevel3MeasureExportReviewPlan,
): string {
  return [
    "Autoresearch live supervision — level3_measure_export_review_plan",
    `Task: #${plan.taskId}`,
    `CWD: ${plan.cwd}`,
    `Manifest hash: ${plan.manifestHash ?? "missing"}`,
    `Execution: ${plan.execution}`,
    `candidate_measure_export_review_blockers: ${plan.metric.value} (target=${plan.metric.target}, ${plan.metric.status})`,
    `measurement_policy_blockers: ${plan.cellMetrics.measurementPolicyBlockers.value} (${plan.cellMetrics.measurementPolicyBlockers.status})`,
    `candidate_export_binding_blockers: ${plan.cellMetrics.candidateExportBindingBlockers.value} (${plan.cellMetrics.candidateExportBindingBlockers.status})`,
    `review_packet_authority_blockers: ${plan.cellMetrics.reviewPacketAuthorityBlockers.value} (${plan.cellMetrics.reviewPacketAuthorityBlockers.status})`,
    "",
    "Measure/export/review lanes:",
    ...plan.lanes.flatMap((lane) => [
      `- ${lane.laneId}: cell=${lane.cellId ?? "none"}; measure=${lane.measurementPosture}; export=${lane.exportPosture}; review=${lane.reviewPosture}`,
      `  metric: ${lane.metricName ?? "none"} (${lane.metricDirection} is better; target=${lane.metricTarget ?? "none"})`,
      `  worktree: ${lane.candidateWorktree ?? "missing"}`,
      `  runtime_run: ${lane.runtimeRunCall ?? "withheld"}`,
      `  candidate_result_export: ${lane.candidateResultExportCall ?? "withheld"}`,
      `  review packet path: ${lane.reviewInputPacketPath}`,
      ...lane.blockers.map((blocker) => `  blocker: ${blocker}`),
    ]),
    `Aggregate review: ${plan.aggregateReviewCall ?? "withheld"}`,
    "",
    "Blockers:",
    ...(plan.blockers.length > 0 ? plan.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "Next legal actions:",
    ...plan.nextLegalActions.map((action) => `- ${action}`),
    "",
    "Non-actions:",
    ...plan.nonActions.map((action) => `- ${action}`),
    "",
    "Boundaries:",
    ...plan.boundaries.map((boundary) => `- ${boundary}`),
  ].join("\n");
}

export function formatAutoresearchLevel3MatrixCellRunnerReport(
  runner: AutoresearchLevel3MatrixCellRunner,
): string {
  return [
    "Autoresearch live supervision — level3_matrix_cell_runner",
    `Task: #${runner.taskId}`,
    `CWD: ${runner.cwd}`,
    `Manifest kind: ${runner.manifestKind}`,
    `Manifest path: ${runner.manifestPath ?? "inline_or_missing"}`,
    `Manifest hash: ${runner.manifestHash ?? "missing"}`,
    `Execution: ${runner.execution}`,
    `level3_matrix_cell_runner_blockers: ${runner.metric.value} (target=${runner.metric.target}, ${runner.metric.status})`,
    `ready-to-launch cells: ${runner.cellMetrics.readyToLaunchCells}`,
    `bound cells: ${runner.cellMetrics.boundCells}`,
    `measure/export-ready cells: ${runner.cellMetrics.measureExportReadyCells}`,
    `packet-ready cells: ${runner.cellMetrics.packetReadyCells}`,
    `selected cells: ${runner.cellMetrics.selectedCells}`,
    `blocked cells: ${runner.cellMetrics.blockedCells}`,
    "",
    "Matrix/cell runner states:",
    ...runner.cells.flatMap((cell) => [
      `- ${cell.cellId}: state=${cell.state}; lanes=${cell.laneCount}; bound=${cell.boundLaneCount}; packets=${cell.packetReadyLaneCount}; selected=${cell.selectedLaneId ?? "none"}`,
      `  objective: ${cell.objective}`,
      `  metric: ${cell.metricName ?? "none"} (${cell.metricDirection} is better; target=${cell.metricTarget ?? "none"})`,
      `  launch calls: ${cell.launchCalls.length}`,
      `  measure/export calls: ${cell.measureExportCalls.length}`,
      `  review_candidate_wave: ${cell.reviewCandidateWaveCall ?? "withheld"}`,
      ...cell.lanes.map(
        (lane) =>
          `  lane ${lane.laneId}: launch=${lane.launchPosture}; binding=${lane.bindingPosture}; measure=${lane.measurementPosture}; packet=${lane.packetExists ? "present" : "missing"}; selected=${lane.selected ? "yes" : "no"}; next=${lane.nextLegalCall ?? "none"}`,
      ),
      ...(cell.blockers.length > 0
        ? cell.blockers.map((blocker) => `  blocker: ${blocker}`)
        : ["  blockers: none"]),
    ]),
    `Aggregate review: ${runner.aggregateReviewCall ?? "withheld"}`,
    `Finalizer plan call: ${runner.finalizerPlanCall ?? "withheld"}`,
    "",
    "Next legal actions:",
    ...(runner.nextLegalActions.length > 0
      ? runner.nextLegalActions.map((action) => `- ${action}`)
      : ["- none; resolve blockers or wait for visible peer/binding/packet inputs"]),
    "",
    "Blockers:",
    ...(runner.blockers.length > 0 ? runner.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "Non-actions:",
    ...runner.nonActions.map((action) => `- ${action}`),
    "",
    "Boundaries:",
    ...runner.boundaries.map((boundary) => `- ${boundary}`),
  ].join("\n");
}

export function formatAutoresearchLevel3MatrixCellExecutorReport(
  executor: AutoresearchLevel3MatrixCellExecutor,
): string {
  return [
    "Autoresearch live supervision — level3_matrix_cell_executor",
    `Task: #${executor.taskId}`,
    `CWD: ${executor.cwd}`,
    `Objective: ${executor.objective}`,
    `Source runner: ${executor.sourceLevel3RunnerAlias} (${executor.sourceLevel3RunnerKind})`,
    `Posture: ${executor.posture}`,
    `Completed action count: ${executor.completedActionCount}`,
    `Runner nextLegalActions: ${executor.runnerNextLegalActions.length}`,
    `Remaining action count after this step: ${executor.remainingActionCount}`,
    `level3_state_machine_blockers: ${executor.stateMachineBlockers.value} (target=${executor.stateMachineBlockers.target}, ${executor.stateMachineBlockers.status})`,
    `Hidden execution prevented: ${executor.stateMachineBlockers.hiddenExecutionPrevented ? "yes" : "no"}`,
    `Forbidden action matched: ${executor.stateMachineBlockers.forbiddenActionMatched ? "yes" : "no"}`,
    "",
    "Selected one-step action:",
    executor.selectedAction
      ? `- #${executor.selectedAction.index}: ${executor.selectedAction.call}`
      : "- none",
    executor.selectedAction
      ? `- execution: ${executor.selectedAction.execution}`
      : "- execution: not_executed_by_orchestrator",
    executor.selectedAction
      ? `- allowed by state machine: ${executor.selectedAction.allowedByStateMachine ? "yes" : "no"}`
      : "- allowed by state machine: n/a",
    ...(executor.selectedAction?.forbiddenReason
      ? [`- forbidden reason: ${executor.selectedAction.forbiddenReason}`]
      : []),
    "",
    "Emitted next legal actions:",
    ...(executor.emittedNextLegalActions.length > 0
      ? executor.emittedNextLegalActions.map((action) => `- ${action}`)
      : ["- none"]),
    "",
    "Runner nextLegalActions snapshot:",
    ...executor.runnerNextLegalActions.map((action, index) => `- [${index}] ${action}`),
    "",
    "Boundaries:",
    ...executor.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${executor.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchLevel4CampaignRunnerReport(
  runner: AutoresearchLevel4CampaignRunner,
): string {
  const cleanup = runner.promptRunnerBundle.candidateCloseoutPacket.postIntegrationCleanupReady;
  const promotionHandoff =
    runner.promptRunnerBundle.candidateCloseoutPacket.postFaninPromotionHandoff;
  const lifecycleStatusPrepared = Boolean(cleanup.candidateLifecycleStatusCall);
  const lifecyclePlanPrepared = Boolean(cleanup.candidateLifecyclePlanCall);
  const cleanupBlocked =
    cleanup.blockers.length > 0 ||
    cleanup.registrySidecars.some((sidecar) => sidecar.status !== "verified_registry_sidecar");
  const cleanupOperatorPosture = cleanupBlocked
    ? "BLOCKED — resolve registry sidecar/closeout blockers before lifecycle-v2 planning"
    : lifecyclePlanPrepared
      ? "LIFECYCLE PLAN READY — inspect exact resource state; deletion remains withheld until lifecycle-v2 cleanup_authorized"
      : lifecycleStatusPrepared
        ? "LIFECYCLE STATUS READY — inspect exact resource state before owner disposition"
        : "NOT READY — capture exact registry-backed peer ids and successful closeout first";

  return [
    "Autoresearch live supervision — level4_autoresearch_campaign_runner",
    `Task: #${runner.taskId}`,
    `CWD: ${runner.cwd}`,
    `Objective: ${runner.objective}`,
    `Posture: ${runner.posture}`,
    `Receipt path: ${runner.receiptPath}`,
    `Loaded receipts: ${runner.loadedReceiptCount}`,
    `New receipts: ${runner.newReceipts.length}`,
    `Completed action count: ${runner.completedActionCount}`,
    `level4_autoresearch_automation_blockers: ${runner.metric.value} (target=${runner.metric.target}, ${runner.metric.status})`,
    `whole_matrix_execution_glue_blockers: ${runner.promptRunnerBundle.metric.value} (target=${runner.promptRunnerBundle.metric.target}, ${runner.promptRunnerBundle.metric.status})`,
    `level4_visible_launch_watch_blockers: ${runner.promptRunnerBundle.visibleLaunchWatchPlan.metric.value} (target=${runner.promptRunnerBundle.visibleLaunchWatchPlan.metric.target}, ${runner.promptRunnerBundle.visibleLaunchWatchPlan.metric.status})`,
    `Prompt runner state: ${runner.promptRunnerBundle.state}`,
    "",
    "Prompt-runner matrix pattern:",
    ...runner.promptRunnerBundle.pattern.map((step, index) => `- ${index + 1}. ${step}`),
    "",
    "Prompt bundle lanes:",
    ...(runner.promptRunnerBundle.promptBundle.length > 0
      ? runner.promptRunnerBundle.promptBundle.map(
          (lane) => `- ${lane.cellId}/${lane.laneId}: ${lane.promptTitle}`,
        )
      : ["- none"]),
    "",
    "Visible candidate peer spawn calls:",
    ...(runner.promptRunnerBundle.visibleCandidatePeerSpawnCalls.length > 0
      ? runner.promptRunnerBundle.visibleCandidatePeerSpawnCalls.map((call) => `- ${call}`)
      : ["- none"]),
    "",
    "Peer watch calls:",
    ...(runner.promptRunnerBundle.peerWatchCalls.length > 0
      ? runner.promptRunnerBundle.peerWatchCalls.map((call) => `- ${call}`)
      : ["- none"]),
    "",
    "Visible launch/watch orchestration:",
    `- kind: ${runner.promptRunnerBundle.visibleLaunchWatchPlan.kind}`,
    `- execution: ${runner.promptRunnerBundle.visibleLaunchWatchPlan.execution}`,
    `- parentPeerTarget: ${runner.promptRunnerBundle.visibleLaunchWatchPlan.parentPeerTarget ?? "missing"}`,
    ...(runner.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans.length > 0
      ? runner.promptRunnerBundle.visibleLaunchWatchPlan.lanePlans.map(
          (lane) => `- ${lane.cellId}/${lane.laneId}: ${lane.state}; surface=${lane.launchSurface}`,
        )
      : ["- lanes: none"]),
    ...(runner.promptRunnerBundle.visibleLaunchWatchPlan.metric.blockers.length > 0
      ? runner.promptRunnerBundle.visibleLaunchWatchPlan.metric.blockers.map(
          (blocker) => `- blocker: ${blocker}`,
        )
      : ["- blockers: none"]),
    "",
    "Whole-matrix parallel executor:",
    `- kind: ${runner.promptRunnerBundle.wholeMatrixParallelExecutor.kind}`,
    `- execution: ${runner.promptRunnerBundle.wholeMatrixParallelExecutor.execution}`,
    `- concurrency limit: ${runner.promptRunnerBundle.wholeMatrixParallelExecutor.concurrencyLimit}`,
    `- lanes: ${runner.promptRunnerBundle.wholeMatrixParallelExecutor.totalLaneCount}; batches: ${runner.promptRunnerBundle.wholeMatrixParallelExecutor.batchCount}`,
    `- true_parallel_whole_matrix_executor_blockers: ${runner.promptRunnerBundle.wholeMatrixParallelExecutor.metric.value} (target=${runner.promptRunnerBundle.wholeMatrixParallelExecutor.metric.target}, ${runner.promptRunnerBundle.wholeMatrixParallelExecutor.metric.status})`,
    `- matrix_materialization_preflight_blockers: ${runner.promptRunnerBundle.wholeMatrixParallelExecutor.materializationPreflight.blockerMetric.value} (${runner.promptRunnerBundle.wholeMatrixParallelExecutor.materializationPreflight.blockerMetric.status})`,
    ...(runner.promptRunnerBundle.wholeMatrixParallelExecutor.batches.length > 0
      ? runner.promptRunnerBundle.wholeMatrixParallelExecutor.batches.map(
          (batch) =>
            `- batch ${batch.batchIndex}: ${batch.lanes.map((lane) => `${lane.cellId}/${lane.laneId}`).join(", ")}`,
        )
      : ["- batches: none"]),
    ...(runner.promptRunnerBundle.wholeMatrixParallelExecutor.metric.blockers.length > 0
      ? runner.promptRunnerBundle.wholeMatrixParallelExecutor.metric.blockers.map(
          (blocker) => `- blocker: ${blocker}`,
        )
      : ["- blockers: none"]),
    "",
    "Controller lineage verification:",
    ...runner.promptRunnerBundle.controllerLineageVerification.checklist.map((item) => `- ${item}`),
    "",
    "Post-fan-in promotion handoff:",
    `- posture: ${promotionHandoff.posture}`,
    `- selected lanes: ${promotionHandoff.selectedLaneCount}/${promotionHandoff.totalLaneCount}`,
    `- measured packets: ${promotionHandoff.controllerVerifiedMeasuredPacketCount}/${promotionHandoff.totalLaneCount}`,
    `- owner review call: ${promotionHandoff.ownerReviewCall ? "prepared" : "withheld"}`,
    `- finalizer token request call: ${promotionHandoff.finalizerTokenRequestCall ? "prepared" : "withheld"}`,
    `- evidence handoff: ${promotionHandoff.evidenceRecordHandoff.posture}`,
    ...(promotionHandoff.blockers.length > 0
      ? promotionHandoff.blockers.map((blocker) => `- blocker: ${blocker}`)
      : ["- blockers: none"]),
    "",
    "Post-integration cleanup operator posture:",
    `- posture: ${cleanupOperatorPosture}`,
    `- readiness: ${cleanup.readiness}`,
    `- lifecycle status call: ${lifecycleStatusPrepared ? "prepared" : "withheld"}`,
    `- lifecycle plan call: ${lifecyclePlanPrepared ? "prepared (plan-only; no destructive command emitted)" : "withheld"}`,
    "- registry-v1 cleanup call: permanently withheld",
    `- exact peer ids: ${cleanup.exactPeerRunIds.length > 0 ? cleanup.exactPeerRunIds.join(", ") : "none"}`,
    `- exact worktrees: ${cleanup.exactWorktrees.length > 0 ? cleanup.exactWorktrees.join(", ") : "none"}`,
    `- exact branches: ${cleanup.exactBranches.length > 0 ? cleanup.exactBranches.join(", ") : "none"}`,
    "Post-integration cleanup registry sidecars:",
    ...(cleanup.registrySidecars.length > 0
      ? cleanup.registrySidecars.map(
          (sidecar) =>
            `- ${sidecar.peerRunId}: ${sidecar.status}; registry=${sidecar.registryPath || "missing"}; worktree=${sidecar.worktreePath ?? "missing"}; branch=${sidecar.branchName ?? "missing"}`,
        )
      : ["- none verified yet; capture exact candidate_peer_spawn peerRunIds before cleanup"]),
    ...(cleanup.blockers.length > 0
      ? cleanup.blockers.map((blocker) => `- blocker: ${blocker}`)
      : ["- blockers: none"]),
    "",
    "New Level-4 receipts:",
    ...(runner.newReceipts.length > 0
      ? runner.newReceipts.map(
          (receipt) =>
            `- #${receipt.actionIndex}: ${receipt.disposition}; id=${receipt.receiptId}; call=${receipt.call}`,
        )
      : ["- none"]),
    "",
    "Exact gates preserved:",
    ...runner.exactGatesPreserved.map((gate) => `- ${gate}`),
    "",
    "Next legal actions:",
    ...(runner.nextLegalActions.length > 0
      ? runner.nextLegalActions.map((action) => `- ${action}`)
      : ["- none"]),
    "",
    "Boundaries:",
    ...runner.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${runner.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchLevel3AuthorizedFinalizerCleanupPlanReport(
  plan: AutoresearchLevel3AuthorizedFinalizerCleanupPlan,
): string {
  return [
    "Autoresearch live supervision — level3_authorized_finalizer_cleanup_plan",
    `Task: #${plan.taskId}`,
    `CWD: ${plan.cwd}`,
    `Manifest hash: ${plan.manifestHash ?? "missing"}`,
    `Execution: ${plan.execution}`,
    `authorized_finalizer_cleanup_blockers: ${plan.metric.value} (target=${plan.metric.target}, ${plan.metric.status})`,
    `finalizer_token_application_blockers: ${plan.cellMetrics.finalizerTokenApplicationBlockers.value} (${plan.cellMetrics.finalizerTokenApplicationBlockers.status})`,
    `cleanup_execution_gate_blockers: ${plan.cellMetrics.cleanupExecutionGateBlockers.value} (${plan.cellMetrics.cleanupExecutionGateBlockers.status})`,
    `post_fanin_rollback_blockers: ${plan.cellMetrics.postFaninRollbackBlockers.value} (${plan.cellMetrics.postFaninRollbackBlockers.status})`,
    `Finalizer token posture: ${plan.finalizerAuthorization.posture}`,
    `Required finalizer token: ${plan.finalizerAuthorization.requiredToken}`,
    `Cleanup posture: ${plan.cleanupAuthorization.posture}`,
    `Required cleanup token: ${plan.cleanupAuthorization.requiredToken}`,
    `Manifest cleanup policy accepted: ${plan.cleanupAuthorization.manifestPolicyAccepted ? "yes" : "no"}`,
    `Integration closeout: ${plan.integrationCloseout.status}${plan.integrationCloseout.commit ? ` (${plan.integrationCloseout.commit})` : ""}`,
    "",
    "Finalizer packet:",
    plan.finalizerApplyCommandPacket
      ? `- ${plan.finalizerApplyCommandPacket.kind}; commands=${plan.finalizerApplyCommandPacket.exactCommands.length}; execution=${plan.finalizerApplyCommandPacket.applyExecution}`
      : "- blocked/withheld",
    ...(plan.finalizerApplyCommandPacket
      ? plan.finalizerApplyCommandPacket.exactCommands.map((command) => `  - ${command}`)
      : []),
    "",
    "Candidate lifecycle-v2 closeout handoff:",
    plan.cleanupCommandPacket
      ? `- ${plan.cleanupCommandPacket.kind}; execution=${plan.cleanupCommandPacket.cleanupExecution}; trigger=${plan.cleanupCommandPacket.cleanupTrigger}`
      : "- blocked/withheld",
    ...(plan.cleanupCommandPacket
      ? [
          `  peer run ids: ${plan.cleanupCommandPacket.exactPeerRunIds.join(", ") || "none"}`,
          `  peer tabs/sessions: ${plan.cleanupCommandPacket.exactPeerTabsOrSessions.join(", ") || "none"}`,
          `  worktrees: ${plan.cleanupCommandPacket.exactWorktrees.join(", ") || "none"}`,
          `  branches: ${plan.cleanupCommandPacket.exactBranches.join(", ") || "none"}`,
          `  lifecycle status call: ${plan.cleanupCommandPacket.candidateLifecycleStatusCall}`,
          `  lifecycle plan call: ${plan.cleanupCommandPacket.candidateLifecyclePlanCall}`,
          "  raw cleanup commands: none",
        ]
      : []),
    "",
    "Rollback receipt:",
    `- ${plan.rollbackReceipt.kind}; non-authoritative=${plan.rollbackReceipt.nonAuthoritative ? "yes" : "no"}; durable evidence=${plan.rollbackReceipt.durableEvidence ? "yes" : "no"}; next=${plan.rollbackReceipt.nextState}`,
    `- rollback hint: ${plan.rollbackReceipt.rollbackHint}`,
    "",
    "Blockers:",
    ...(plan.blockers.length > 0 ? plan.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "Next legal actions:",
    ...plan.nextLegalActions.map((action) => `- ${action}`),
    "",
    "Non-actions:",
    ...plan.nonActions.map((action) => `- ${action}`),
    "",
    "Boundaries:",
    ...plan.boundaries.map((boundary) => `- ${boundary}`),
  ].join("\n");
}

export function formatAutoresearchMatrixCampaignOperatorFollowupReport(
  followup: AutoresearchMatrixCampaignOperatorFollowup,
): string[] {
  return [
    "Operator follow-up/current-state summary:",
    `- kind: ${followup.kind}`,
    `- current state: ${followup.currentState}`,
    `- cell primary metric: ${followup.primaryMetric.targetSummary}`,
    `- checkpoint state: ${followup.checkpointState.posture}`,
    `- checkpoint manifest: ${followup.checkpointState.manifestPath ?? "none"}`,
    `- checkpoint accepted: ${
      followup.checkpointState.checkpointAccepted === null
        ? "n/a"
        : followup.checkpointState.checkpointAccepted
          ? "yes"
          : "no"
    }`,
    `- checkpoint warning: ${followup.checkpointState.warning}`,
    `- measurement/review state: ${followup.measurementReviewState.posture}`,
    `- cell progress: ${followup.measurementReviewState.completedCells}/${followup.measurementReviewState.expectedCells}`,
    `- selected cells: ${followup.measurementReviewState.selectedCells}`,
    `- benchmark/export/review calls exposed: ${
      followup.measurementReviewState.benchmarkExportReviewCallsExposed ? "yes" : "no"
    }`,
    `- review_matrix_campaign call: ${
      followup.measurementReviewState.reviewMatrixCampaignCall ?? "not exposed here"
    }`,
    `- level2_packet_planning_blockers: ${followup.level2PacketPlanningBlockers.value} (target=${followup.level2PacketPlanningBlockers.target}, ${followup.level2PacketPlanningBlockers.status})`,
    `- Missing token list: ${followup.level2PacketPlanningBlockers.missingTokens.length > 0 ? followup.level2PacketPlanningBlockers.missingTokens.join(", ") : "none"}`,
    `- Level-1 fallback: ${followup.level2PacketPlanningBlockers.level1Fallback}`,
    `- No-hidden-execution boundary: ${followup.level2PacketPlanningBlockers.noHiddenExecutionBoundary}`,
    "- lane packet paths:",
    ...followup.lanePacketPaths.map(
      (lane) => `  - ${lane.cellId}/${lane.laneId}: ${lane.packetPath} [${lane.state}]`,
    ),
    "- next legal actions:",
    ...followup.nextLegalActions.map((action) => `  - ${action}`),
    "- UX proof checklist:",
    ...followup.blockersChecklist.map(
      (item) => `  - ${item.status}: ${item.proof} via ${item.source}`,
    ),
    "",
  ];
}

export function formatAutoresearchMatrixCampaignCockpitReport(
  cockpit: AutoresearchMatrixCampaignCockpit,
): string[] {
  return [
    "Matrix campaign cockpit/dashboard:",
    `- kind: ${cockpit.kind}`,
    `- source: ${cockpit.source}`,
    `- matrix_cockpit_blockers: ${cockpit.matrixCockpitBlockers.value} (target=${cockpit.matrixCockpitBlockers.target}, ${cockpit.matrixCockpitBlockers.direction} is better; ${cockpit.matrixCockpitBlockers.status})`,
    `- progress: ${cockpit.progress.summary}`,
    `- cell progress: ${cockpit.progress.completedCells}/${cockpit.progress.expectedCells}; selected=${cockpit.progress.selectedCells}; posture=${cockpit.progress.posture}`,
    "- compact cell table:",
    ...cockpit.cellRows.flatMap((cell) => [
      `  - ${cell.cellId}: posture=${cell.posture}; lanes=${cell.laneProgress}; selected=${cell.selectedLaneId ?? "none"}; selectedPacket=${cell.selectedPacketPath ?? "none"}`,
      `    next legal action: ${cell.nextLegalAction}`,
      ...cell.packetInventory.map((packet) => `    packet: ${packet}`),
    ]),
    "- selected lane inventory:",
    ...(cockpit.selectedLanes.length > 0
      ? cockpit.selectedLanes.map(
          (lane) => `  - ${lane.cellId}/${lane.laneId}: packet=${lane.sourcePacketPath ?? "none"}`,
        )
      : ["  - none selected yet"]),
    "- packet inventory:",
    ...cockpit.packetInventory.map(
      (lane) =>
        `  - ${lane.cellId}/${lane.laneId}: packet=${lane.packetPath ?? "none"}; state=${lane.state}; selected=${lane.selected ? "yes" : "no"}`,
    ),
    `- dashboard-first owner route: ${cockpit.ownerDecisionRoute.routeOrder.join(" -> ")}`,
    `- dashboard first: ${cockpit.ownerDecisionRoute.dashboardFirst}`,
    `- overlay fallback: ${cockpit.ownerDecisionRoute.overlayFallback}`,
    `- final decision: ${cockpit.ownerDecisionRoute.finalDecision}`,
    `- evidence after review: ${cockpit.ownerDecisionRoute.evidenceAfterReview ? "yes" : "no"}`,
    "- next legal campaign actions:",
    ...cockpit.nextLegalCampaignActions.map((action) => `  - ${action}`),
    "- level-2 operator UX dashboard:",
    `  - kind: ${cockpit.operatorUxDashboard.kind}`,
    `  - level2_operator_ux_blockers: ${cockpit.operatorUxDashboard.primaryMetric.value} (target=${cockpit.operatorUxDashboard.primaryMetric.target}, ${cockpit.operatorUxDashboard.primaryMetric.status})`,
    `  - checkpoint state: ${cockpit.operatorUxDashboard.currentCheckpointState}`,
    `  - packet inventory: ${cockpit.operatorUxDashboard.packetInventorySummary}`,
    "  - cell metrics:",
    ...cockpit.operatorUxDashboard.cellMetrics.map(
      (metric) => `    - ${metric.name}: ${metric.value} (${metric.status})`,
    ),
    `  - peer text: ${cockpit.operatorUxDashboard.tokenAndAuthorityLegend.peerText}`,
    `  - candidate-result packets: ${cockpit.operatorUxDashboard.tokenAndAuthorityLegend.candidateResultPackets}`,
    `  - review packets: ${cockpit.operatorUxDashboard.tokenAndAuthorityLegend.reviewPackets}`,
    `  - AK evidence: ${cockpit.operatorUxDashboard.tokenAndAuthorityLegend.akEvidence}`,
    `  - finalizer/cleanup/promotion: ${cockpit.operatorUxDashboard.tokenAndAuthorityLegend.finalizerCleanupPromotion}`,
    "  - fallback/recovery:",
    ...cockpit.operatorUxDashboard.fallbackAndRecovery.map((item) => `    - ${item}`),
    "  - UX proof checklist:",
    ...cockpit.operatorUxDashboard.proofs.map(
      (proof) => `    - ${proof.status}: ${proof.proof} via ${proof.source}`,
    ),
    "- no-hidden-execution/promotion boundaries:",
    ...cockpit.noHiddenExecutionBoundaries.map((boundary) => `  - ${boundary}`),
    "- cockpit proof checklist:",
    ...cockpit.matrixCockpitBlockers.proofs.map(
      (proof) => `  - ${proof.status}: ${proof.proof} via ${proof.source}`,
    ),
    "",
  ];
}

export function formatAutoresearchMatrixCampaignPlanReport(
  plan: AutoresearchMatrixCampaignPlan,
): string {
  return [
    "Autoresearch live supervision — plan_matrix_campaign",
    `Task: #${plan.taskId}`,
    `CWD: ${plan.cwd}`,
    `Objective: ${plan.objective}`,
    `Direction: ${plan.direction} is better`,
    ...formatAutoresearchMatrixCampaignOperatorFollowupReport(plan.operatorFollowup),
    `Matrix: ${plan.scenarios.length} scenario(s) × ${plan.hypotheses.length} hypothesis/hypotheses = ${plan.cells.length} cell(s)`,
    `Candidates per cell: ${plan.candidateCountPerCell}`,
    "",
    "Implementation-wave substrate:",
    `- posture: ${plan.implementationWaveSubstrate.posture}`,
    `- AK task: #${plan.implementationWaveSubstrate.akTaskId}`,
    `- owner decision UI: ${plan.implementationWaveSubstrate.ownerUiCommand}`,
    `- required runner: ${plan.implementationWaveSubstrate.handoffContract.requiredRunner}`,
    `- handoff: ${plan.implementationWaveSubstrate.handoffContract.handoff}`,
    `- controller-inline implementation: ${plan.implementationWaveSubstrate.handoffContract.controllerInlineImplementation}`,
    `- controller role: ${plan.implementationWaveSubstrate.handoffContract.controllerRole}`,
    ...plan.implementationWaveSubstrate.nextExactCalls.map((call) => `- first exact call: ${call}`),
    "",
    "Managed candidate-wave substrate:",
    `- kind: ${plan.managedWaveSubstrate.kind}`,
    `- cells: ${plan.managedWaveSubstrate.cellCount}`,
    `- candidates per cell: ${plan.managedWaveSubstrate.candidateCountPerCell}`,
    `- expected candidate lanes: ${plan.managedWaveSubstrate.expectedCandidateLaneCount}`,
    `- final-only scoring: ${plan.managedWaveSubstrate.finalOnlyScoring ? "yes" : "no"}`,
    `- controller measurement required: ${plan.managedWaveSubstrate.controllerMeasurementRequired ? "yes" : "no"}`,
    `- explicit packet paths gate selection: ${plan.managedWaveSubstrate.explicitPacketPathsGateSelection ? "yes" : "no"}`,
    `- required runner: ${plan.managedWaveSubstrate.handoffContract.requiredRunner}`,
    `- handoff: ${plan.managedWaveSubstrate.handoffContract.handoff}`,
    `- controller-inline implementation: ${plan.managedWaveSubstrate.handoffContract.controllerInlineImplementation}`,
    `- pi-autoresearch peer spawning: ${plan.managedWaveSubstrate.handoffContract.piAutoresearchPeerSpawning}`,
    ...plan.managedWaveSubstrate.checklist.map((item) => `- checklist: ${item}`),
    ...plan.managedWaveSubstrate.cellFanInCalls.map(
      (cell) =>
        `- ${cell.cellId} fan-in: plan=${cell.planCandidateWaveCall}; review=${cell.reviewCandidateWaveCall}`,
    ),
    "",
    "Level-2 packet-only planning:",
    `- kind: ${plan.level2PacketPlanning.kind}`,
    `- packet only: ${plan.level2PacketPlanning.packetOnly ? "yes" : "no"}`,
    `- execution: ${plan.level2PacketPlanning.execution}`,
    `- metric: ${plan.level2PacketPlanning.metric.name}=${plan.level2PacketPlanning.metric.value} (${plan.level2PacketPlanning.metric.status})`,
    `- anti-narrowing posture: ${plan.level2PacketPlanning.antiNarrowing.posture}`,
    `- launch token: ${plan.level2PacketPlanning.tokenVocabulary.launchVisibleCandidateLanes.tokenName}`,
    `- finalizer token: ${plan.level2PacketPlanning.tokenVocabulary.postFaninFinalizer.tokenName}`,
    `- evidence token: ${plan.level2PacketPlanning.tokenVocabulary.akOwnerWrite.tokenName}`,
    `- cleanup token: ${plan.level2PacketPlanning.tokenVocabulary.candidateCleanup.tokenName}`,
    `- promotion token: ${plan.level2PacketPlanning.tokenVocabulary.promotion.tokenName}`,
    `- launch posture: ${plan.level2PacketPlanning.packets.launchVisibleCandidateLanes.posture}`,
    `- withheld launch calls: ${plan.level2PacketPlanning.packets.launchVisibleCandidateLanes.withheldLaunchCallCount}`,
    ...plan.level2PacketPlanning.boundaries.map((boundary) => `- boundary: ${boundary}`),
    "",
    "Owner review route:",
    `- primary UI: ${plan.ownerReview.primaryUi.surface}`,
    `- primary UI command: ${plan.ownerReview.primaryUi.slashCommand}`,
    `- primary UI fallback: ${plan.ownerReview.primaryUi.fallbackSlashCommand}`,
    `- primary UI summary: ${plan.ownerReview.primaryUi.summary}`,
    `- final decision UI: ${plan.ownerReview.decisionUi.surface}`,
    `- final decision UI command: ${plan.ownerReview.decisionUi.slashCommand}`,
    `- final decision UI summary: ${plan.ownerReview.decisionUi.summary}`,
    ...plan.ownerReview.reviewFlow.map((step) => `- ${step}`),
    ...plan.ownerReview.cellReviewCalls.map(
      (cell) => `- ${cell.cellId} review call: ${cell.reviewCandidateWaveCall}`,
    ),
    `- boundary: ${plan.ownerReview.boundary}`,
    "",
    "Matrix cells:",
    ...plan.cells.flatMap((cell) => [
      `- ${cell.cellId}: scenario=${cell.scenario}; hypothesis=${cell.hypothesis}`,
      `  objective: ${cell.objective}`,
      `  packet dir: ${cell.candidatePacketDirectory}`,
      `  plan: ${cell.planCandidateWaveCall}`,
      `  review: ${cell.reviewCandidateWaveCall}`,
      `  owner decision UI after review: ${cell.ownerUiCommand}`,
      `  managed wave posture: ${cell.managedWavePosture}`,
      `  fan-in gate: ${cell.fanInGate}`,
    ]),
    "",
    "Boundaries:",
    ...plan.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${plan.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchMatrixCampaignRunnerContractReport(
  contract: AutoresearchMatrixCampaignRunnerContract,
): string {
  return [
    "Autoresearch live supervision — prepare_matrix_campaign_runner",
    `Task: #${contract.taskId}`,
    `CWD: ${contract.cwd}`,
    `Objective: ${contract.objective}`,
    `Direction: ${contract.direction} is better`,
    ...formatAutoresearchMatrixCampaignOperatorFollowupReport(contract.operatorFollowup),
    "Runner manifest:",
    `- kind: ${contract.kind}`,
    `- path: ${contract.manifest.path}`,
    `- identity anchor: ${contract.manifest.identityAnchor}`,
    `- exact task id: ${contract.manifest.exactTaskId}`,
    `- exact cwd: ${contract.manifest.exactCwd}`,
    `- cells: ${contract.manifest.cellCount}`,
    `- candidate lanes: ${contract.manifest.candidateLaneCount}`,
    `- package owner boundary: ${contract.manifest.packageOwnerBoundary}`,
    `- durable evidence: ${contract.manifest.durableEvidence ? "yes" : "no"}`,
    "",
    "Launch phase:",
    `- posture: ${contract.launchPhase.posture}`,
    `- allowed tool: ${contract.launchPhase.allowedTool}`,
    `- parent peer target: ${contract.launchPhase.parentPeerTarget ?? "required before launch"}`,
    `- visible_candidate_lane_binding_blockers: ${contract.launchPhase.visibleCandidateLaneBinding.value} (target=${contract.launchPhase.visibleCandidateLaneBinding.target}, ${contract.launchPhase.visibleCandidateLaneBinding.status})`,
    `- visible launch calls: ${contract.launchPhase.visibleCandidateLaneBinding.visibleLaunchCallCount}/${contract.launchPhase.visibleCandidateLaneBinding.expectedLaneCount}`,
    `- hidden launch calls: ${contract.launchPhase.visibleCandidateLaneBinding.hiddenLaunchCallCount}`,
    ...contract.launchPhase.launchCalls.map((call) => `- launch: ${call}`),
    "",
    "Checkpoint gate:",
    `- posture: ${contract.checkpointGate.posture}`,
    `- confirmation parameter: ${contract.checkpointGate.confirmationParameter}`,
    `- required token: ${contract.checkpointGate.requiredToken}`,
    `- exact checkpoint call: ${contract.checkpointGate.exactCheckpointCall}`,
    `- blocked until confirmed: ${contract.checkpointGate.blockedUntilConfirmed.join(", ")}`,
    `- benchmark/export/review calls: ${contract.lockedBenchmarkExportReview.posture}; count=${contract.lockedBenchmarkExportReview.calls.length}`,
    "",
    "Lanes:",
    ...contract.lanes.flatMap((lane) => [
      `- ${lane.cellId}/${lane.laneId}: ${lane.objective}`,
      `  packet path: ${lane.candidateResultPacketPath}`,
    ]),
    "",
    "Boundaries:",
    ...contract.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${contract.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchMatrixCampaignControllerCommandPacketReport(
  packet: AutoresearchMatrixCampaignControllerCommandPacket | null,
): string[] {
  if (!packet) return ["Controller-command packet: locked until exact checkpoint"];

  return [
    "Controller-command packet / next-call bundle:",
    `- kind: ${packet.kind}`,
    `- manifest: ${packet.manifestPath}`,
    `- exact task/cwd: #${packet.exactTaskId} @ ${packet.exactCwd}`,
    `- cell metric: ${packet.cellMetric.name} (${packet.cellMetric.direction} is better; target=${packet.cellMetric.target ?? "none"})`,
    `- glue metric: ${packet.manualControllerGlueBlockers.name} target=${packet.manualControllerGlueBlockers.target}`,
    `- lineage verification required: ${packet.checkpointAndLineageVerification.controllerVerifiedLineageRequired ? "yes" : "no"}`,
    `- PEER_FINAL communication only: ${packet.checkpointAndLineageVerification.peerFinalIsCommunicationOnly ? "yes" : "no"}`,
    "- verification steps:",
    ...packet.checkpointAndLineageVerification.verificationSteps.map((step) => `  - ${step}`),
    "- proof checklist:",
    ...packet.manualControllerGlueBlockers.proofChecklist.map(
      (item) => `  - ${item.status}: ${item.proof} via ${item.source}`,
    ),
    "- per-cell controller sequence:",
    ...packet.cells.flatMap((cell) => [
      `  - ${cell.cellId}: ${cell.exactControllerSequence.join(" -> ")}`,
      ...cell.lanes.flatMap((lane) => [
        `    - ${lane.laneId} bind: ${lane.bindCall}`,
        `    - ${lane.laneId} metric run: ${lane.metricRunCall}`,
        `    - ${lane.laneId} export: ${lane.candidateResultExportCall}`,
        `    - ${lane.laneId} metric: ${lane.metricBindingSummary}`,
      ]),
      `    - review candidate wave: ${cell.reviewCandidateWaveCall}`,
      `    - review matrix campaign: ${cell.reviewMatrixCampaignCall}`,
    ]),
    "- flattened next-call bundle:",
    ...packet.flattenedNextCallBundle.map((call) => `  - ${call}`),
    "- boundaries:",
    ...packet.boundaries.map((boundary) => `  - ${boundary}`),
  ];
}

export function formatAutoresearchMatrixCampaignRunnerCheckpointReport(
  checkpoint: AutoresearchMatrixCampaignRunnerCheckpoint,
): string {
  return [
    "Autoresearch live supervision — checkpoint_matrix_campaign_runner",
    `Task: #${checkpoint.taskId}`,
    `CWD: ${checkpoint.cwd}`,
    `Objective: ${checkpoint.objective}`,
    `Manifest: ${checkpoint.manifestPath}`,
    `Checkpoint accepted: ${checkpoint.checkpointAccepted ? "yes" : "no"}`,
    `Posture: ${checkpoint.posture}`,
    `Required token: ${checkpoint.requiredToken}`,
    ...formatAutoresearchMatrixCampaignOperatorFollowupReport(checkpoint.operatorFollowup),
    ...formatAutoresearchMatrixCampaignCockpitReport(checkpoint.cockpit),
    ...(checkpoint.benchmarkExportReviewCalls.length > 0
      ? [
          "",
          "Unlocked benchmark/export/review calls:",
          ...checkpoint.benchmarkExportReviewCalls.map((call) => `- ${call}`),
        ]
      : ["", "Unlocked benchmark/export/review calls: none"]),
    checkpoint.reviewMatrixCampaignCall
      ? `Matrix review call: ${checkpoint.reviewMatrixCampaignCall}`
      : "Matrix review call: locked",
    "",
    ...formatAutoresearchMatrixCampaignControllerCommandPacketReport(
      checkpoint.controllerCommandPacket,
    ),
    "",
    "Boundaries:",
    ...checkpoint.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${checkpoint.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchMatrixCampaignReviewReport(
  review: AutoresearchMatrixCampaignReview,
): string {
  return [
    "Autoresearch live supervision — review_matrix_campaign",
    `Task: #${review.taskId}`,
    `CWD: ${review.cwd}`,
    `Objective: ${review.objective}`,
    `Direction: ${review.direction} is better`,
    `Posture: ${review.posture}`,
    `Cell progress: ${review.completedCellCount}/${review.expectedCellCount}`,
    `Selected cells: ${review.selectedCellCount}`,
    ...formatAutoresearchMatrixCampaignOperatorFollowupReport(review.operatorFollowup),
    ...formatAutoresearchMatrixCampaignCockpitReport(review.cockpit),
    "Review matrix-campaign packet:",
    `- kind: ${review.reviewPacket.kind}`,
    `- generated from: ${review.reviewPacket.generatedFrom}`,
    `- packet chain metric: ${review.reviewPacket.packetChainMetric.name}=${review.reviewPacket.packetChainMetric.value} (${review.reviewPacket.packetChainMetric.status})`,
    `- candidate-result packet refs: ${review.reviewPacket.candidateResultPacketRefs.length}`,
    `- durable evidence: ${review.reviewPacket.authorityBoundary.durableEvidence ? "yes" : "no"}`,
    `- promotion authority: ${review.reviewPacket.authorityBoundary.promotionAuthority ? "yes" : "no"}`,
    `- can close matrix target: ${review.reviewPacket.canCloseMatrixTarget ? "yes" : "no"}`,
    `- whole-matrix metric posture: ${review.reviewPacket.wholeMatrixMetricPosture.name}=${review.reviewPacket.wholeMatrixMetricPosture.value} (target=${review.reviewPacket.wholeMatrixMetricPosture.target}, ${review.reviewPacket.wholeMatrixMetricPosture.status})`,
    `- source metric: ${review.reviewPacket.wholeMatrixMetricPosture.sourceMetricName}; target=${review.reviewPacket.wholeMatrixMetricPosture.sourceMetricTarget ?? "none"}`,
    `- proof-only/baseline-only closure blocked: ${review.reviewPacket.wholeMatrixMetricPosture.proofOnlyBaselineOnlyTargetClosureBlocked ? "yes" : "no"}`,
    `- incomplete-matrix exception recorded: ${review.reviewPacket.wholeMatrixMetricPosture.incompleteMatrixExceptionRecorded ? "yes" : "no"}`,
    `- explicit downgrade recorded: ${review.reviewPacket.wholeMatrixMetricPosture.explicitDowngradeRecorded ? "yes" : "no"}`,
    "- lane disposition options:",
    ...review.reviewPacket.laneDispositionOptions.map(
      (option) => `  - ${option.option}: ${option.posture}; ${option.description}`,
    ),
    `- boundary: ${review.reviewPacket.authorityBoundary.boundary}`,
    "",
    "Level-3 review/selection substrate:",
    `- kind: ${review.level3ReviewSelection.kind}`,
    `- source: ${review.level3ReviewSelection.source}`,
    `- aggregation input: ${review.level3ReviewSelection.aggregationInput}`,
    `- level3_review_selection_blockers: ${review.level3ReviewSelection.blockerMetric.value} (target=${review.level3ReviewSelection.blockerMetric.target}, ${review.level3ReviewSelection.blockerMetric.status})`,
    `- finalizer readiness: ${review.level3ReviewSelection.finalizerReadiness.posture}; selected=${review.level3ReviewSelection.finalizerReadiness.selectedLaneCount}/${review.level3ReviewSelection.finalizerReadiness.expectedCellCount}; validation required=${review.level3ReviewSelection.finalizerReadiness.validationStillRequired ? "yes" : "no"}`,
    `- apply commands exposed: ${review.level3ReviewSelection.finalizerReadiness.applyCommandsExposed ? "yes" : "no"}; promotion authority: ${review.level3ReviewSelection.finalizerReadiness.promotionAuthority ? "yes" : "no"}; cleanup authority: ${review.level3ReviewSelection.finalizerReadiness.cleanupAuthority ? "yes" : "no"}`,
    `- required owner tokens: ${review.level3ReviewSelection.finalizerReadiness.requiredOwnerTokens.join(", ")}`,
    ...(review.level3ReviewSelection.finalizerReadiness.exactFinalizePostFaninHandoffCall
      ? [
          `- finalize_post_fanin handoff call: ${review.level3ReviewSelection.finalizerReadiness.exactFinalizePostFaninHandoffCall}`,
        ]
      : ["- finalize_post_fanin handoff call: blocked"]),
    "- per-cell winner state:",
    ...review.level3ReviewSelection.cellSelections.map(
      (cell) =>
        `  - ${cell.cellId}: ${cell.winnerState}; selected=${cell.recommendedLaneId ?? "none"}; metric=${cell.recommendedMetric ?? "missing"}; visible=${cell.visibleCandidateLaneCount}/${cell.expectedLaneCount}; blockers=${cell.blockerCount}`,
    ),
    ...(review.level3ReviewSelection.blockerMetric.blockers.length > 0
      ? review.level3ReviewSelection.blockerMetric.blockers.map(
          (blocker) => `- level-4 blocker: ${blocker}`,
        )
      : ["- level-4 blockers: none"]),
    ...review.level3ReviewSelection.nextLegalActions.map(
      (action) => `- level-4 next legal action: ${action}`,
    ),
    ...review.level3ReviewSelection.boundaries.map((boundary) => `- boundary: ${boundary}`),
    "",
    "Managed cell reviews:",
    ...review.cells.flatMap((cell) => [
      `- ${cell.cellId}: scenario=${cell.scenario}; hypothesis=${cell.hypothesis}`,
      `  posture: ${cell.recommendationPosture}; selected lane: ${cell.selectedLaneId ?? "none"}`,
      `  lane progress: ${cell.completedLaneCount}/${cell.expectedLaneCount}`,
      `  review call: ${cell.reviewCandidateWaveCall}`,
    ]),
    "",
    "Owner review route:",
    `- primary UI: ${review.ownerReview.primaryUi.surface}`,
    `- primary UI command: ${review.ownerReview.primaryUi.slashCommand}`,
    `- primary UI fallback: ${review.ownerReview.primaryUi.fallbackSlashCommand}`,
    `- primary UI summary: ${review.ownerReview.primaryUi.summary}`,
    `- final decision UI: ${review.ownerReview.decisionUi.surface}`,
    `- final decision UI command: ${review.ownerReview.decisionUi.slashCommand}`,
    `- final decision UI summary: ${review.ownerReview.decisionUi.summary}`,
    ...review.ownerReview.reviewFlow.map((step) => `- ${step}`),
    `- boundary: ${review.ownerReview.boundary}`,
    "",
    "Campaign closeout:",
    `- kind: ${review.closeout.kind}`,
    `- posture: ${review.closeout.posture}`,
    `- summary: ${review.closeout.summary}`,
    `- packet paths: ${review.closeout.packetPaths.length}`,
    "- closeout packet inventory:",
    ...review.closeout.packetInventory.map(
      (lane) =>
        `  - ${lane.cellId}/${lane.laneId}: packet=${lane.packetPath ?? "none"}; state=${lane.state}; selected=${lane.selected ? "yes" : "no"}`,
    ),
    ...review.closeout.selectedLanes.map(
      (lane) =>
        `- selected ${lane.cellId}: lane=${lane.laneId}; packet=${lane.sourcePacketPath ?? "none"}`,
    ),
    `- evidence_handoff_blockers: ${review.closeout.evidenceHandoffBlockers.value} (target=${review.closeout.evidenceHandoffBlockers.target}, ${review.closeout.evidenceHandoffBlockers.direction} is better; ${review.closeout.evidenceHandoffBlockers.status})`,
    `- evidence projection: ${review.closeout.evidenceProjection.posture} via ${review.closeout.evidenceProjection.ownerSurface}; anchor=${review.closeout.evidenceProjection.requiredAnchor}`,
    `- evidence projection key: ${review.closeout.evidenceProjection.projectionKey}`,
    `- evidence handoff: ${review.closeout.evidenceProjection.exactHandoff}`,
    ...(review.closeout.evidenceProjection.exactRecordCall
      ? [`- evidence record call: ${review.closeout.evidenceProjection.exactRecordCall}`]
      : []),
    ...review.closeout.evidenceProjection.guidance.map((item) => `- projection guidance: ${item}`),
    `- evidence boundary: ${review.closeout.evidenceProjection.boundary}`,
    `- dashboard first: ${review.closeout.ownerDecisionRoute.dashboardFirst}`,
    `- overlay fallback: ${review.closeout.ownerDecisionRoute.overlayFallback}`,
    `- final decision: ${review.closeout.ownerDecisionRoute.finalDecision}`,
    `- owner route order: ${review.closeout.ownerDecisionRoute.routeOrder.join(" -> ")}`,
    `- evidence after review: ${review.closeout.ownerDecisionRoute.evidenceAfterReview ? "yes" : "no"}`,
    "- evidence handoff proof checklist:",
    ...review.closeout.evidenceHandoffBlockers.proofs.map(
      (item) => `  - ${item.status}: ${item.proof} via ${item.source}`,
    ),
    "- learning activation:",
    `  - posture: ${review.closeout.learningActivation.posture}`,
    `  - required packet: ${review.closeout.learningActivation.requiredPacketKind}`,
    `  - learning_activation_blockers: ${review.closeout.learningActivationBlockers.value} (target=${review.closeout.learningActivationBlockers.target}, ${review.closeout.learningActivationBlockers.direction} is better; ${review.closeout.learningActivationBlockers.status})`,
    review.closeout.learningActivation.exactLearningExportCall
      ? `  - learning export call: ${review.closeout.learningActivation.exactLearningExportCall}`
      : "  - learning export call: blocked",
    review.closeout.learningActivation.exactAdapterPlanCall
      ? `  - adapter plan call: ${review.closeout.learningActivation.exactAdapterPlanCall}`
      : "  - adapter plan call: blocked",
    review.closeout.learningActivation.exactAdapterMaterializeCall
      ? `  - adapter materialize call: ${review.closeout.learningActivation.exactAdapterMaterializeCall}`
      : "  - adapter materialize call: blocked",
    `  - route order: ${review.closeout.learningActivation.routeOrder.join(" -> ")}`,
    ...review.closeout.learningActivation.guidance.map((item) => `  - guidance: ${item}`),
    `  - boundary: ${review.closeout.learningActivation.boundary}`,
    "- learning activation proof checklist:",
    ...review.closeout.learningActivationBlockers.proofs.map(
      (item) => `  - ${item.status}: ${item.proof} via ${item.source}`,
    ),
    "- next legal owner actions:",
    ...review.closeout.nextLegalOwnerActions.map((action) => `  - ${action}`),
    "- not done:",
    ...review.closeout.notDone.map((item) => `  - ${item}`),
    ...(review.exactNextCalls.length > 0
      ? ["", "Exact next calls:", ...review.exactNextCalls.map((call) => `- ${call}`)]
      : []),
    "",
    "Boundaries:",
    ...review.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${review.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchPostFaninFinalizerReport(
  result: AutoresearchPostFaninFinalizerResult,
): string {
  return [
    "Autoresearch live supervision — finalize_post_fanin",
    `Task: #${result.contract.taskId}`,
    `CWD: ${result.contract.cwd}`,
    `Source review: ${result.contract.sourceReview}`,
    `Outcome: ${result.outcome}`,
    `Preflight: ${result.preflight.status} (${result.preflight.blockerCount} blocker(s))`,
    `manual_post_fanin_residue: ${result.manualPostFaninResidue.value} (target=${result.manualPostFaninResidue.target}, ${result.manualPostFaninResidue.direction} is better; ${result.manualPostFaninResidue.status})`,
    `authorized_finalizer_cleanup_blockers: ${result.authorizedFinalizerCleanupGate.value} (target=${result.authorizedFinalizerCleanupGate.target}, ${result.authorizedFinalizerCleanupGate.direction} is better; ${result.authorizedFinalizerCleanupGate.status})`,
    `Cleanup authorized: ${result.authorizedFinalizerCleanupGate.cleanupAuthorized ? "yes" : "no"}; promotion authorized: ${result.authorizedFinalizerCleanupGate.promotionAuthorized ? "yes" : "no"}`,
    `Candidate peer tab/session closure is part of cleanup: ${result.authorizedFinalizerCleanupGate.candidatePeerTabClosureIncludedInCleanup ? "yes" : "no"}`,
    `Separate cleanup evidence required: ${result.authorizedFinalizerCleanupGate.cleanupEvidenceRequired ? "yes" : "no"}`,
    `Separate tokens still required: ${result.authorizedFinalizerCleanupGate.requiredSeparateTokens.join(", ")}`,
    `Authorization token: ${result.contract.exactAuthorizationToken}`,
    "",
    "Closeout receipt:",
    `- kind: ${result.closeoutReceipt.kind}`,
    `- status: ${result.closeoutReceipt.status}`,
    `- execution: ${result.closeoutReceipt.execution}`,
    `- validation: ${result.closeoutReceipt.validation.status}${result.closeoutReceipt.validation.command ? ` via ${result.closeoutReceipt.validation.command}` : ""}`,
    `- finalizer apply: ${result.closeoutReceipt.finalizerApply.posture}; commands=${result.closeoutReceipt.finalizerApply.commandCount}`,
    `- evidence handoff: ${result.closeoutReceipt.evidenceHandoff.posture}`,
    `- cleanup handoff: ${result.closeoutReceipt.cleanupHandoff.posture}`,
    ...(result.closeoutReceipt.blockedReasons.length > 0
      ? result.closeoutReceipt.blockedReasons.map((reason) => `- blocked: ${reason}`)
      : ["- blocked: none"]),
    ...result.closeoutReceipt.recoveryNotes.map((note) => `- recovery: ${note}`),
    "",
    "Finalizer-token request:",
    `- kind: ${result.finalizerTokenRequest.kind}`,
    `- required token: ${result.finalizerTokenRequest.requiredTokenName}`,
    `- request execution: ${result.finalizerTokenRequest.requestExecution}`,
    `- metric: ${result.finalizerTokenRequest.metricPosture.name}=${result.finalizerTokenRequest.metricPosture.value} (target=${result.finalizerTokenRequest.metricPosture.target}, ${result.finalizerTokenRequest.metricPosture.status})`,
    `- source metric: ${result.finalizerTokenRequest.metricPosture.sourceMetricName} (${result.finalizerTokenRequest.metricPosture.sourceMetricStatus})`,
    `- packet chain metric: ${result.finalizerTokenRequest.packetChainTrace.metric.name}=${result.finalizerTokenRequest.packetChainTrace.metric.value} (target=${result.finalizerTokenRequest.packetChainTrace.metric.target}, ${result.finalizerTokenRequest.packetChainTrace.metric.status})`,
    `- source review packet: ${result.finalizerTokenRequest.packetChainTrace.sourceReviewPacketKind}`,
    `- review result: ${result.finalizerTokenRequest.reviewResultReference.sourceReview}; posture=${result.finalizerTokenRequest.reviewResultReference.posture}`,
    `- candidate-result packet refs: ${result.finalizerTokenRequest.candidateResultPacketRefs.join(", ") || "none"}`,
    `- selected lanes: ${result.finalizerTokenRequest.reviewResultReference.selectedLaneIds.join(", ") || "none"}`,
    `- apply commands withheld until token: ${result.finalizerTokenRequest.permittedFinalizerScope.applyCommandsWithheldUntilToken ? "yes" : "no"}`,
    `- separate owner tokens required: ${result.finalizerTokenRequest.separateOwnerTokensRequired.join(", ")}`,
    ...result.finalizerTokenRequest.boundaries.map((boundary) => `- boundary: ${boundary}`),
    ...result.finalizerTokenRequest.nextLegalActions.map(
      (action) => `- next legal action: ${action}`,
    ),
    "",
    "Preflight checks:",
    ...result.preflight.checks.flatMap((check) => [
      `- ${check.name}: ${check.status} — ${check.summary}`,
      ...check.evidence.map((item) => `  - ${item}`),
    ]),
    "",
    "Authorized finalizer/cleanup gate proof:",
    ...result.authorizedFinalizerCleanupGate.proofs.map((proof) => `- ${proof}`),
    ...(result.authorizedFinalizerCleanupGate.forbiddenCommandMatches.length > 0
      ? result.authorizedFinalizerCleanupGate.forbiddenCommandMatches.map(
          (command) => `- forbidden command match: ${command}`,
        )
      : ["- forbidden command matches: none"]),
    "",
    result.exactApplyCommandPacket
      ? `Apply packet: ${result.exactApplyCommandPacket.kind} (${result.exactApplyCommandPacket.exactCommands.length} command(s); not executed by orchestrator)`
      : "Apply packet: blocked",
    ...(result.exactApplyCommandPacket
      ? [
          "Exact apply commands:",
          ...result.exactApplyCommandPacket.exactCommands.map((command) => `- ${command}`),
        ]
      : []),
    "",
    "Boundaries:",
    ...result.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${result.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchCandidateWaveReviewReport(
  review: AutoresearchCandidateWaveReview,
): string {
  return [
    "Autoresearch live supervision — review_candidate_wave",
    `Task: #${review.taskId}`,
    `CWD: ${review.cwd}`,
    `Objective: ${review.objective}`,
    `Direction: ${review.direction} is better`,
    `Packet discovery: ${review.packetDiscovery.mode} — ${review.packetDiscovery.message}`,
    ...(review.packetDiscovery.candidateResultPacketPaths.length > 0
      ? [`Packet paths: ${review.packetDiscovery.candidateResultPacketPaths.join(", ")}`]
      : []),
    "",
    "Candidate comparison:",
    ...review.lanes.flatMap((lane) => {
      const candidatePointers = [
        lane.candidateSource ? `source=${lane.candidateSource}` : null,
        lane.candidateBranch ? `branch=${lane.candidateBranch}` : null,
        lane.candidateWorktree ? `worktree=${lane.candidateWorktree}` : null,
        lane.candidateBaseRef ? `base=${lane.candidateBaseRef}` : null,
        lane.candidatePeerRunId ? `peerRunId=${lane.candidatePeerRunId}` : null,
        lane.candidateRunnerId ? `runnerId=${lane.candidateRunnerId}` : null,
      ].filter(Boolean);
      return [
        `- ${lane.rank ? `#${lane.rank} ` : ""}${lane.laneId}: metric=${lane.metric ?? "missing"}; status=${lane.status}; checks=${lane.checksStatus}; selectable=${lane.selectable ? "yes" : "no"} (${lane.selectionReason})`,
        lane.sourcePacketPath ? `  source packet: ${lane.sourcePacketPath}` : null,
        candidatePointers.length > 0 ? `  candidate: ${candidatePointers.join("; ")}` : null,
        lane.candidateFilesChanged.length > 0
          ? `  files changed: ${lane.candidateFilesChanged.join(", ")}`
          : null,
        lane.caveat ? `  caveat: ${lane.caveat}` : null,
        lane.status === "missing_packet"
          ? "  missing_packet guidance: verify/export the candidate-result packet path after measurement, or treat this lane as still running/failed and leave it non-selectable until a packet exists."
          : null,
      ].filter((line): line is string => line !== null);
    }),
    "",
    `Recommendation: ${review.recommendation.posture}${review.recommendation.laneId ? ` — ${review.recommendation.laneId}` : ""}`,
    `Reason: ${review.recommendation.reason}`,
    "",
    "Wave fan-in management:",
    `- kind: ${review.management.kind}`,
    `- wave id: ${review.management.waveId}`,
    `- posture: ${review.management.posture}`,
    `- lane progress: ${review.management.completedLaneCount}/${review.management.expectedLaneCount}`,
    `- final-only scoring: ${review.management.finalOnlyScoring ? "yes" : "no"}`,
    `- controller measurement required: ${review.management.controllerMeasurementRequired ? "yes" : "no"}`,
    ...review.management.laneStates.map(
      (lane) =>
        `- ${lane.laneId}: ${lane.state}; metric=${lane.metric ?? "missing"}; selectable=${lane.selectable ? "yes" : "no"}; packet=${lane.candidateResultPacketPath ?? "none"}; next=${lane.nextStep}`,
    ),
    ...review.management.fanInChecklist.map((item) => `- checklist: ${item}`),
    `- non-selected lane policy: ${review.management.nonSelectedLanePolicy}`,
    ...review.management.exactNextCalls.map((call) => `- fan-in call: ${call}`),
    "",
    "Level-2 candidate binding:",
    `- kind: ${review.level2CandidateBinding.kind}`,
    `- level2_candidate_binding_blockers: ${review.level2CandidateBinding.metric.value} (target=${review.level2CandidateBinding.metric.target}, ${review.level2CandidateBinding.metric.status})`,
    `- expected lanes: ${review.level2CandidateBinding.expectedLaneCount}`,
    `- bound lanes: ${review.level2CandidateBinding.boundLaneCount}`,
    `- controller-verified lanes: ${review.level2CandidateBinding.controllerVerifiedLaneCount}`,
    `- missing lanes: ${review.level2CandidateBinding.missingLaneIds.join(", ") || "none"}`,
    `- duplicate lanes: ${review.level2CandidateBinding.duplicateLaneIds.join(", ") || "none"}`,
    `- peer-assertion-only lanes: ${review.level2CandidateBinding.peerAssertionOnlyLaneIds.join(", ") || "none"}`,
    ...review.level2CandidateBinding.lanes.map(
      (lane) =>
        `- binding ${lane.laneId}: ${lane.bindingStatus}; packet=${lane.sourcePacketPath ?? "none"}; peerRunId=${lane.candidatePeerRunId ?? "none"}; blockers=${lane.blockers.join(", ") || "none"}`,
    ),
    ...review.level2CandidateBinding.boundaries.map(
      (boundary) => `- binding boundary: ${boundary}`,
    ),
    "",
    "Review candidate-wave packet:",
    `- kind: ${review.reviewPacket.kind}`,
    `- generated from: ${review.reviewPacket.generatedFrom}`,
    `- packet chain metric: ${review.reviewPacket.packetChainMetric.name}=${review.reviewPacket.packetChainMetric.value} (${review.reviewPacket.packetChainMetric.status})`,
    `- candidate-result packet refs: ${review.reviewPacket.candidateResultPacketRefs.length}`,
    `- durable evidence: ${review.reviewPacket.authorityBoundary.durableEvidence ? "yes" : "no"}`,
    `- promotion authority: ${review.reviewPacket.authorityBoundary.promotionAuthority ? "yes" : "no"}`,
    `- recommended lane: ${review.reviewPacket.recommendedLaneId ?? "none"}`,
    `- selectable lanes: ${review.reviewPacket.selectableLaneCount}`,
    `- binding metric: ${review.reviewPacket.bindingMetric.name}=${review.reviewPacket.bindingMetric.value} (${review.reviewPacket.bindingMetric.status})`,
    "- lane disposition options:",
    ...review.reviewPacket.laneDispositionOptions.map(
      (option) => `  - ${option.option}: ${option.posture}; ${option.description}`,
    ),
    `- boundary: ${review.reviewPacket.authorityBoundary.boundary}`,
    "",
    "Owner review route:",
    `- primary UI: ${review.ownerReviewRoute.primaryUi.surface}`,
    `- primary UI command: ${review.ownerReviewRoute.primaryUi.slashCommand}`,
    `- primary UI fallback: ${review.ownerReviewRoute.primaryUi.fallbackSlashCommand}`,
    `- primary UI summary: ${review.ownerReviewRoute.primaryUi.summary}`,
    `- final decision UI: ${review.ownerReviewRoute.decisionUi.surface}`,
    `- final decision UI command: ${review.ownerReviewRoute.decisionUi.slashCommand}`,
    `- final decision UI summary: ${review.ownerReviewRoute.decisionUi.summary}`,
    ...review.ownerReviewRoute.reviewFlow.map((step) => `- ${step}`),
    `- boundary: ${review.ownerReviewRoute.boundary}`,
    ...(review.recommendation.ownerDecisionForm
      ? [
          "",
          "Owner decision form:",
          `- kind: ${review.recommendation.ownerDecisionForm.kind}`,
          `- question: ${review.recommendation.ownerDecisionForm.questionId}`,
          `- recommended option: ${review.recommendation.ownerDecisionForm.recommendedOptionId ?? "none"}`,
          `- primary UI: ${review.recommendation.ownerDecisionForm.primaryUi.surface}`,
          `- primary UI command: ${review.recommendation.ownerDecisionForm.primaryUi.slashCommand}`,
          `- primary UI summary: ${review.recommendation.ownerDecisionForm.primaryUi.summary}`,
          `- primary UI preparation: ${review.recommendation.ownerDecisionForm.primaryUi.exactPreparationCalls.join("; ") || "none"}`,
          `- fallback interview call: ${review.recommendation.ownerDecisionForm.interviewCall}`,
          `- boundary: ${review.recommendation.ownerDecisionForm.boundary}`,
        ]
      : []),
    ...(review.recommendation.ownerDecisionOptions.length > 0
      ? [
          "",
          "Owner decision options:",
          ...review.recommendation.ownerDecisionOptions.flatMap((option) => [
            `- ${option.optionId}: ${option.label}`,
            `  posture: ${option.posture}`,
            `  rationale: ${option.rationale}`,
            ...option.exactNextCalls.map((call) => `  call: ${call}`),
          ]),
        ]
      : []),
    ...(review.recommendation.exactNextCalls.length > 0
      ? [
          "",
          "Exact next calls:",
          ...review.recommendation.exactNextCalls.map((call) => `- ${call}`),
        ]
      : []),
    "",
    "Boundaries:",
    ...review.boundaries.map((boundary) => `- ${boundary}`),
    "",
    `Next step: ${review.nextStep}`,
  ].join("\n");
}

export function formatAutoresearchLiveStopReport(result: AutoresearchLiveStopResult): string {
  if (!result.session) {
    return [
      "Autoresearch live supervision — stop",
      `Session key: ${result.sessionKey}`,
      `Stopped: ${result.stopped ? "yes" : "no"}`,
      `Next step: ${result.nextStep}`,
    ].join("\n");
  }

  return formatAutoresearchLiveSessionReport({
    action: "stop",
    sessionKey: result.sessionKey,
    session: result.session,
    nextStep: result.nextStep,
    extraLines: [`Stopped: ${result.stopped ? "yes" : "no"}`],
  });
}

export function formatAutoresearchLiveMissingSession(input: {
  action: "status";
  taskId: number;
  cwd: string;
}): string {
  return [
    "Autoresearch live supervision — status",
    `Task: #${input.taskId}`,
    `CWD: ${path.resolve(input.cwd)}`,
    "Session state: missing",
    "Next step: No live supervision session is active for this task/cwd pair.",
  ].join("\n");
}

export function formatAutoresearchManifestCampaignObservationReport(input: {
  action: AutoresearchManifestCampaignSupervisionAction;
  observation: AutoresearchManifestCampaignObservation;
  nextStep: string;
  extraLines?: string[];
}) {
  const { action, observation, nextStep, extraLines = [] } = input;
  const { control } = observation.controlResult;
  const lines = [
    `Autoresearch manifest campaign supervision — ${action}`,
    `CWD: ${observation.cwd}`,
    `Manifest: ${observation.manifestPath}`,
    `Observed at: ${formatAutoresearchLiveTimestamp(observation.observedAt)}`,
    `Campaign: ${control.autonomy.manifest.campaignId}`,
    `Overall state: ${control.autonomy.projection.overallState}`,
    `Public next-step action: ${control.public.nextStepAction}`,
    `Task verification: ${control.taskContext.verificationState}`,
    `Verified task: ${control.taskContext.verifiedTaskId ?? "-"}`,
    `AK milestone: ${control.akBinding?.ak.milestone ?? "-"}`,
    `AK check type: ${control.akBinding?.ak.checkType ?? "-"}`,
    `AK projection key: ${control.akBinding?.projection.projectionKey ?? "-"}`,
    `Projection path: ${observation.projectionPath}`,
    `Package next step: ${observation.controlResult.nextAction}`,
  ];

  if (extraLines.length > 0) {
    lines.push("", ...extraLines);
  }

  lines.push(`Next step: ${nextStep}`);
  return lines.join("\n");
}

export function formatAutoresearchManifestCampaignEvidenceReport(
  result: AutoresearchManifestCampaignEvidenceResult,
) {
  const extraLines = [
    `Evidence action: ${result.action}`,
    `Evidence via: ${result.evidence?.via ?? "-"}`,
    `Task repo: ${result.task?.repo ?? "-"}`,
    `Existing evidence id: ${result.existingEvidenceId ?? "-"}`,
    `Blocking error: ${result.error ?? "-"}`,
  ];

  return formatAutoresearchManifestCampaignObservationReport({
    action: "record_evidence",
    observation: result.observation,
    nextStep: result.nextStep,
    extraLines,
  });
}

export function formatAutoresearchSelfHostingObservationReport(input: {
  action: AutoresearchSelfHostingSupervisionAction;
  observation: AutoresearchSelfHostingObservation;
  nextStep: string;
  extraLines?: string[];
}) {
  const { action, observation, nextStep, extraLines = [] } = input;
  const lines = [
    `Autoresearch self-hosting supervision — ${action}`,
    `CWD: ${observation.cwd}`,
    `Observed at: ${formatAutoresearchLiveTimestamp(observation.observedAt)}`,
    `Campaign: ${observation.campaignId}`,
    `Execution model: ${observation.executionModel}`,
    `Controller ref: ${observation.controller.ref}`,
    `Candidate worktree: ${observation.candidate.worktreePath}`,
    `Candidate branch: ${observation.candidate.branchName}`,
    `Evaluator manifest hash: ${observation.evaluator.manifestHash}`,
    `Evaluator suites: ${observation.evaluator.suiteIds.join(", ") || "-"}`,
    `Promotion posture: ${observation.promotionPosture}`,
    `Promotion record: ${observation.promotionRecordPath}`,
    `Projection key: ${observation.projectionKey}`,
  ];

  if (extraLines.length > 0) {
    lines.push("", ...extraLines);
  }

  lines.push(`Next step: ${nextStep}`);
  return lines.join("\n");
}

export function formatAutoresearchSelfHostingEvidenceReport(
  result: AutoresearchSelfHostingEvidenceResult,
) {
  const extraLines = [
    `Evidence action: ${result.action}`,
    `Evidence via: ${result.evidence?.via ?? "-"}`,
    `Task repo: ${result.task?.repo ?? "-"}`,
    `Existing evidence id: ${result.existingEvidenceId ?? "-"}`,
    `Blocking error: ${result.error ?? "-"}`,
  ];

  return formatAutoresearchSelfHostingObservationReport({
    action: "record_evidence",
    observation: result.observation,
    nextStep: result.nextStep,
    extraLines,
  });
}

export function formatAutoresearchLearningKesAdapterReport(
  result: AutoresearchLearningKesAdapterResult,
): string {
  const lines = [
    `Autoresearch learning KES adapter — ${result.action}`,
    `Status: ${result.status}`,
    `Package root: ${result.packageRoot}`,
    `Source: ${result.source.packetKind}`,
    `Title: ${result.source.title}`,
    `Campaign: ${result.source.campaign ?? "-"}`,
    `Suggested source path: ${result.source.suggestedPath}`,
    `Empirical decision: ${result.source.empiricalDecisionClass ?? "-"}`,
    `Promotion ready: ${result.source.promotionReady === null ? "-" : String(result.source.promotionReady)}`,
    `Receipt path: ${result.source.receiptPath ?? "-"}`,
    `Source packet sha256 (${result.sourceEvidenceSnapshot.packetHashKind}): ${result.sourceEvidenceSnapshot.packetSha256}`,
    `Source receipt sha256: ${result.sourceEvidenceSnapshot.receiptSha256 ?? "-"}`,
    `Source evidence warnings: ${result.sourceEvidenceWarnings.join("; ") || "-"}`,
    `KES diary plan: ${result.kesPlan.diary.relativePath}`,
    `KES learning candidate: ${result.kesPlan.learningCandidate?.relativePath ?? "-"}`,
    `Written artifacts: ${result.writtenArtifacts.join(", ") || "-"}`,
    `pi-autoresearch mutated: ${result.effect.piAutoresearchMutated}`,
    `AK called: ${result.effect.akCalled}`,
    `External authority mutated: ${result.effect.externalAuthorityMutated}`,
    `Promotion state changed: ${result.effect.promotionStateChanged}`,
    `Boundary: ${result.boundary}`,
  ];

  lines.push(
    `Next step: ${
      result.action === "plan"
        ? "Review the KES plan; rerun with action=materialize only if the package-owned candidate-only KES write is intended."
        : "Review the candidate-only KES artifacts before any separate promotion step."
    }`,
  );
  return lines.join("\n");
}
