/**
 * Society Orchestrator — Cognitive-driven multi-agent orchestration
 *
 * Integrates:
 * - society.db (canonical state, tasks, evidence, ontology)
 * - prompt-vault (30+ cognitive tools)
 * - agent-kernel (Rust CLI for MVCC operations)
 *
 * This is not a manager. This is not a supervisor.
 * This is a cognitive orchestrator that thinks about HOW to think
 * before dispatching agents to act.
 *
 * Usage:
 *   /cognitive                     — List available cognitive tools
 *   /agents-team                   — Select routing scope
 *   /runtime-status                — Inspect runtime truth
 *   /runtime-boundary-telemetry    — Inspect lower-plane boundary telemetry
 *   /ontology <concept>            — Query ontology
 *   /evidence                      — Show recent evidence via ak evidence search
 *   /workflow [objective]          — Seed a workflow_execute call in the editor
 *   /workflows                     — Show workflow wrapper usage and examples
 *   /loops                         — List available loop types
 *   /loop <type> <objective>       — Execute a loop
 *
 * Naming note:
 *   The old loop label `mito` was retired because it conflicted with
 *   Prof. Binner's MITO already used in the workspace. Use `strategic`
 *   for the Mission → Intelligence → Tooling → Operations loop.
 *
 * Tools:
 *   cognitive_dispatch             — Cognitive-first agent dispatch
 *   society_query                  — Bounded read-only diagnostic SQL against society.db
 *   evidence_record                — Record evidence
 *   orchestrator_boundary_telemetry — Inspect lower-plane boundary telemetry
 *   ontology_context               — Get relevant ontology
 *   autoresearch_live_supervision  — Observe/start/status/stop live pi-autoresearch sessions and start bounded campaigns before attaching supervision
 *   autoresearch_manifest_campaign_supervision — Observe one exact manifest-driven campaign and optionally record bounded AK evidence
 *   autoresearch_self_hosting_supervision — Observe one self-hosting campaign artifact set and optionally record bounded AK evidence
 *   autoresearch_learning_kes_adapter — Plan/materialize package-owned KES candidates from autoresearch.learning.v1 packets
 *   ts_quality_release_workflow    — Coordinate ts-quality local release prep through GitHub Release trusted publishing
 *   loop_execute                   — Execute structured loops
 *   workflow_execute               — Execute chain/parallel workflow compositions
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { registerLoopCommands, registerLoopTools } from "../src/loops/engine.ts";
import { AGENT_PROFILES } from "../src/runtime/agent-profiles.ts";
import { autoSelectAgent, resolveAgentForTeam } from "../src/runtime/agent-routing.ts";
import { resolveAkPath } from "../src/runtime/ak.ts";
import {
  type AutoresearchLearningKesAdapterAction,
  type AutoresearchLearningKesAdapterResult,
  buildAutoresearchLearningKesAdapterResult,
  loadAutoresearchLearningPacketWithSource,
} from "../src/runtime/autoresearch-learning-kes-adapter.ts";
import {
  type AutoresearchManifestCampaignEvidenceResult,
  type AutoresearchManifestCampaignObservation,
  AutoresearchManifestCampaignSupervisor,
  type AutoresearchManifestCampaignTaskAnchor,
} from "../src/runtime/autoresearch-manifest-campaign-supervision.ts";
import {
  type AutoresearchSelfHostingEvidenceResult,
  type AutoresearchSelfHostingObservation,
  type AutoresearchSelfHostingSupervisionAction,
  AutoresearchSelfHostingSupervisor,
  type AutoresearchSelfHostingTaskAnchor,
} from "../src/runtime/autoresearch-self-hosting-supervision.ts";
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
  AutoresearchLiveSupervisionRunner,
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
  runAutoresearchLevel4CampaignRunner,
} from "../src/runtime/autoresearch-supervisor-runner.ts";
import {
  getBoundaryTelemetryStats,
  getLatestBoundaryTelemetryFailure,
  isBoundaryFailure,
  listBoundaryTelemetry,
  summarizeBoundaryTelemetry,
} from "../src/runtime/boundaries.ts";
import { getCognitiveToolByName } from "../src/runtime/cognitive-tools.ts";
import {
  type EvidenceEntry,
  finalizeExecutionEffects,
  recordEvidence,
} from "../src/runtime/evidence.ts";
import { getExecutionIcon } from "../src/runtime/execution-status.ts";
import { formatOntologyConcepts, lookupOntologyConcepts } from "../src/runtime/ontology.ts";
import { previewRecentEvidence, runSocietyDiagnosticQuery } from "../src/runtime/society.ts";
import { createOrchestratorSubagentExecutor, toExecutionLike } from "../src/runtime/subagent.ts";
import { getGlobalSessionTeamStore } from "../src/runtime/team-state.ts";
import {
  formatTsQualityReleaseWorkflowResult,
  TsQualityReleaseWorkflowRunner,
} from "../src/runtime/ts-quality-release-workflow.ts";
import { WORKFLOW_AGENT_NAMES } from "../src/runtime/workflow.ts";
import {
  createWorkflowExecutor,
  WorkflowExecutionError,
} from "../src/runtime/workflow-execution.ts";
import runtimeFooterExtension from "./runtime-footer.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SOCIETY_DB =
  process.env.SOCIETY_DB ||
  process.env.AK_DB ||
  path.join(os.homedir(), "ai-society", "society.db");
const DEFAULT_VAULT_DIR = path.join(
  os.homedir(),
  "ai-society",
  "core",
  "prompt-vault",
  "prompt-vault-db",
);
const AGENT_KERNEL = resolveAkPath({ cwd: process.cwd() });
const ORCHESTRATOR_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveVaultDir() {
  return process.env.VAULT_DIR || DEFAULT_VAULT_DIR;
}

// ============================================================================
// RUNTIME ADAPTERS
// ============================================================================

function writeEvidence(entry: EvidenceEntry, signal?: AbortSignal, cwd?: string) {
  return recordEvidence(entry, signal, {
    akPath: AGENT_KERNEL,
    societyDb: SOCIETY_DB,
    cwd,
  });
}

export interface SocietyOrchestratorExtensionOptions {
  autoresearchLiveRunner?: AutoresearchLiveSupervisionRunner;
  manifestCampaignSupervisor?: AutoresearchManifestCampaignSupervisor;
  selfHostingSupervisor?: AutoresearchSelfHostingSupervisor;
  tsQualityReleaseWorkflowRunner?: TsQualityReleaseWorkflowRunner;
  autoresearchLearningKesPackageRoot?: string;
}

type AutoresearchLiveSupervisionAction =
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

type AutoresearchManifestCampaignSupervisionAction = "observe" | "record_evidence";

type AutoresearchLiveSupervisionToolDetails = {
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

type AutoresearchManifestCampaignSupervisionToolDetails = {
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

type AutoresearchSelfHostingSupervisionToolDetails = {
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

type AutoresearchLearningKesAdapterToolDetails = {
  ok: boolean;
  action: AutoresearchLearningKesAdapterAction;
  result?: AutoresearchLearningKesAdapterResult;
  nextStep?: string;
  error?: string;
};

function formatAutoresearchLiveTimestamp(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "-";
  }

  return new Date(value).toISOString();
}

function formatAutoresearchLiveSessionReport(input: {
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

function formatAutoresearchLiveSessionList(
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

function formatAutoresearchLivePollExtras(
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

function formatAutoresearchLiveStartReport(result: AutoresearchLiveStartResult): string {
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

function formatAutoresearchCampaignStartUnderSupervisionReport(
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

function formatAutoresearchCandidateWavePlanReport(plan: AutoresearchCandidateWavePlan): string {
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

function formatAutoresearchLevel3ManifestPreflightReport(
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

function formatAutoresearchLevel3SliceSequenceDryRunReport(
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

function formatAutoresearchLevel3VisibleCandidateLifecyclePlanReport(
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

function formatAutoresearchLevel3MeasureExportReviewPlanReport(
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

function formatAutoresearchLevel3MatrixCellRunnerReport(
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

function formatAutoresearchLevel3MatrixCellExecutorReport(
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

function formatAutoresearchLevel4CampaignRunnerReport(
  runner: AutoresearchLevel4CampaignRunner,
): string {
  const cleanup = runner.promptRunnerBundle.candidateCloseoutPacket.postIntegrationCleanupReady;
  const promotionHandoff =
    runner.promptRunnerBundle.candidateCloseoutPacket.postFaninPromotionHandoff;
  const cleanupDryRunPrepared = Boolean(cleanup.candidatePeerCleanupDryRunCall);
  const cleanupExecutePrepared = Boolean(cleanup.candidatePeerCleanupExecuteCall);
  const cleanupBlocked =
    cleanup.blockers.length > 0 ||
    cleanup.registrySidecars.some((sidecar) => sidecar.status !== "verified_registry_sidecar");
  const cleanupOperatorPosture = cleanupBlocked
    ? "BLOCKED — resolve registry sidecar/closeout blockers before any cleanup call"
    : cleanupExecutePrepared
      ? "EXECUTE READY — destructive cleanup still requires an explicit candidate_peer_cleanup execute call"
      : cleanupDryRunPrepared
        ? "DRY-RUN READY — inspect the generated candidate_peer_cleanup dry-run call before closeout"
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
    `- dry-run call: ${cleanupDryRunPrepared ? "prepared" : "withheld"}`,
    `- execute call: ${cleanupExecutePrepared ? "prepared (explicit destructive call required)" : "withheld"}`,
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

function formatAutoresearchLevel3AuthorizedFinalizerCleanupPlanReport(
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
    "Cleanup packet:",
    plan.cleanupCommandPacket
      ? `- ${plan.cleanupCommandPacket.kind}; commands=${plan.cleanupCommandPacket.exactCommands.length}; execution=${plan.cleanupCommandPacket.cleanupExecution}; trigger=${plan.cleanupCommandPacket.cleanupTrigger}`
      : "- blocked/withheld",
    ...(plan.cleanupCommandPacket
      ? [
          `  peer tabs/sessions: ${plan.cleanupCommandPacket.exactPeerTabsOrSessions.join(", ") || "none"}`,
          `  worktrees: ${plan.cleanupCommandPacket.exactWorktrees.join(", ") || "none"}`,
          `  branches: ${plan.cleanupCommandPacket.exactBranches.join(", ") || "none"}`,
          ...plan.cleanupCommandPacket.exactCommands.map((command) => `  - ${command}`),
          `  forbidden promotion command matches: ${plan.cleanupCommandPacket.forbiddenPromotionCommandMatches.join(", ") || "none"}`,
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

function formatAutoresearchMatrixCampaignOperatorFollowupReport(
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

function formatAutoresearchMatrixCampaignCockpitReport(
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

function formatAutoresearchMatrixCampaignPlanReport(plan: AutoresearchMatrixCampaignPlan): string {
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

function formatAutoresearchMatrixCampaignRunnerContractReport(
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

function formatAutoresearchMatrixCampaignControllerCommandPacketReport(
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

function formatAutoresearchMatrixCampaignRunnerCheckpointReport(
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

function formatAutoresearchMatrixCampaignReviewReport(
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

function formatAutoresearchPostFaninFinalizerReport(
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

function formatAutoresearchCandidateWaveReviewReport(
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

function formatAutoresearchLiveStopReport(result: AutoresearchLiveStopResult): string {
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

function formatAutoresearchLiveMissingSession(input: {
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

function validateAutoresearchLiveIdentity(input: {
  action: AutoresearchLiveSupervisionAction;
  taskId?: number;
  cwd?: string;
}) {
  const hasTaskId = input.taskId !== undefined;
  const hasCwd = input.cwd !== undefined;

  if (input.action === "status" && !hasTaskId && !hasCwd) {
    return;
  }

  if (hasTaskId !== hasCwd) {
    throw new Error(
      `${input.action} requires taskId and cwd together, or neither for action=status.`,
    );
  }

  if (!hasTaskId || !hasCwd) {
    throw new Error(`${input.action} requires an exact taskId and cwd.`);
  }
}

function createAutoresearchLiveToolResult(
  text: string,
  details: AutoresearchLiveSupervisionToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function formatAutoresearchManifestCampaignObservationReport(input: {
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

function formatAutoresearchManifestCampaignEvidenceReport(
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

function createAutoresearchManifestCampaignToolResult(
  text: string,
  details: AutoresearchManifestCampaignSupervisionToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function formatAutoresearchSelfHostingObservationReport(input: {
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

function formatAutoresearchSelfHostingEvidenceReport(
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

function createAutoresearchSelfHostingToolResult(
  text: string,
  details: AutoresearchSelfHostingSupervisionToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function formatAutoresearchLearningKesAdapterReport(
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

function createAutoresearchLearningKesAdapterToolResult(
  text: string,
  details: AutoresearchLearningKesAdapterToolDetails,
) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function buildWorkflowExecuteInvocation(objective?: string): string {
  const trimmedObjective = objective?.trim();
  const request = trimmedObjective
    ? {
        mode: "chain",
        steps: [
          {
            kind: "step",
            agent: "scout",
            objective: trimmedObjective,
          },
          {
            kind: "step",
            agent: "reviewer",
            objective: `Review the findings from: ${trimmedObjective}`,
          },
        ],
      }
    : {
        mode: "chain",
        steps: [
          {
            kind: "step",
            agent: "scout",
            objective: "Inspect the current repo and identify the relevant workflow entry points.",
          },
          {
            kind: "step",
            agent: "reviewer",
            objective:
              "Review the discovered workflow surface and summarize the main runtime risks.",
          },
        ],
      };

  return `workflow_execute(${JSON.stringify({ request }, null, 2)})`;
}

function formatWorkflowWrapperGuide(): string {
  return [
    "# Workflow wrappers",
    "",
    "Thin command adapters over `workflow_execute`:",
    "- `/workflow [objective]` seeds a starter `workflow_execute(...)` call in the editor",
    "- `/workflows` shows this short guide",
    "",
    "## Recommended first use",
    "",
    "```js",
    buildWorkflowExecuteInvocation(),
    "```",
    "",
    "## Selection guide",
    "- `dispatch_subagent` — one focused specialist worker via ASC",
    "- `cognitive_dispatch` — one task where cognition/tool choice is the main uncertainty",
    "- `loop_execute` — predefined orchestrator-owned cognitive framework",
    "- `workflow_execute` — explicit caller-authored chain/parallel/worktree graph",
    "- DSPy / DSPx — program/runtime optimization, replay, compile/eval, and empirical evolution",
    "",
    "## Interpretation",
    "- workflows here are caller-authored / operator-authored requests",
    "- the request names the graph explicitly; the agent executes it but does not silently redefine the topology",
    "- loops are different: they are predefined orchestrator-owned cognitive frameworks",
    "- subagents are the execution units underneath these higher-level orchestration surfaces",
    "- DSPy/DSPx concerns are different again: inner cognition/program runtimes and the engineering/optimization/replay layer around them",
    "",
    "## Notes",
    "- prefer chain for dependent work",
    "- use parallel only for independent tasks",
    "- reserve worktree mode for eligible mutation cases",
    "- wrappers are adapters only; `workflow_execute` remains the core surface",
  ].join("\n");
}

// ============================================================================
// EXTENSION
// ============================================================================

export default function (pi: ExtensionAPI, options: SocietyOrchestratorExtensionOptions = {}) {
  runtimeFooterExtension(pi);

  const sessionTeams = getGlobalSessionTeamStore();
  const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", "society-orchestrator");

  // Ensure sessions directory exists
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  const subagentExecutor = createOrchestratorSubagentExecutor({ sessionsDir });
  const autoresearchLiveRunner =
    options.autoresearchLiveRunner ||
    new AutoresearchLiveSupervisionRunner({
      akPath: AGENT_KERNEL,
      societyDb: SOCIETY_DB,
    });
  const manifestCampaignSupervisor =
    options.manifestCampaignSupervisor ||
    new AutoresearchManifestCampaignSupervisor({
      akPath: AGENT_KERNEL,
      societyDb: SOCIETY_DB,
    });
  const selfHostingSupervisor =
    options.selfHostingSupervisor ||
    new AutoresearchSelfHostingSupervisor({
      akPath: AGENT_KERNEL,
      societyDb: SOCIETY_DB,
    });
  const tsQualityReleaseWorkflowRunner =
    options.tsQualityReleaseWorkflowRunner || new TsQualityReleaseWorkflowRunner();
  const autoresearchLearningKesPackageRoot = path.resolve(
    options.autoresearchLearningKesPackageRoot || ORCHESTRATOR_PACKAGE_ROOT,
  );

  // ===========================================================================
  // TOOL: society_query
  // ===========================================================================

  registerCompatTool(pi, {
    name: "society_query",
    label: "Society Query",
    description: "Execute a bounded read-only diagnostic SQL query against society.db.",
    promptSnippet: "Run a bounded read-only diagnostic SQL query against society.db.",
    promptGuidelines: [
      "Use society_query for diagnostic reads against society.db instead of inventing schema details.",
      "Keep queries read-only and reasonably scoped so results stay inspectable.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Read-only SQL query to execute" }),
    }),
    async execute(_toolCallId, params, signal) {
      const { query } = params as { query: string };

      const results = await runSocietyDiagnosticQuery<Record<string, unknown>>(
        query,
        {
          akPath: AGENT_KERNEL,
          societyDb: SOCIETY_DB,
        },
        signal,
      );
      if (isBoundaryFailure(results)) {
        return {
          content: [{ type: "text", text: `society_query failed: ${results.error}` }],
          details: {
            ok: false,
            rowCount: 0,
            error: results.error,
            boundedDiagnosticException: true,
          },
        };
      }

      if (results.value.length === 0) {
        return {
          content: [{ type: "text", text: "No results found." }],
          details: {
            ok: true,
            rowCount: 0,
            error: "",
            boundedDiagnosticException: true,
          },
        };
      }

      const output = JSON.stringify(results.value, null, 2);
      const truncated = output.length > 8000 ? `${output.slice(0, 8000)}\n... [truncated]` : output;

      return {
        content: [{ type: "text", text: truncated }],
        details: {
          ok: true,
          rowCount: results.value.length,
          error: "",
          boundedDiagnosticException: true,
        },
      };
    },
    renderCall(args, theme) {
      const query = (args as { query?: string }).query || "";
      const preview = query.length > 50 ? `${query.slice(0, 47)}...` : query;
      return new Text(
        theme.fg("toolTitle", theme.bold("society_query ")) + theme.fg("muted", preview),
        0,
        0,
      );
    },
    renderResult(result, _options, _theme) {
      const text = result.content[0];
      return new Text(text?.type === "text" ? text.text.slice(0, 500) : "", 0, 0);
    },
  });

  // ===========================================================================
  // TOOL: orchestrator_boundary_telemetry
  // ===========================================================================

  registerCompatTool(pi, {
    name: "orchestrator_boundary_telemetry",
    label: "Orchestrator Boundary Telemetry",
    description: `Inspect session-local lower-plane execution telemetry for the orchestrator.

Use when investigating sqlite3, ak, rocs, or other boundary command behavior.
Reports call counts, latency summary, command mix, and recent boundary events captured by the orchestrator runtime.`,
    promptSnippet: "Inspect session-local lower-plane execution telemetry for the orchestrator.",
    promptGuidelines: [
      "Use orchestrator_boundary_telemetry when investigating lower-plane command behavior such as sqlite3, ak, or rocs.",
    ],
    parameters: Type.Object({
      limit: Type.Optional(
        Type.Number({ description: "Max recent events to include (default: 15)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const requestedLimit = Math.floor(Number((params as { limit?: number }).limit));
      const recentEvents = listBoundaryTelemetry(
        Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 15,
      );
      const stats = getBoundaryTelemetryStats();
      const latestFailure = getLatestBoundaryTelemetryFailure();
      return {
        content: [{ type: "text", text: summarizeBoundaryTelemetry() }],
        details: {
          ...stats,
          latestFailure,
          recentEvents,
        },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("orchestrator_boundary_telemetry")), 0, 0);
    },
    renderResult(result, _options, _theme) {
      const details = (result.details || {}) as { totalCalls?: number; failureCount?: number };
      return new Text(
        `${details.totalCalls ?? 0} calls, ${details.failureCount ?? 0} failures`,
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: cognitive_dispatch
  // ===========================================================================

  registerCompatTool(pi, {
    name: "cognitive_dispatch",
    label: "Cognitive Dispatch",
    description: `Dispatch an agent with cognitive tool injection. The system:
1. Analyzes the context using meta-orchestration
2. Selects the appropriate cognitive tool from the vault
3. Injects that tool as the agent's system prompt
4. Records the decision in the evidence ledger

This is cognitive-first dispatch — think about HOW to think before acting.`,
    promptSnippet:
      "Dispatch an agent with an injected cognitive tool chosen for the current problem.",
    promptGuidelines: [
      "Use cognitive_dispatch when the main risk is choosing the wrong thinking pattern, not just the wrong action.",
      "Provide enough situation context for tool and agent selection to be meaningful.",
    ],
    parameters: Type.Object({
      context: Type.String({ description: "The situation or problem context" }),
      agent: Type.Optional(Type.String({ description: "Agent to use (default: auto-select)" })),
      cognitive_tool: Type.Optional(
        Type.String({ description: "Cognitive tool to inject (default: auto-select)" }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { context, agent, cognitive_tool } = params as {
        context: string;
        agent?: string;
        cognitive_tool?: string;
      };

      // Auto-select cognitive tool if not specified
      let toolToUse = cognitive_tool;
      if (!toolToUse) {
        // Simple heuristic based on context keywords
        const ctxLower = context.toLowerCase();
        if (ctxLower.includes("bug") || ctxLower.includes("error") || ctxLower.includes("fail")) {
          toolToUse = "inversion";
        } else if (ctxLower.includes("review") || ctxLower.includes("check")) {
          toolToUse = "audit";
        } else if (ctxLower.includes("stuck") || ctxLower.includes("decide")) {
          toolToUse = "nexus";
        } else if (ctxLower.includes("explore") || ctxLower.includes("understand")) {
          toolToUse = "telescopic";
        } else {
          toolToUse = "first-principles";
        }
      }

      // Get the cognitive tool
      const toolResult = await getCognitiveToolByName(toolToUse, { cwd: ctx.cwd }, signal);
      if (isBoundaryFailure(toolResult)) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to load cognitive tool '${toolToUse}': ${toolResult.error}`,
            },
          ],
          details: { ok: false, error: toolResult.error },
        };
      }

      const tool = toolResult.value;
      if (!tool) {
        return {
          content: [{ type: "text", text: `Cognitive tool not found: ${toolToUse}` }],
          details: { ok: false, error: "tool-not-found" },
        };
      }

      // Validate the selected/requested agent against the active team.
      const requestedAgent = agent || autoSelectAgent(context);
      const activeTeam = sessionTeams.getTeam(ctx);
      const resolution = resolveAgentForTeam(requestedAgent, activeTeam);
      if (!resolution.ok) {
        return {
          content: [{ type: "text", text: resolution.error }],
          details: {
            ok: false,
            error: resolution.error,
            requestedAgent,
            activeTeam: resolution.team,
            allowedAgents: resolution.allowedAgents,
          },
        };
      }
      const agentToUse = resolution.agent;

      const agentDef = AGENT_PROFILES[agentToUse];
      if (!agentDef) {
        return {
          content: [
            {
              type: "text",
              text: `Agent not found: ${agentToUse}. Available: ${Object.keys(AGENT_PROFILES).join(", ")}`,
            },
          ],
          details: { ok: false },
        };
      }

      const model = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : `openrouter/google/gemini-2.5-flash-preview`;
      const runtimeResult = await subagentExecutor.execute({
        agentProfile: agentDef,
        cognitiveToolName: toolToUse,
        cognitiveToolContent: tool.content,
        objective: context,
        model,
        cwd: ctx.cwd,
        contextHeading: "OBJECTIVE",
        contextBody: context,
        sessionName: `${agentToUse}-${toolToUse}`,
        signal,
      });
      const result = toExecutionLike(runtimeResult);

      const executionOutcome = await finalizeExecutionEffects({
        result,
        signal,
        createEvidenceEntry: ({ status, success }) => ({
          check_type: "cognitive:dispatch",
          result: success ? "pass" : "fail",
          details: {
            tool: toolToUse,
            agent: agentToUse,
            context: context.slice(0, 100),
            exitCode: result.exitCode,
            status,
            elapsed: result.elapsed,
          },
        }),
        recordEvidence: (entry, activeSignal) => writeEvidence(entry, activeSignal, ctx.cwd),
      });
      const status = executionOutcome.status;
      const icon = getExecutionIcon(result);
      const evidenceOutcome = executionOutcome.evidence;
      const summary = `${icon} [${agentToUse} + ${toolToUse}] ${status} in ${Math.round(result.elapsed / 1000)}s`;
      const evidenceAkError = "akError" in evidenceOutcome ? evidenceOutcome.akError : undefined;
      const evidenceDiagnostics = [
        evidenceAkError ? `ak error: ${evidenceAkError.slice(0, 120)}` : undefined,
      ].filter(Boolean);
      const evidenceNote = evidenceOutcome.ok
        ? ""
        : `\nEvidence path: ${evidenceOutcome.via}${evidenceDiagnostics.length > 0 ? ` (${evidenceDiagnostics.join("; ")})` : ""}`;

      const truncated =
        result.output.length > 6000
          ? `${result.output.slice(0, 6000)}\n\n... [truncated]`
          : result.output;

      return {
        content: [{ type: "text", text: `${summary}${evidenceNote}\n\n${truncated}` }],
        details: {
          agent: agentToUse,
          cognitiveTool: toolToUse,
          status,
          failureKind: result.failureKind,
          elapsed: result.elapsed,
          fullOutput: result.output,
          evidenceOk: evidenceOutcome.ok,
          evidenceVia: evidenceOutcome.via,
          evidenceAkError: evidenceAkError,
        },
      };
    },
    renderCall(args, theme) {
      const a = args as { context?: string; agent?: string; cognitive_tool?: string };
      const ctx = a.context || "";
      const preview = ctx.length > 40 ? `${ctx.slice(0, 37)}...` : ctx;
      return new Text(
        theme.fg("toolTitle", theme.bold("cognitive_dispatch ")) +
          theme.fg("accent", a.agent || "auto") +
          theme.fg("dim", " + ") +
          theme.fg("accent", a.cognitive_tool || "auto") +
          theme.fg("dim", " — ") +
          theme.fg("muted", preview),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as
        | { agent?: string; cognitiveTool?: string; status?: string; elapsed?: number }
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const icon = details.status === "done" ? "✓" : "✗";
      const color = details.status === "done" ? "success" : "error";
      const elapsed = Math.round((details.elapsed || 0) / 1000);
      return new Text(
        theme.fg(color, `${icon} ${details.agent} + ${details.cognitiveTool}`) +
          theme.fg("dim", ` ${elapsed}s`),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: evidence_record
  // ===========================================================================

  registerCompatTool(pi, {
    name: "evidence_record",
    label: "Record Evidence",
    description: "Record evidence in the society.db evidence ledger.",
    promptSnippet: "Record a pass/fail/skip evidence entry in the society evidence ledger.",
    promptGuidelines: [
      "Use evidence_record after a meaningful check or execution outcome you want preserved in the ledger.",
    ],
    parameters: Type.Object({
      check_type: Type.String({
        description: "Type of check (e.g., 'validation:test', 'cognitive:inversion')",
      }),
      result: Type.Union([Type.Literal("pass"), Type.Literal("fail"), Type.Literal("skip")]),
      task_id: Type.Optional(Type.Number({ description: "Associated task ID" })),
      details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const outcome = await writeEvidence(
        params as EvidenceEntry & { task_id?: number },
        signal,
        ctx?.cwd || process.cwd(),
      );
      const { check_type, result } = params as EvidenceEntry & {
        task_id?: number;
      };

      const failureDiagnostics = [
        outcome.akError ? `ak error: ${outcome.akError.slice(0, 200)}` : undefined,
      ].filter(Boolean);

      return {
        content: [
          {
            type: "text",
            text: outcome.ok
              ? `Evidence recorded via ${outcome.via}: ${check_type} = ${result}`
              : `Failed to record evidence via the canonical ak path. ${failureDiagnostics.join("; ") || "unknown failure"}`,
          },
        ],
        details: {
          ok: outcome.ok,
          via: outcome.via,
          akError: outcome.akError,
        },
      };
    },
  });

  // ===========================================================================
  // TOOL: ontology_context
  // ===========================================================================

  registerCompatTool(pi, {
    name: "ontology_context",
    label: "Ontology Context",
    description: "Get relevant ontology concepts for a company or concern.",
    promptSnippet: "Retrieve ontology concepts relevant to a company, concern, or search term.",
    promptGuidelines: [
      "Use ontology_context when you need governed vocabulary or concept grounding before making society-level decisions.",
    ],
    parameters: Type.Object({
      concept: Type.Optional(Type.String({ description: "Specific concept to look up" })),
      search: Type.Optional(Type.String({ description: "Search query" })),
    }),
    async execute(_toolCallId, params, signal) {
      const { concept, search } = params as { concept?: string; search?: string };
      const results = await lookupOntologyConcepts({ concept, search }, { signal });
      if (isBoundaryFailure(results)) {
        return {
          content: [{ type: "text", text: `ontology_context failed: ${results.error}` }],
          details: { ok: false, count: 0, error: results.error },
        };
      }

      if (results.value.length === 0) {
        return {
          content: [{ type: "text", text: "No ontology concepts found." }],
          details: { ok: true, count: 0, error: "" },
        };
      }

      return {
        content: [{ type: "text", text: formatOntologyConcepts(results.value) }],
        details: { ok: true, count: results.value.length, error: "" },
      };
    },
  });

  // ===========================================================================
  // TOOL: ts_quality_release_workflow
  // ===========================================================================

  registerCompatTool(pi, {
    name: "ts_quality_release_workflow",
    label: "ts-quality Release Workflow",
    description:
      "Coordinate the ts-quality local release-prep workflow that culminates in GitHub Release-triggered npm Trusted Publishing/OIDC.",
    promptSnippet:
      "Coordinate ts-quality release planning, preparation, tagging, GitHub Release creation, and public verification without local npm publish.",
    promptGuidelines: [
      "Use ts_quality_release_workflow when releasing ts-quality through the Pi Society orchestrator boundary.",
      "Use action=plan first; use apply=true only for local file/git mutations the operator requested.",
      "Use externalMutationApproved=true for push or create_github_release only when the operator explicitly approves public external mutations.",
      "Do not run local npm publish; GitHub Release publication triggers npm Trusted Publishing/OIDC.",
    ],
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([
          Type.Literal("plan"),
          Type.Literal("prepare"),
          Type.Literal("commit_tag"),
          Type.Literal("push"),
          Type.Literal("create_github_release"),
          Type.Literal("verify_public"),
        ]),
      ),
      cwd: Type.Optional(
        Type.String({
          description: "ts-quality repo root. Defaults to the canonical owned repo path.",
        }),
      ),
      version: Type.String({
        description: "Release version without leading v, for example 0.1.1.",
      }),
      apply: Type.Optional(
        Type.Boolean({
          description: "Apply local mutations for prepare/commit_tag/push/create_github_release.",
        }),
      ),
      externalMutationApproved: Type.Optional(
        Type.Boolean({
          description:
            "Required for public external mutations such as git push or GitHub Release creation.",
        }),
      ),
      timeoutMs: Type.Optional(
        Type.Number({ description: "Optional per-command timeout in milliseconds." }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const result = await tsQualityReleaseWorkflowRunner.run(
        params as {
          action?:
            | "plan"
            | "prepare"
            | "commit_tag"
            | "push"
            | "create_github_release"
            | "verify_public";
          cwd?: string;
          version: string;
          apply?: boolean;
          externalMutationApproved?: boolean;
          timeoutMs?: number;
        },
        signal,
      );
      return {
        content: [{ type: "text", text: formatTsQualityReleaseWorkflowResult(result) }],
        details: result,
      };
    },
    renderCall(args, theme) {
      const typed = args as { action?: string; version?: string; apply?: boolean };
      return new Text(
        theme.fg("toolTitle", theme.bold("ts_quality_release_workflow ")) +
          theme.fg(
            "muted",
            `${typed.action || "plan"} ${typed.version || ""}${typed.apply ? " apply" : ""}`,
          ),
        0,
        0,
      );
    },
    renderResult(result, _options, _theme) {
      const details = (result.details || {}) as {
        ok?: boolean;
        action?: string;
        nextStep?: string;
      };
      return new Text(
        `${details.ok ? "ok" : "failed"} ${details.action || "release"}: ${details.nextStep || "inspect result"}`.slice(
          0,
          500,
        ),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: autoresearch_live_supervision
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_live_supervision",
    label: "Autoresearch Live Supervision",
    description:
      "Inspect, start, one-shot observe, stop, or start one bounded pi-autoresearch campaign and then attach live supervision above the package runtime.",
    promptSnippet:
      "Observe/start/status/stop a live pi-autoresearch supervision session, or start one bounded pi-autoresearch campaign and then attach supervision, while keeping peer-assisted lanes communication-only.",
    promptGuidelines: [
      "Use autoresearch_live_supervision for exact taskId + cwd supervision above the pi-autoresearch runtime.",
      "Use action=start_campaign only with an exact taskId, cwd, and objective; campaign execution is delegated to pi-autoresearch runtime semantics before live supervision starts.",
      "Use action=plan_candidate_wave when the operator wants multiple visible candidate experiments in parallel; this returns explicit candidate_peer_spawn and pi-autoresearch measurement/review calls, but does not launch or promote anything by itself.",
      "Use action=level3_manifest_preflight to validate a level-3 manifest read-only before any action-consuming surface.",
      "Use action=level3_slice_sequence_dry_run to walk manifest slices/cells and emit non-authoritative dry-run receipts without exposing or executing lower-plane action calls.",
      "Use action=level3_visible_candidate_lifecycle_plan to expose authorized visible candidate launch calls, bind candidate worktree lineage, and prepare cleanup posture without executing launch or cleanup.",
      "Use action=level3_measure_export_review_plan to emit manifest-approved pi-autoresearch measurement/export/review call packets without executing them or treating packets as durable evidence.",
      "Use action=level3_matrix_cell_runner to compute the unified Level-3 cell state machine over manifest preflight, sequencing, visible launch, candidate bindings, measure/export packets, per-cell review, and finalizer-plan readiness without executing hidden actions.",
      "Use action=level3_authorized_finalizer_cleanup_plan to consume exact finalize_post_fanin and candidate cleanup gates for post-fan-in command packets; cleanup becomes an automatic controller closeout step when integrationCloseout.status=successful and exact resources are supplied, while promotion and AK writes remain separate.",
      "Use action=level3_matrix_cell_executor above checkpoint_matrix_campaign_runner output when the controller wants deterministic one-step advancement through runner nextLegalActions without hidden execution; pass completedActionCount after each explicitly verified action.",
      "Use action=plan_matrix_campaign when the operator wants implementation-wave work dogfooded as a scenario × hypothesis matrix; this returns cell-scoped plan_candidate_wave/review_candidate_wave calls and keeps AK as the task spine.",
      "Use action=prepare_matrix_campaign_runner for the safer manifest/checkpoint runner contract: it exposes visible candidate_peer_spawn launch calls only, withholds benchmark/export/review calls, and emits an exact controller checkpoint token.",
      "Use action=checkpoint_matrix_campaign_runner only after visible candidate peers have reported back and the controller has verified lineage; without the exact checkpointConfirmation token, benchmark/export/review calls remain withheld, and with it the tool returns an explicit controller-command packet: bind -> metric runtime_run -> candidate_result_export -> review_candidate_wave -> review_matrix_campaign.",
      "Use action=review_matrix_campaign after matrix cells have exported candidate-result packets; this aggregates managed cell-wave reviews without launching, measuring, writing evidence, or selecting promotion authority.",
      "Use action=review_candidate_wave after multiple pi-autoresearch candidate measurements have produced result summaries; this compares lanes for owner selection, but still does not choose winners as promotion authority.",
      "For DSPx/DSPy planning, set planner=dspx_program and runDspxProgramGen=true; this asks pi-autoresearch to materialize and run a bounded DSPx-generated DSPy planner assembly, then validate the generated DSPy output from behavior_results.json as the campaign plan. Orchestrator still does not synthesize or apply a DSPy program itself.",
      "Do not invent fuzzy task lookup or hidden daemons; provide exact taskId and cwd for observe/start/stop/start_campaign.",
      "Do not auto-spawn scout_peer_spawn, candidate_peer_spawn, or fork_peer_spawn from this surface; pi-autoresearch may recommend exact peer calls and the operator/controller chooses whether to launch them.",
      "Do not change direction from this surface; emit direction proposals/gated next steps and route actual direction changes through AK/decision authority.",
      "AK evidence/task-lifecycle projection may occur only from verified package runtime/ledger proof through the live supervisor/projector, not from raw peer messages or unverified campaign claims.",
      "Treat PEER_ACK/PEER_FINAL or legacy QUEST_ACK/QUEST_FINAL intercom messages as communication only.",
    ],
    parameters: Type.Object({
      action: Type.Optional(
        Type.Union([
          Type.Literal("status"),
          Type.Literal("observe"),
          Type.Literal("start"),
          Type.Literal("start_campaign"),
          Type.Literal("plan_candidate_wave"),
          Type.Literal("level3_manifest_preflight"),
          Type.Literal("level3_slice_sequence_dry_run"),
          Type.Literal("level3_visible_candidate_lifecycle_plan"),
          Type.Literal("level3_measure_export_review_plan"),
          Type.Literal("level3_matrix_cell_runner"),
          Type.Literal("level3_authorized_finalizer_cleanup_plan"),
          Type.Literal("level3_matrix_cell_executor"),
          Type.Literal("level4_autoresearch_campaign_runner"),
          Type.Literal("plan_matrix_campaign"),
          Type.Literal("prepare_matrix_campaign_runner"),
          Type.Literal("checkpoint_matrix_campaign_runner"),
          Type.Literal("review_matrix_campaign"),
          Type.Literal("review_candidate_wave"),
          Type.Literal("finalize_post_fanin"),
          Type.Literal("stop"),
        ]),
      ),
      taskId: Type.Optional(Type.Number({ description: "Exact AK task id for the campaign" })),
      cwd: Type.Optional(Type.String({ description: "Exact campaign cwd" })),
      objective: Type.Optional(
        Type.String({
          description:
            "Bounded optimization objective for action=start_campaign, action=plan_candidate_wave, matrix campaign actions, action=review_candidate_wave, action=finalize_post_fanin, or action=level3_authorized_finalizer_cleanup_plan.",
        }),
      ),
      candidateCount: Type.Optional(
        Type.Number({
          description: "Number of candidate lanes for action=plan_candidate_wave (1-6, default 3).",
          minimum: 1,
          maximum: 6,
        }),
      ),
      candidateObjectives: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional explicit per-lane candidate objectives for action=plan_candidate_wave.",
        }),
      ),
      candidatePacketDirectory: Type.Optional(
        Type.String({
          description:
            "Optional repo-relative .autoresearch/ packet directory for action=plan_candidate_wave.",
        }),
      ),
      scenarios: Type.Optional(
        Type.Array(Type.String(), {
          description: "Scenario axis values for matrix campaign actions.",
        }),
      ),
      hypotheses: Type.Optional(
        Type.Array(Type.String(), {
          description: "Hypothesis axis values for matrix campaign actions.",
        }),
      ),
      candidateCountPerCell: Type.Optional(
        Type.Number({
          description:
            "Number of candidate lanes generated inside each matrix cell for matrix campaign actions (1-6, default 3).",
          minimum: 1,
          maximum: 6,
        }),
      ),
      parentPeerTarget: Type.Optional(
        Type.String({
          description:
            "Optional exact controller peer target to include in candidate_peer_spawn calls for action=plan_candidate_wave or action=level3_visible_candidate_lifecycle_plan.",
        }),
      ),
      launchAuthorizationToken: Type.Optional(
        Type.String({
          description:
            "Exact launch_visible_candidate_lanes token for action=level3_visible_candidate_lifecycle_plan when manifest policy does not directly allow launch.",
        }),
      ),
      level3CandidateBindings: Type.Optional(
        Type.Array(
          Type.Object({
            laneId: Type.String(),
            candidatePeerRunId: Type.Optional(Type.String()),
            candidateWorktree: Type.Optional(Type.String()),
            candidateBranch: Type.Optional(Type.String()),
            candidateBaseRef: Type.Optional(Type.String()),
            candidateDiffSummary: Type.Optional(Type.String()),
            candidateFilesChanged: Type.Optional(Type.Array(Type.String())),
          }),
          {
            description:
              "Controller-verified candidate lane bindings for action=level3_visible_candidate_lifecycle_plan.",
          },
        ),
      ),
      level3CandidateResultPacketDirectory: Type.Optional(
        Type.String({
          description:
            "Repo-relative packet directory for action=level3_measure_export_review_plan candidate-result packet outputs.",
        }),
      ),
      candidateResults: Type.Optional(
        Type.Array(
          Type.Object({
            laneId: Type.String({ description: "Candidate lane id, for example candidate-01." }),
            objective: Type.Optional(Type.String()),
            metric: Type.Optional(Type.Number()),
            status: Type.Optional(Type.String()),
            checksStatus: Type.Optional(Type.String()),
            confidence: Type.Optional(Type.Number()),
            candidateSource: Type.Optional(Type.String()),
            candidateWorktree: Type.Optional(Type.String()),
            candidateBranch: Type.Optional(Type.String()),
            candidateBaseRef: Type.Optional(Type.String()),
            candidateDiffSummary: Type.Optional(Type.String()),
            candidateFilesChanged: Type.Optional(Type.Array(Type.String())),
            candidatePeerRunId: Type.Optional(Type.String()),
            candidateRunnerId: Type.Optional(Type.String()),
            sourcePacketPath: Type.Optional(Type.String()),
            caveat: Type.Optional(Type.String()),
          }),
          {
            description:
              "Candidate result summaries for action=review_candidate_wave after pi-autoresearch measurement.",
          },
        ),
      ),
      candidateResultPacketPaths: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Paths to exported autoresearch.candidate_result.v1 packet JSON files for action=review_candidate_wave or action=finalize_post_fanin.",
        }),
      ),
      sourceReview: Type.Optional(
        Type.Union(
          [Type.Literal("review_candidate_wave"), Type.Literal("review_matrix_campaign")],
          {
            description:
              "Fan-in review source for action=finalize_post_fanin; defaults to review_candidate_wave.",
          },
        ),
      ),
      selectedLaneId: Type.Optional(
        Type.String({ description: "Expected selected lane id for action=finalize_post_fanin." }),
      ),
      selectedCellId: Type.Optional(
        Type.String({
          description: "Expected selected matrix cell id for action=finalize_post_fanin.",
        }),
      ),
      dirtyFiles: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Repo-relative dirty controller/parent paths that must not overlap selected finalizer files.",
        }),
      ),
      reviewedAtEpochMs: Type.Optional(
        Type.Number({ description: "Review timestamp used to detect selected packet staleness." }),
      ),
      applyAuthorizationToken: Type.Optional(
        Type.String({
          description:
            "Exact finalizer authorization token required for terminal authorized posture.",
        }),
      ),
      finalizerAuthorizationToken: Type.Optional(
        Type.String({
          description:
            "Exact level-3 finalize_post_fanin token for action=level3_authorized_finalizer_cleanup_plan.",
        }),
      ),
      cleanupAuthorizationToken: Type.Optional(
        Type.String({
          description:
            "Exact level-3 candidate_cleanup token for action=level3_authorized_finalizer_cleanup_plan when cleanup is requested before successful integration closeout or without exact closeout resources.",
        }),
      ),
      integrationCloseout: Type.Optional(
        Type.Object({
          status: Type.Union([
            Type.Literal("successful"),
            Type.Literal("failed"),
            Type.Literal("missing"),
          ]),
          commit: Type.Optional(Type.String()),
          summary: Type.Optional(Type.String()),
        }),
      ),
      cleanupPeerTabsOrSessions: Type.Optional(
        Type.Array(Type.String(), {
          description: "Exact peer tab/session ids for level-3 candidate cleanup planning.",
        }),
      ),
      cleanupWorktrees: Type.Optional(
        Type.Array(Type.String(), {
          description: "Exact candidate worktree paths for level-3 candidate cleanup planning.",
        }),
      ),
      cleanupBranches: Type.Optional(
        Type.Array(Type.String(), {
          description: "Exact candidate branches for level-3 candidate cleanup planning.",
        }),
      ),
      validation: Type.Optional(
        Type.Object({
          command: Type.String({
            description: "Validation command that was run after selected patch application.",
          }),
          status: Type.Union([
            Type.Literal("passed"),
            Type.Literal("failed"),
            Type.Literal("missing"),
          ]),
          summary: Type.Optional(Type.String()),
          artifactPath: Type.Optional(Type.String()),
        }),
      ),
      runnerManifestPath: Type.Optional(
        Type.String({
          description:
            "Optional repo-relative manifest path for action=prepare_matrix_campaign_runner or checkpoint_matrix_campaign_runner.",
        }),
      ),
      checkpointConfirmation: Type.Optional(
        Type.String({
          description:
            "Exact controller checkpoint token required by action=checkpoint_matrix_campaign_runner before benchmark/export/review calls are exposed.",
        }),
      ),
      completedActionCount: Type.Optional(
        Type.Number({
          description:
            "For action=level3_matrix_cell_executor or level4_autoresearch_campaign_runner, the count of previously controller-run and verified Level-3 runner nextLegalActions; Level-4 also resumes from its receipt file.",
          minimum: 0,
        }),
      ),
      level3ManifestPath: Type.Optional(
        Type.String({
          description:
            "Path to an autoresearch.level3_campaign_manifest.v1 JSON manifest for action=level3_manifest_preflight or action=level3_slice_sequence_dry_run.",
        }),
      ),
      level3Manifest: Type.Optional(
        Type.Record(Type.String(), Type.Unknown(), {
          description:
            "Inline autoresearch.level3_campaign_manifest.v1 object for Level-3 or Level-4 action surfaces.",
        }),
      ),
      level4ReceiptPath: Type.Optional(
        Type.String({
          description:
            "Optional cwd-relative receipt JSONL path for action=level4_autoresearch_campaign_runner.",
        }),
      ),
      maxAutomatedActions: Type.Optional(
        Type.Number({
          description:
            "Maximum safe actions Level-4 may automate in one invocation (1-25, default 1).",
          minimum: 1,
          maximum: 25,
        }),
      ),
      allowMeasureExportReview: Type.Optional(
        Type.Boolean({
          description:
            "When true, Level-4 may execute safe measure/export/status actions instead of stopping for the controller seam.",
        }),
      ),
      allowReviewGeneration: Type.Optional(
        Type.Boolean({
          description:
            "When true, Level-4 may execute safe review packet generation actions; owner gates still remain exact.",
        }),
      ),
      allowAutomaticCleanupAfterIntegrationCloseout: Type.Optional(
        Type.Boolean({
          description:
            "When true, Level-4 may consume cleanup only after successful integrationCloseout with exact resources; pre-closeout cleanup remains gated.",
        }),
      ),
      maxIterations: Type.Optional(
        Type.Number({
          description:
            "Bounded positive-integer campaign iteration budget for action=start_campaign",
          minimum: 1,
        }),
      ),
      maxWallClockMinutes: Type.Optional(
        Type.Number({
          description: "Bounded positive wall-clock budget for action=start_campaign",
          minimum: 0,
          exclusiveMinimum: 0,
        }),
      ),
      benchmarkCommand: Type.Optional(
        Type.String({ description: "Optional explicit pi-autoresearch benchmark command" }),
      ),
      checksCommand: Type.Optional(
        Type.String({ description: "Optional explicit pi-autoresearch checks command" }),
      ),
      metricName: Type.Optional(
        Type.String({
          description:
            "Optional explicit metric name for start_campaign or matrix campaign operator follow-up (for example operator_ux_blockers).",
        }),
      ),
      metricUnit: Type.Optional(Type.String({ description: "Optional explicit metric unit" })),
      direction: Type.Optional(Type.Union([Type.Literal("lower"), Type.Literal("higher")])),
      metricThreshold: Type.Optional(
        Type.Number({
          description:
            "Optional explicit metric success threshold forwarded to pi-autoresearch for action=start_campaign or rendered in matrix campaign operator follow-up.",
        }),
      ),
      reconfigure: Type.Optional(
        Type.Boolean({
          description:
            "When true, ask pi-autoresearch to append a fresh config segment for action=start_campaign instead of continuing the active segment.",
        }),
      ),
      filesInScope: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional file/path scope forwarded to pi-autoresearch for action=start_campaign peer handoff planning.",
        }),
      ),
      offLimits: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional off-limits file/path specs forwarded to pi-autoresearch for action=start_campaign peer handoff planning and enforced during review_candidate_wave selection.",
        }),
      ),
      constraints: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Optional hard constraints forwarded to pi-autoresearch for action=start_campaign peer handoff planning.",
        }),
      ),
      planner: Type.Optional(Type.Union([Type.Literal("heuristic"), Type.Literal("dspx_program")])),

      materializeDspxIntent: Type.Optional(
        Type.Boolean({
          description:
            "When planner=dspx_program, ask pi-autoresearch to write the local DSPx program-gen intent artifact.",
        }),
      ),
      runDspxProgramGen: Type.Optional(
        Type.Boolean({
          description:
            "When planner=dspx_program, ask pi-autoresearch to run bounded DSPx program-gen and use behavior_results.json as the campaign plan.",
        }),
      ),
      dspxProgramGenTimeoutSeconds: Type.Optional(
        Type.Number({ description: "DSPx program-gen timeout seconds.", minimum: 1 }),
      ),
      dspxIntentPath: Type.Optional(
        Type.String({ description: "Optional repo-relative or absolute DSPx intent path." }),
      ),
      dspxOutdir: Type.Optional(
        Type.String({
          description: "Optional repo-relative or absolute DSPx program-gen output dir.",
        }),
      ),
      dspxBehaviorPath: Type.Optional(
        Type.String({ description: "Optional DSPx behavior_results.json advisory path." }),
      ),
      intervalSeconds: Type.Optional(
        Type.Number({
          description: "Polling interval in seconds for action=start|observe|start_campaign",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal) {
      const {
        action: requestedAction,
        taskId,
        cwd,
        objective,
        candidateCount,
        candidateObjectives,
        candidatePacketDirectory,
        scenarios,
        hypotheses,
        candidateCountPerCell,
        parentPeerTarget,
        candidateResults,
        level3CandidateBindings,
        launchAuthorizationToken,
        level3CandidateResultPacketDirectory,
        candidateResultPacketPaths,
        sourceReview,
        selectedLaneId,
        selectedCellId,
        dirtyFiles,
        reviewedAtEpochMs,
        applyAuthorizationToken,
        finalizerAuthorizationToken,
        cleanupAuthorizationToken,
        cleanupPeerTabsOrSessions,
        cleanupWorktrees,
        cleanupBranches,
        integrationCloseout,
        validation,
        runnerManifestPath,
        checkpointConfirmation,
        completedActionCount,
        level3ManifestPath,
        level3Manifest,
        level4ReceiptPath,
        maxAutomatedActions,
        allowMeasureExportReview,
        allowReviewGeneration,
        allowAutomaticCleanupAfterIntegrationCloseout,
        maxIterations,
        maxWallClockMinutes,
        benchmarkCommand,
        checksCommand,
        metricName,
        metricUnit,
        direction,
        metricThreshold,
        reconfigure,
        filesInScope,
        offLimits,
        constraints,
        planner,
        materializeDspxIntent,
        runDspxProgramGen,
        dspxProgramGenTimeoutSeconds,
        dspxIntentPath,
        dspxOutdir,
        dspxBehaviorPath,
        intervalSeconds,
      } = params as {
        action?: AutoresearchLiveSupervisionAction;
        taskId?: number;
        cwd?: string;
        objective?: string;
        candidateCount?: number;
        candidateObjectives?: string[];
        candidatePacketDirectory?: string;
        scenarios?: string[];
        hypotheses?: string[];
        candidateCountPerCell?: number;
        parentPeerTarget?: string;
        level3CandidateBindings?: Array<{
          laneId: string;
          candidatePeerRunId?: string;
          candidateWorktree?: string;
          candidateBranch?: string;
          candidateBaseRef?: string;
          candidateDiffSummary?: string;
          candidateFilesChanged?: string[];
        }>;
        launchAuthorizationToken?: string;
        level3CandidateResultPacketDirectory?: string;
        candidateResults?: Array<{
          laneId: string;
          objective?: string;
          metric?: number;
          status?: string;
          checksStatus?: string;
          confidence?: number;
          candidateSource?: string;
          candidateWorktree?: string;
          candidateBranch?: string;
          candidateBaseRef?: string;
          candidateDiffSummary?: string;
          candidateFilesChanged?: string[];
          candidatePeerRunId?: string;
          candidateRunnerId?: string;
          sourcePacketPath?: string;
          caveat?: string;
        }>;
        candidateResultPacketPaths?: string[];
        sourceReview?: "review_candidate_wave" | "review_matrix_campaign";
        selectedLaneId?: string;
        selectedCellId?: string;
        dirtyFiles?: string[];
        reviewedAtEpochMs?: number;
        applyAuthorizationToken?: string;
        finalizerAuthorizationToken?: string;
        cleanupAuthorizationToken?: string;
        cleanupPeerTabsOrSessions?: string[];
        cleanupWorktrees?: string[];
        cleanupBranches?: string[];
        integrationCloseout?: {
          status: "successful" | "failed" | "missing";
          commit?: string;
          summary?: string;
        };
        validation?: {
          command: string;
          status: "passed" | "failed" | "missing";
          summary?: string;
          artifactPath?: string;
        };
        runnerManifestPath?: string;
        checkpointConfirmation?: string;
        completedActionCount?: number;
        level3ManifestPath?: string;
        level3Manifest?: Record<string, unknown>;
        level4ReceiptPath?: string;
        maxAutomatedActions?: number;
        allowMeasureExportReview?: boolean;
        allowReviewGeneration?: boolean;
        allowAutomaticCleanupAfterIntegrationCloseout?: boolean;
        maxIterations?: number;
        maxWallClockMinutes?: number;
        benchmarkCommand?: string;
        checksCommand?: string;
        metricName?: string;
        metricUnit?: string;
        direction?: "lower" | "higher";
        metricThreshold?: number;
        reconfigure?: boolean;
        filesInScope?: string[];
        offLimits?: string[];
        constraints?: string[];
        planner?: "heuristic" | "dspx_program";
        materializeDspxIntent?: boolean;
        runDspxProgramGen?: boolean;
        dspxProgramGenTimeoutSeconds?: number;
        dspxIntentPath?: string;
        dspxOutdir?: string;
        dspxBehaviorPath?: string;
        intervalSeconds?: number;
      };
      const action = requestedAction || "status";

      try {
        validateAutoresearchLiveIdentity({ action, taskId, cwd });
        const identity = taskId !== undefined && cwd !== undefined ? { taskId, cwd } : null;

        if (action === "status" && !identity) {
          const sessions = autoresearchLiveRunner.listActiveSessions();
          return createAutoresearchLiveToolResult(formatAutoresearchLiveSessionList(sessions), {
            ok: true,
            action,
            activeSessionCount: sessions.length,
            sessions,
          });
        }

        if (!identity) {
          throw new Error(`${action} requires an exact taskId and cwd.`);
        }

        if (action === "status") {
          const session = autoresearchLiveRunner.getSession(identity);
          const sessionKey = `${identity.taskId}|${path.resolve(identity.cwd)}`;
          if (!session) {
            return createAutoresearchLiveToolResult(
              formatAutoresearchLiveMissingSession({
                action: "status",
                taskId: identity.taskId,
                cwd: identity.cwd,
              }),
              {
                ok: true,
                action,
                sessionKey,
                session: null,
                nextStep: "No live supervision session is active for this task/cwd pair.",
              },
            );
          }

          const nextStep = describeAutoresearchLiveNextStep(session);
          return createAutoresearchLiveToolResult(
            formatAutoresearchLiveSessionReport({
              action,
              sessionKey,
              session,
              nextStep,
            }),
            {
              ok: true,
              action,
              sessionKey,
              session,
              nextStep,
            },
          );
        }

        if (action === "observe") {
          const result = await autoresearchLiveRunner.observe({
            ...identity,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLiveSessionReport({
              action,
              sessionKey: result.sessionKey,
              session: result.session,
              nextStep: result.nextStep,
              extraLines: formatAutoresearchLivePollExtras(result),
            }),
            {
              ok: true,
              action,
              sessionKey: result.sessionKey,
              session: result.session,
              nextStep: result.nextStep,
              projector: result.projector,
              lifecycle: result.lifecycle,
            },
          );
        }

        if (action === "start") {
          const result = await autoresearchLiveRunner.start({
            ...identity,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(formatAutoresearchLiveStartReport(result), {
            ok: true,
            action,
            sessionKey: result.sessionKey,
            session: result.session,
            reused: result.reused,
            nextStep: result.poll?.nextStep || describeAutoresearchLiveNextStep(result.session),
            poll: result.poll,
          });
        }

        if (action === "plan_candidate_wave") {
          const waveObjective = objective?.trim() ?? "";
          if (waveObjective.length === 0) {
            throw new Error("plan_candidate_wave requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.planCandidateWave({
            ...identity,
            objective: waveObjective,
            candidateCount,
            candidateObjectives,
            candidatePacketDirectory,
            filesInScope,
            offLimits,
            constraints,
            direction,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchCandidateWavePlanReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              candidateWave: result,
            },
          );
        }

        if (action === "level3_manifest_preflight") {
          const result = autoresearchLiveRunner.preflightLevel3CampaignManifest({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3ManifestPreflightReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3ManifestPreflight: result,
            },
          );
        }

        if (action === "level3_slice_sequence_dry_run") {
          const result = autoresearchLiveRunner.dryRunLevel3SliceSequence({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3SliceSequenceDryRunReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3SliceSequenceDryRun: result,
            },
          );
        }

        if (action === "level3_visible_candidate_lifecycle_plan") {
          const result = autoresearchLiveRunner.planLevel3VisibleCandidateLifecycle({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            parentPeerTarget,
            launchAuthorizationToken,
            candidateBindings: level3CandidateBindings,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3VisibleCandidateLifecyclePlanReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3VisibleCandidateLifecyclePlan: result,
            },
          );
        }

        if (action === "level3_measure_export_review_plan") {
          const result = autoresearchLiveRunner.planLevel3MeasureExportReview({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            parentPeerTarget,
            launchAuthorizationToken,
            candidateBindings: level3CandidateBindings,
            candidateResultPacketDirectory: level3CandidateResultPacketDirectory,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3MeasureExportReviewPlanReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3MeasureExportReviewPlan: result,
            },
          );
        }

        if (action === "level3_matrix_cell_runner") {
          const result = autoresearchLiveRunner.runLevel3MatrixCellRunner({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            parentPeerTarget,
            launchAuthorizationToken,
            candidateBindings: level3CandidateBindings,
            candidateResultPacketDirectory: level3CandidateResultPacketDirectory,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3MatrixCellRunnerReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3MatrixCellRunner: result,
            },
          );
        }

        if (action === "level3_authorized_finalizer_cleanup_plan") {
          const finalizerObjective = objective?.trim() ?? "";
          if (finalizerObjective.length === 0) {
            throw new Error(
              "level3_authorized_finalizer_cleanup_plan requires a non-empty objective.",
            );
          }
          const result = autoresearchLiveRunner.planLevel3AuthorizedFinalizerCleanup({
            ...identity,
            manifest: level3Manifest,
            manifestPath: level3ManifestPath,
            objective: finalizerObjective,
            sourceReview,
            direction,
            metricName,
            metricThreshold,
            candidateResultPacketPaths,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            selectedLaneId,
            selectedCellId,
            validation,
            offLimits,
            dirtyFiles,
            reviewedAtEpochMs,
            finalizerAuthorizationToken,
            cleanupAuthorizationToken,
            cleanupResources: {
              peerTabsOrSessions: cleanupPeerTabsOrSessions,
              worktrees: cleanupWorktrees,
              branches: cleanupBranches,
            },
            integrationCloseout,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3AuthorizedFinalizerCleanupPlanReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextLegalActions[0],
              level3AuthorizedFinalizerCleanupPlan: result,
            },
          );
        }

        if (action === "plan_matrix_campaign") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("plan_matrix_campaign requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.planMatrixCampaign({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchMatrixCampaignPlanReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              matrixCampaign: result,
            },
          );
        }

        if (action === "prepare_matrix_campaign_runner") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("prepare_matrix_campaign_runner requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.prepareMatrixCampaignRunner({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            runnerManifestPath,
            checkpointConfirmation,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchMatrixCampaignRunnerContractReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              matrixCampaignRunner: result,
            },
          );
        }

        if (action === "checkpoint_matrix_campaign_runner") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("checkpoint_matrix_campaign_runner requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.checkpointMatrixCampaignRunner({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            runnerManifestPath,
            checkpointConfirmation,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchMatrixCampaignRunnerCheckpointReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              matrixCampaignRunnerCheckpoint: result,
            },
          );
        }

        if (action === "level3_matrix_cell_executor") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("level3_matrix_cell_executor requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.advanceLevel3MatrixCellExecutor({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            runnerManifestPath,
            checkpointConfirmation,
            completedActionCount,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel3MatrixCellExecutorReport(result),
            {
              ok: result.stateMachineBlockers.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              level3MatrixCellExecutor: result,
            },
          );
        }

        if (action === "level4_autoresearch_campaign_runner") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("level4_autoresearch_campaign_runner requires a non-empty objective.");
          }
          const result = runAutoresearchLevel4CampaignRunner({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            runnerManifestPath,
            checkpointConfirmation,
            completedActionCount,
            candidateBindings: level3CandidateBindings,
            level4ReceiptPath,
            maxAutomatedActions,
            allowMeasureExportReview,
            allowReviewGeneration,
            allowAutomaticCleanupAfterIntegrationCloseout,
            integrationCloseout,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchLevel4CampaignRunnerReport(result),
            {
              ok: result.metric.status === "target_met",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              level4CampaignRunner: result,
            },
          );
        }

        if (action === "review_matrix_campaign") {
          const matrixObjective = objective?.trim() ?? "";
          if (matrixObjective.length === 0) {
            throw new Error("review_matrix_campaign requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.reviewMatrixCampaign({
            ...identity,
            objective: matrixObjective,
            direction,
            metricName,
            metricThreshold,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            filesInScope,
            offLimits,
            constraints,
            parentPeerTarget,
            maxIterationsPerCandidate: maxIterations,
            maxWallClockMinutesPerCandidate: maxWallClockMinutes,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchMatrixCampaignReviewReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              matrixCampaignReview: result,
            },
          );
        }

        if (action === "review_candidate_wave") {
          const waveObjective = objective?.trim() ?? "";
          if (waveObjective.length === 0) {
            throw new Error("review_candidate_wave requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.reviewCandidateWave({
            ...identity,
            objective: waveObjective,
            direction,
            candidateResults,
            candidateResultPacketPaths,
            offLimits,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchCandidateWaveReviewReport(result),
            {
              ok: true,
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              candidateWaveReview: result,
            },
          );
        }

        if (action === "finalize_post_fanin") {
          const finalizerObjective = objective?.trim() ?? "";
          if (finalizerObjective.length === 0) {
            throw new Error("finalize_post_fanin requires a non-empty objective.");
          }
          const result = autoresearchLiveRunner.finalizePostFanin({
            ...identity,
            objective: finalizerObjective,
            sourceReview: sourceReview ?? "review_candidate_wave",
            direction,
            metricName,
            metricThreshold,
            candidateResultPacketPaths,
            scenarios,
            hypotheses,
            candidateCountPerCell,
            selectedLaneId,
            selectedCellId,
            validation,
            offLimits,
            dirtyFiles,
            reviewedAtEpochMs,
            applyAuthorizationToken,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchPostFaninFinalizerReport(result),
            {
              ok: result.outcome !== "failed_closed",
              action,
              sessionKey: `${identity.taskId}|${path.resolve(identity.cwd)}`,
              nextStep: result.nextStep,
              postFaninFinalizer: result,
            },
          );
        }

        if (action === "start_campaign") {
          const campaignObjective = objective?.trim() ?? "";
          if (campaignObjective.length === 0) {
            throw new Error("start_campaign requires a non-empty objective.");
          }
          const result = await autoresearchLiveRunner.startCampaign({
            ...identity,
            objective: campaignObjective,
            maxIterations,
            maxWallClockMinutes,
            benchmarkCommand,
            checksCommand,
            metricName,
            metricUnit,
            direction,
            metricThreshold,
            reconfigure,
            filesInScope,
            offLimits,
            constraints,
            planner,
            materializeDspxIntent,
            runDspxProgramGen,
            dspxProgramGenTimeoutSeconds,
            dspxIntentPath,
            dspxOutdir,
            dspxBehaviorPath,
            intervalSeconds,
            signal,
          });
          return createAutoresearchLiveToolResult(
            formatAutoresearchCampaignStartUnderSupervisionReport(result),
            {
              ok: true,
              action,
              sessionKey: result.supervision.sessionKey,
              session: result.supervision.session,
              reused: result.supervision.reused,
              nextStep:
                result.supervision.poll?.nextStep ||
                describeAutoresearchLiveNextStep(result.supervision.session),
              poll: result.supervision.poll,
              campaign: result.campaign,
            },
          );
        }

        const result = autoresearchLiveRunner.stop(identity);
        return createAutoresearchLiveToolResult(formatAutoresearchLiveStopReport(result), {
          ok: true,
          action,
          sessionKey: result.sessionKey,
          session: result.session,
          stopped: result.stopped,
          nextStep: result.nextStep,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createAutoresearchLiveToolResult(
          `autoresearch_live_supervision failed: ${message}`,
          {
            ok: false,
            action,
            error: message,
          },
        );
      }
    },
    renderCall(args, theme) {
      const a = args as {
        action?: AutoresearchLiveSupervisionAction;
        taskId?: number;
        cwd?: string;
      };
      const action = a.action || "status";
      const target =
        a.taskId !== undefined && a.cwd
          ? `#${a.taskId} ${a.cwd}`
          : a.taskId !== undefined
            ? `#${a.taskId}`
            : a.cwd || "active sessions";
      return new Text(
        theme.fg("toolTitle", theme.bold("autoresearch_live_supervision ")) +
          theme.fg("accent", action) +
          theme.fg("dim", " — ") +
          theme.fg("muted", target),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as AutoresearchLiveSupervisionToolDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.action === "status" && !details.session) {
        return new Text(
          theme.fg("muted", `status ${details.activeSessionCount ?? 0} active session(s)`),
          0,
          0,
        );
      }

      const state = details.session?.state || "unknown";
      const color = details.ok === false ? "error" : state === "completed" ? "success" : "accent";
      const icon = details.ok === false ? "✗" : state === "completed" ? "✓" : "•";
      return new Text(
        theme.fg(color, `${icon} ${details.action || "status"}`) + theme.fg("dim", ` ${state}`),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: autoresearch_manifest_campaign_supervision
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_manifest_campaign_supervision",
    label: "Autoresearch Manifest Campaign Supervision",
    description:
      "Observe one exact manifest-driven pi-autoresearch campaign and optionally record bounded AK evidence above the package seam.",
    promptSnippet:
      "Observe one exact manifest-driven pi-autoresearch campaign through the orchestrator and optionally record bounded AK evidence from verified task context, not raw peer messages.",
    promptGuidelines: [
      "Use autoresearch_manifest_campaign_supervision when the caller already knows the exact manifest path and wants one-shot observation or bounded AK evidence projection above the package seam.",
      "Use action=record_evidence only when the caller already has an exact taskId; this surface stays evidence-only and does not add polling, stage execution, or task lifecycle mutation.",
      "Do not turn peer-assisted autoresearch into orchestrator-owned peer launch, review choreography, or hidden autonomy; visible peers remain optional caller-launched lanes.",
      "If a peer report influenced the observation, verify and summarize the controller-accepted finding before recording evidence; raw intercom delivery is not authority.",
    ],
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("observe"), Type.Literal("record_evidence")])),
      taskId: Type.Optional(Type.Number({ description: "Exact AK task id anchor", minimum: 1 })),
      cwd: Type.Optional(Type.String({ description: "Exact campaign cwd" })),
      manifestPath: Type.String({
        description: "Exact manifest path relative to cwd or absolute.",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        action?: AutoresearchManifestCampaignSupervisionAction;
        taskId?: number;
        cwd?: string;
        manifestPath: string;
      };
      const action = request.action || "observe";
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();

      try {
        if (action === "record_evidence" && request.taskId === undefined) {
          throw new Error("record_evidence requires an exact taskId.");
        }

        if (action === "observe") {
          const observation = manifestCampaignSupervisor.observe({
            cwd,
            manifestPath: request.manifestPath,
            taskId: request.taskId,
          });
          return createAutoresearchManifestCampaignToolResult(
            formatAutoresearchManifestCampaignObservationReport({
              action,
              observation,
              nextStep: observation.nextStep,
            }),
            {
              ok: true,
              action,
              observation,
              nextStep: observation.nextStep,
            },
          );
        }

        const result = await manifestCampaignSupervisor.recordEvidence({
          cwd,
          manifestPath: request.manifestPath,
          taskId: request.taskId,
          signal,
        });
        return createAutoresearchManifestCampaignToolResult(
          formatAutoresearchManifestCampaignEvidenceReport(result),
          {
            ok: result.ok,
            action,
            observation: result.observation,
            task: result.task,
            evidenceAction: result.action,
            evidenceVia: result.evidence?.via,
            existingEvidenceId: result.existingEvidenceId,
            nextStep: result.nextStep,
            error: result.error,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createAutoresearchManifestCampaignToolResult(
          `autoresearch_manifest_campaign_supervision failed: ${message}`,
          {
            ok: false,
            action,
            error: message,
          },
        );
      }
    },
    renderCall(args, theme) {
      const a = args as {
        action?: AutoresearchManifestCampaignSupervisionAction;
        taskId?: number;
        manifestPath?: string;
      };
      const action = a.action || "observe";
      const target =
        a.taskId !== undefined
          ? `#${a.taskId} ${a.manifestPath || "(manifest)"}`
          : a.manifestPath || "(manifest)";
      return new Text(
        theme.fg("toolTitle", theme.bold("autoresearch_manifest_campaign_supervision ")) +
          theme.fg("accent", action) +
          theme.fg("dim", " — ") +
          theme.fg("muted", target),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as
        | AutoresearchManifestCampaignSupervisionToolDetails
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const action = details.evidenceAction || details.action;
      const color =
        details.ok === false
          ? "error"
          : action === "recorded" || action === "already-projected"
            ? "success"
            : "accent";
      const icon = details.ok === false ? "✗" : action === "recorded" ? "✓" : "•";
      return new Text(
        theme.fg(color, `${icon} ${details.action}`) +
          theme.fg(
            "dim",
            ` ${details.observation?.controlResult.control.autonomy.projection.overallState || "-"}`,
          ),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: autoresearch_self_hosting_supervision
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_self_hosting_supervision",
    label: "Autoresearch Self-Hosting Supervision",
    description:
      "Observe one pi-autoresearch self-hosting artifact set and optionally record bounded AK evidence above the package seam.",
    promptSnippet:
      "Observe one exact pi-autoresearch self-hosting campaign through the orchestrator and optionally record bounded AK evidence from verified task context, without running candidates or approving promotion.",
    promptGuidelines: [
      "Use autoresearch_self_hosting_supervision when the caller wants above-seam observation of autoresearch.self-hosting.json, its evaluator lock, and its promotion/rollback record.",
      "Use action=observe for read-only contract/evaluator/promotion posture; it must not run candidates, mutate evaluator locks, approve promotion, rotate controllers, roll back controllers, spawn peers, or complete tasks.",
      "Use action=record_evidence only when the caller already has an exact taskId; this surface stays evidence-only and does not reclassify applicability independently of pi-autoresearch.",
      "If a peer report or package-local receipt influenced the observation, verify and summarize the controller-accepted artifact state before recording evidence; raw intercom delivery and local receipts are not durable authority.",
    ],
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("observe"), Type.Literal("record_evidence")])),
      taskId: Type.Optional(Type.Number({ description: "Exact AK task id anchor", minimum: 1 })),
      cwd: Type.String({
        description: "Exact package cwd containing autoresearch.self-hosting.json",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
      const request = params as {
        action?: AutoresearchSelfHostingSupervisionAction;
        taskId?: number;
        cwd?: string;
      };
      const action = request.action || "observe";
      const cwd = request.cwd;

      try {
        if (!cwd) {
          throw new Error("autoresearch_self_hosting_supervision requires an exact cwd.");
        }
        if (action === "record_evidence" && request.taskId === undefined) {
          throw new Error("record_evidence requires an exact taskId.");
        }

        if (action === "observe") {
          const observation = selfHostingSupervisor.observe({
            cwd,
            taskId: request.taskId,
          });
          return createAutoresearchSelfHostingToolResult(
            formatAutoresearchSelfHostingObservationReport({
              action,
              observation,
              nextStep: observation.nextStep,
            }),
            {
              ok: true,
              action,
              observation,
              nextStep: observation.nextStep,
            },
          );
        }

        const result = await selfHostingSupervisor.recordEvidence({
          cwd,
          taskId: request.taskId,
          signal,
        });
        return createAutoresearchSelfHostingToolResult(
          formatAutoresearchSelfHostingEvidenceReport(result),
          {
            ok: result.ok,
            action,
            observation: result.observation,
            task: result.task,
            evidenceAction: result.action,
            evidenceVia: result.evidence?.via,
            existingEvidenceId: result.existingEvidenceId,
            nextStep: result.nextStep,
            error: result.error,
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createAutoresearchSelfHostingToolResult(
          `autoresearch_self_hosting_supervision failed: ${message}`,
          {
            ok: false,
            action,
            error: message,
          },
        );
      }
    },
    renderCall(args, theme) {
      const a = args as {
        action?: AutoresearchSelfHostingSupervisionAction;
        taskId?: number;
        cwd?: string;
      };
      const action = a.action || "observe";
      const target = a.taskId !== undefined ? `#${a.taskId} ${a.cwd || "(cwd)"}` : a.cwd || "(cwd)";
      return new Text(
        theme.fg("toolTitle", theme.bold("autoresearch_self_hosting_supervision ")) +
          theme.fg("accent", action) +
          theme.fg("dim", " — ") +
          theme.fg("muted", target),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as AutoresearchSelfHostingSupervisionToolDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      const action = details.evidenceAction || details.action;
      const color =
        details.ok === false
          ? "error"
          : action === "recorded" || action === "already-projected"
            ? "success"
            : "accent";
      const icon = details.ok === false ? "✗" : action === "recorded" ? "✓" : "•";
      return new Text(
        theme.fg(color, `${icon} ${details.action}`) +
          theme.fg("dim", ` ${details.observation?.promotionPosture || "-"}`),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // TOOL: autoresearch_learning_kes_adapter
  // ===========================================================================

  registerCompatTool(pi, {
    name: "autoresearch_learning_kes_adapter",
    label: "Autoresearch Learning KES Adapter",
    description:
      "Plan or explicitly materialize package-owned KES diary and candidate-only learning artifacts from an autoresearch.learning.v1 packet.",
    promptSnippet:
      "Consume an autoresearch.learning.v1 packet through the pi-society-orchestrator KES owner seam.",
    promptGuidelines: [
      "Use action=plan first to inspect the package-owned KES diary and candidate-learning paths without writing files.",
      "Use action=materialize only when the caller explicitly wants pi-society-orchestrator to write candidate-only KES artifacts under its diary/ and docs/learnings/ roots.",
      "Do not use this tool to mutate pi-autoresearch, AK, Prompt Vault, ROCS, Oracle/DSPx, or promotion state.",
    ],
    parameters: Type.Object({
      action: Type.Optional(Type.Union([Type.Literal("plan"), Type.Literal("materialize")])),
      packetPath: Type.String({
        description:
          "Path to an autoresearch.learning.v1 packet JSON file produced by pi-autoresearch.",
      }),
      sessionId: Type.Optional(
        Type.String({ description: "Optional Pi/session identifier to include in KES metadata." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const request = params as {
        action?: AutoresearchLearningKesAdapterAction;
        packetPath: string;
        sessionId?: string;
      };
      const action = request.action || "plan";

      try {
        if (!request.packetPath || request.packetPath.trim().length === 0) {
          throw new Error("autoresearch_learning_kes_adapter requires packetPath.");
        }
        const loadedPacket = loadAutoresearchLearningPacketWithSource(request.packetPath);
        const result = buildAutoresearchLearningKesAdapterResult({
          packageRoot: autoresearchLearningKesPackageRoot,
          packet: loadedPacket.packet,
          packetSource: loadedPacket.source,
          action,
          sessionId: request.sessionId,
        });
        return createAutoresearchLearningKesAdapterToolResult(
          formatAutoresearchLearningKesAdapterReport(result),
          {
            ok: true,
            action,
            result,
            nextStep:
              action === "plan"
                ? "Review the KES plan, then rerun with action=materialize only if candidate-only package-owned writes are intended."
                : "Review the written KES candidate artifacts before any separate promotion step.",
          },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return createAutoresearchLearningKesAdapterToolResult(
          `autoresearch_learning_kes_adapter failed: ${message}`,
          {
            ok: false,
            action,
            error: message,
          },
        );
      }
    },
    renderCall(args, theme) {
      const a = args as { action?: AutoresearchLearningKesAdapterAction; packetPath?: string };
      const action = a.action || "plan";
      return new Text(
        theme.fg("toolTitle", theme.bold("autoresearch_learning_kes_adapter ")) +
          theme.fg("accent", action) +
          theme.fg("dim", " — ") +
          theme.fg("muted", a.packetPath || "(packetPath)"),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as AutoresearchLearningKesAdapterToolDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }
      const icon = details.ok === false ? "✗" : details.action === "materialize" ? "✓" : "•";
      const color =
        details.ok === false ? "error" : details.action === "materialize" ? "success" : "accent";
      return new Text(
        theme.fg(color, `${icon} ${details.action}`) +
          theme.fg("dim", ` ${details.result?.status || "failed"}`),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // COMMANDS
  // ===========================================================================

  pi.registerCommand("evidence", {
    description: "Show recent evidence via ak evidence search",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const results = await previewRecentEvidence(
        {
          akPath: AGENT_KERNEL,
          societyDb: SOCIETY_DB,
          cwd: ctx.cwd,
        },
        undefined,
        20,
      );
      if (isBoundaryFailure(results)) {
        ctx.ui.notify(`Failed to query evidence: ${results.error}`, "error");
        return;
      }

      if (results.value.entryCount === 0) {
        ctx.ui.notify("No evidence recorded yet.", "info");
        return;
      }

      const suffix = results.value.truncated
        ? `\n\n… showing latest 20 of ${results.value.entryCount} evidence rows from ak evidence search.`
        : "";
      await ctx.ui.editor("Evidence Ledger", `${results.value.text}${suffix}`);
    },
  });

  pi.registerCommand("workflow", {
    description: "Seed a workflow_execute call in the editor: /workflow [objective]",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const objective = (args || "").trim();
      ctx.ui.setEditorText(buildWorkflowExecuteInvocation(objective || undefined));
      ctx.ui.notify(
        objective
          ? `Seeded workflow_execute chain for: ${objective}`
          : "Inserted starter workflow_execute template.",
        "info",
      );
    },
  });

  pi.registerCommand("workflows", {
    description: "Show workflow wrapper usage and examples",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      await ctx.ui.editor("Workflow wrappers", formatWorkflowWrapperGuide());
    },
  });

  pi.registerCommand("ontology", {
    description: "Search ontology concepts",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;

      const search = args?.trim();
      if (!search) {
        ctx.ui.notify("Usage: /ontology <search>", "warning");
        return;
      }

      const results = await lookupOntologyConcepts({ search, limit: 10 });
      if (isBoundaryFailure(results)) {
        ctx.ui.notify(`Failed to query ontology: ${results.error}`, "error");
        return;
      }

      if (results.value.length === 0) {
        ctx.ui.notify(`No concepts found for: ${search}`, "warning");
        return;
      }

      await ctx.ui.editor("Ontology", formatOntologyConcepts(results.value));
    },
  });

  // ===========================================================================
  // TOOL: workflow_execute
  // ===========================================================================

  registerCompatTool(pi, {
    name: "workflow_execute",
    label: "Execute Workflow",
    description: `Execute a bounded chain or parallel workflow composition over the ASC-backed subagent executor.

Supports:
- chain: sequential step execution; halts on first failure
- parallel: concurrent step execution within parallel groups
- worktree isolation: optional git worktree coordination for eligible parallel groups

Each step dispatches a named agent (scout, builder, reviewer, researcher) with a cognitive tool.
The workflow executor validates the request against the active team, preserves step-level status
and failureKind truth, and produces a structured aggregated output with workflow/group/task summaries.`,
    promptSnippet:
      "Execute a chain or parallel workflow composition over the orchestrator's ASC-backed subagent seam.",
    promptGuidelines: [
      "Use workflow_execute when the task decomposes into a structured sequence of agent steps rather than a single cognitive dispatch.",
      "Prefer chain mode for dependent steps; use parallel groups for independent work that can run concurrently.",
      "Set worktree: true on parallel groups only when steps may mutate files and git isolation is required.",
    ],
    parameters: Type.Object({
      request: Type.Object({
        mode: Type.Union([Type.Literal("chain"), Type.Literal("parallel")], {
          description:
            "Workflow mode: chain (sequential, halt on failure) or parallel (concurrent within groups)",
        }),
        cwd: Type.Optional(Type.String({ description: "Shared working directory for all steps" })),
        steps: Type.Array(
          Type.Union([
            Type.Object({
              kind: Type.Literal("step"),
              agent: Type.Union(WORKFLOW_AGENT_NAMES.map((name) => Type.Literal(name))),
              objective: Type.String({ description: "What this step should accomplish" }),
              cwd: Type.Optional(Type.String({ description: "Step-specific cwd override" })),
            }),
            Type.Object({
              kind: Type.Literal("parallel"),
              concurrency: Type.Optional(Type.Number({ description: "Max concurrent tasks" })),
              worktree: Type.Optional(Type.Boolean({ description: "Use git worktree isolation" })),
              tasks: Type.Array(
                Type.Object({
                  kind: Type.Literal("step"),
                  agent: Type.Union(WORKFLOW_AGENT_NAMES.map((name) => Type.Literal(name))),
                  objective: Type.String({ description: "What this task should accomplish" }),
                  cwd: Type.Optional(Type.String({ description: "Task-specific cwd override" })),
                }),
              ),
            }),
          ]),
        ),
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { request } = params as { request: unknown };
      const activeTeam = sessionTeams.getTeam(ctx);
      const model = ctx.model
        ? `${ctx.model.provider}/${ctx.model.id}`
        : "openrouter/google/gemini-2.5-flash-preview";

      // Load cognitive tool for workflow context
      const toolResult = await getCognitiveToolByName("controlled", { cwd: ctx.cwd }, signal);
      const cognitiveToolContent =
        toolResult && !isBoundaryFailure(toolResult) && toolResult.value
          ? toolResult.value.content
          : "FRAMEWORK: workflow execution";

      const workflowExecutor = createWorkflowExecutor({
        sessionsDir: path.join(os.homedir(), ".pi", "agent", "sessions", "workflows"),
      });

      try {
        const result = await workflowExecutor.execute({
          request,
          activeTeam,
          model,
          cwd: ctx.cwd,
          cognitiveToolContent,
          signal,
        });

        const statusIcon = result.status === "done" ? "✓" : "✗";
        const truncatedOutput =
          result.aggregatedOutput.length > 8000
            ? `${result.aggregatedOutput.slice(0, 8000)}\n\n... [truncated]`
            : result.aggregatedOutput;

        const summary = `${statusIcon} Workflow (${result.mode}) — ${result.status} — ${result.steps.length} step(s) executed`;

        return {
          content: [{ type: "text" as const, text: `${summary}\n\n${truncatedOutput}` }],
          details: {
            ok: result.status === "done",
            mode: result.mode,
            status: result.status,
            stepCount: result.steps.length,
            stepStatuses: result.steps.map((step) => ({
              index: step.index,
              agent: step.agent,
              status: step.status,
              failureKind: step.failureKind || null,
              provenance: step.provenance || null,
            })),
            worktreeSummary: result.worktreeSummary || null,
          },
        };
      } catch (error) {
        if (error instanceof WorkflowExecutionError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Workflow execution failed: ${error.message}${error.issues ? `\nIssues: ${error.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}` : ""}`,
              },
            ],
            details: {
              ok: false,
              errorCode: error.code,
              issues:
                error.issues?.map((issue) => ({
                  path: issue.path,
                  code: issue.code,
                  message: issue.message,
                })) || [],
            },
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `Workflow execution failed: ${message}` }],
          details: { ok: false, error: message },
        };
      }
    },
    renderCall(args, theme) {
      const a = args as { request?: { mode?: string; steps?: unknown[] } };
      const mode = a.request?.mode || "?";
      const stepCount = a.request?.steps?.length ?? 0;
      return new Text(
        theme.fg("toolTitle", theme.bold("workflow_execute ")) +
          theme.fg("accent", mode) +
          theme.fg("dim", ` — ${stepCount} node(s)`),
        0,
        0,
      );
    },
    renderResult(result, _options, theme) {
      const details = result.details as
        | { ok?: boolean; mode?: string; status?: string; stepCount?: number }
        | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text.slice(0, 200) : "", 0, 0);
      }

      const icon = details.ok ? "✓" : "✗";
      const color = details.ok ? "success" : "error";
      return new Text(
        theme.fg(color, `${icon} ${details.mode} workflow`) +
          theme.fg("dim", ` — ${details.status} — ${details.stepCount} step(s)`),
        0,
        0,
      );
    },
  });

  // ===========================================================================
  // LOOP ENGINE REGISTRATION
  // ===========================================================================

  // Register loop tools (loop_execute)
  registerLoopTools(pi, undefined, resolveVaultDir(), (agent, ctx) =>
    resolveAgentForTeam(agent, sessionTeams.getTeam(ctx)),
  );

  // Register loop commands (/loop, /loops)
  registerLoopCommands(pi);

  // Runtime footer/status surfaces live in extensions/runtime-footer.ts.
}
