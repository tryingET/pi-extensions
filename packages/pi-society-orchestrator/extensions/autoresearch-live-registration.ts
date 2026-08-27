// ---
// summary: "Registers the large bounded live autoresearch supervision control-plane tool."
// read_when:
//   - "Changing live supervision actions, schemas, reports, identity, or lifecycle routing."
// ---

import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type {
  AutoresearchLiveSupervisionAction,
  AutoresearchLiveSupervisionToolDetails,
} from "../src/runtime/autoresearch-report-format.ts";
import {
  formatAutoresearchCampaignStartUnderSupervisionReport,
  formatAutoresearchCandidateWavePlanReport,
  formatAutoresearchCandidateWaveReviewReport,
  formatAutoresearchLevel3AuthorizedFinalizerCleanupPlanReport,
  formatAutoresearchLevel3ManifestPreflightReport,
  formatAutoresearchLevel3MatrixCellExecutorReport,
  formatAutoresearchLevel3MatrixCellRunnerReport,
  formatAutoresearchLevel3MeasureExportReviewPlanReport,
  formatAutoresearchLevel3SliceSequenceDryRunReport,
  formatAutoresearchLevel3VisibleCandidateLifecyclePlanReport,
  formatAutoresearchLevel4CampaignRunnerReport,
  formatAutoresearchLiveMissingSession,
  formatAutoresearchLivePollExtras,
  formatAutoresearchLiveSessionList,
  formatAutoresearchLiveSessionReport,
  formatAutoresearchLiveStartReport,
  formatAutoresearchLiveStopReport,
  formatAutoresearchMatrixCampaignPlanReport,
  formatAutoresearchMatrixCampaignReviewReport,
  formatAutoresearchMatrixCampaignRunnerCheckpointReport,
  formatAutoresearchMatrixCampaignRunnerContractReport,
  formatAutoresearchPostFaninFinalizerReport,
} from "../src/runtime/autoresearch-report-format.ts";
import {
  type AutoresearchLiveSupervisionRunner,
  describeAutoresearchLiveNextStep,
  runAutoresearchLevel4CampaignRunner,
} from "../src/runtime/autoresearch-supervisor-runner.ts";
import {
  createAutoresearchLiveToolResult,
  validateAutoresearchLiveIdentity,
} from "./autoresearch-tool-adapters.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

export function registerAutoresearchLiveSupervisionTool(
  pi: ExtensionAPI,
  autoresearchLiveRunner: AutoresearchLiveSupervisionRunner,
): void {
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
      "Use action=level3_authorized_finalizer_cleanup_plan to consume exact finalize_post_fanin and candidate closeout gates and emit lifecycle-v2 status/plan handoffs. Successful integration does not itself authorize deletion; lifecycle-v2 owner review, proof, archive, authorization, and execution remain required while promotion and AK writes stay separate.",
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
      cleanupPeerRunIds: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Exact candidate_peer_spawn peer run ids for lifecycle-v2 closeout planning.",
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
      maxParallelCandidatePeers: Type.Optional(
        Type.Number({
          description:
            "Level-4 whole-matrix executor visible candidate_peer_spawn concurrency limit (1-12, default 4).",
          minimum: 1,
          maximum: 12,
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
        cleanupPeerRunIds,
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
        maxParallelCandidatePeers,
        allowMeasureExportReview,
        allowReviewGeneration,
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
        cleanupPeerRunIds?: string[];
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
        maxParallelCandidatePeers?: number;
        allowMeasureExportReview?: boolean;
        allowReviewGeneration?: boolean;
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
              peerRunIds: cleanupPeerRunIds,
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
            maxParallelCandidatePeers,
            allowMeasureExportReview,
            allowReviewGeneration,
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
}
