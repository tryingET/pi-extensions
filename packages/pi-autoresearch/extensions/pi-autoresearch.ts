import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  advanceLlamacppCampaign,
  buildLlamacppCampaignAkBinding,
  buildLlamacppCampaignAkBindingDetails,
  buildLlamacppCampaignProjection,
  executeLlamacppCampaignControl,
  executeLlamacppCampaignStage,
  formatLlamacppCampaignControlResult,
  formatLlamacppCampaignResult,
  inspectLlamacppCampaignControl,
  persistDerivedLlamacppCampaignProjection,
  persistLlamacppCampaignProjection,
  planLlamacppCampaignMatrix,
  prepareLlamacppCampaignFork,
} from "../src/core/llamacppCampaign.ts";
import {
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  type AutoresearchLoopProgressEvent,
  buildAutoresearchAutoplan,
  buildAutoresearchPeerAssistPlan,
  buildAutoresearchRuntimeStatus,
  executeAutoresearchCampaignStart,
  executeAutoresearchLoop,
  executeAutoresearchResumeApply,
  executeAutoresearchRun,
  executeAutoresearchSetup,
  formatAutoresearchAutoplanResult,
  formatAutoresearchCampaignStartResult,
  formatAutoresearchDashboard,
  formatAutoresearchLoopResult,
  formatAutoresearchPeerAssistPlan,
  formatAutoresearchResumeApplyResult,
  formatAutoresearchRunResult,
  formatAutoresearchSetupResult,
} from "../src/core/runtime.ts";
import {
  AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
  classifyAutoresearchSelfHostingApplicability,
  executeAutoresearchSelfHostingCandidateSubprocess,
  executeAutoresearchSelfHostingEvaluatorSuite,
  inspectAutoresearchSelfHostingCandidateScope,
  loadAutoresearchSelfHostingArtifacts,
  loadAutoresearchSelfHostingPromotionRecord,
  prepareAutoresearchSelfHostingCandidateWorktree,
  prepareAutoresearchSelfHostingPromotionRecord,
  recordAutoresearchSelfHostingRollback,
  resolveAutoresearchSelfHostingPromotionRecordPath,
} from "../src/core/selfHosting.ts";
import { transformAutoresearchDollarInput } from "./pi-autoresearch/commandText.ts";
import { registerAutoresearchWidget } from "./pi-autoresearch/dashboardUi.ts";
import {
  cancelAutoresearchAutoContinuationFollowUp,
  scheduleAutoresearchAutoContinuationFollowUp,
} from "./pi-autoresearch/extensionAutoContinuation.ts";
import {
  type PiAutoresearchExtensionOptions,
  resolveDecisionRuntime,
} from "./pi-autoresearch/extensionOptions.ts";
import type { AutoresearchWidgetContext } from "./pi-autoresearch/extensionUiTypes.ts";
import {
  assertReadProfileAllowsAction,
  assertReadProfileRejectsTool,
} from "./pi-autoresearch/readProfile.ts";
import { openAutoresearchShell } from "./pi-autoresearch/shellCommand.ts";
import { registerAutoresearchPlanningTools } from "./pi-autoresearch/toolPlanning.ts";
import { registerAutoresearchStatusControlTools } from "./pi-autoresearch/toolStatusControl.ts";
import { maybeRegisterAutoresearchLiveTrigger } from "./pi-autoresearch/triggerPicker.ts";

export type { PiAutoresearchExtensionOptions } from "./pi-autoresearch/extensionOptions.ts";
export type { AutoresearchExtensionEffectProfile } from "./pi-autoresearch/readProfile.ts";

import {
  asPiToolParameters,
  autoplanSchema,
  campaignControlSchema,
  campaignSchema,
  campaignStartSchema,
  loopSchema,
  peerAssistSchema,
  resumeApplySchema,
  runSchema,
  selfHostingSchema,
  setupSchema,
} from "./pi-autoresearch/schemas.ts";
import {
  emitAutoresearchSelfHostingUpdate,
  formatAutoresearchSelfHostingCommandInvocation,
  formatAutoresearchSelfHostingCommandResult,
  formatAutoresearchSelfHostingPrepareText,
  formatAutoresearchSelfHostingRollbackText,
  formatAutoresearchSelfHostingStatusText,
  formatAutoresearchSelfHostingWaveText,
  normalizeAutoresearchSelfHostingCommand,
  normalizeAutoresearchSelfHostingRegressionPercents,
} from "./pi-autoresearch/selfHostingFormat.ts";

function shouldPersistLlamacppProjection(input: {
  apply?: boolean;
  persistProjection?: boolean;
}): boolean {
  return input.apply === true || input.persistProjection === true;
}

function formatLlamacppProjectionLines(input: {
  projectionPath: string | null;
  projection: { manifest: { campaignId: string }; status: { overallState: string } };
  persisted: boolean;
}): string[] {
  return [
    "## Projection",
    input.projectionPath ? `- path: ${input.projectionPath}` : "- path: (not persisted)",
    `- persistence: ${input.persisted ? "persisted" : "skipped; pass persistProjection=true or apply=true for an explicit write"}`,
    `- campaign: ${input.projection.manifest.campaignId}`,
    `- overall state: ${input.projection.status.overallState}`,
  ];
}

export function registerPiAutoresearchExtension(
  pi: ExtensionAPI,
  options: PiAutoresearchExtensionOptions = {},
): void {
  let unregisterAutoresearchLiveTrigger: (() => void) | null = null;
  const dashboardExportIntervals = new Map<string, ReturnType<typeof setInterval>>();
  const autoContinuationCounts = new Map<string, number>();
  const autoContinuationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let sessionActive = true;

  void maybeRegisterAutoresearchLiveTrigger(options.triggerSurface).then((registration) => {
    if (!sessionActive) {
      registration.unregister();
      return;
    }
    unregisterAutoresearchLiveTrigger = registration.unregister;
  });

  const maybeOn = (
    pi as unknown as { on?: (event: string, handler: (...args: unknown[]) => unknown) => void }
  ).on;
  if (typeof maybeOn === "function") {
    maybeOn.call(pi, "session_start", (_event: unknown, ctx: unknown) => {
      if (process.env.PI_AUTORESEARCH_WIDGET === "0") return;
      registerAutoresearchWidget(ctx as AutoresearchWidgetContext);
    });
    maybeOn.call(pi, "agent_start", (_event: unknown, ctx: unknown) => {
      cancelAutoresearchAutoContinuationFollowUp(
        (ctx as AutoresearchWidgetContext).cwd,
        autoContinuationTimers,
      );
    });
    maybeOn.call(pi, "agent_end", (_event: unknown, ctx: unknown) => {
      scheduleAutoresearchAutoContinuationFollowUp(
        pi,
        ctx as AutoresearchWidgetContext,
        autoContinuationCounts,
        autoContinuationTimers,
      );
    });
    maybeOn.call(pi, "session_shutdown", () => {
      sessionActive = false;
      unregisterAutoresearchLiveTrigger?.();
      unregisterAutoresearchLiveTrigger = null;
      for (const interval of dashboardExportIntervals.values()) clearInterval(interval);
      dashboardExportIntervals.clear();
      for (const timer of autoContinuationTimers.values()) clearTimeout(timer);
      autoContinuationTimers.clear();
      autoContinuationCounts.clear();
    });
  }

  pi.registerCommand(AUTORESEARCH_COMMAND_NAME, {
    description: "Open the pi-autoresearch bounded-runtime overview",
    handler: async (args, ctx) => {
      await openAutoresearchShell(args, ctx, dashboardExportIntervals, options);
    },
  });

  if (typeof maybeOn === "function") {
    maybeOn.call(pi, "input", async (event: unknown, ctx: unknown) => {
      const inputEvent = event as { source?: string; text?: unknown };
      const inputContext = ctx as { cwd: string };
      if (inputEvent.source === "extension") return { action: "continue" as const };
      const transformed = transformAutoresearchDollarInput(
        String(inputEvent.text ?? ""),
        inputContext.cwd,
      );
      if (!transformed) return { action: "continue" as const };
      return { action: "transform" as const, text: transformed };
    });
  }

  registerAutoresearchPlanningTools(pi, options);
  registerAutoresearchStatusControlTools({ pi, options, autoContinuationCounts });

  pi.registerTool({
    name: AUTORESEARCH_RUN_TOOL_NAME,
    label: "Autoresearch Runtime Run",
    description:
      "Execute one bounded local pi-autoresearch run, append receipts plus machine/ledger events, and optionally request a governed post-run next-hypothesis decision.",
    promptSnippet:
      "Execute one bounded local pi-autoresearch run, parse metrics, run checks, update the XState machine/event ledger, append receipts, and optionally request a governed next-hypothesis decision.",
    parameters: asPiToolParameters(runSchema),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        description: string;
        runKind?: "ordinary" | "calibration";
        hypothesisId?: string;
        hypothesis?: string;
        interventionSummary?: string;
        expectedPrimaryEffect?: string;
        hypothesisTargetFiles?: string[];
        experimentRisk?: string;
        candidateSource?: "candidate_peer_spawn" | "manual";
        candidateWorktree?: string;
        candidateBranch?: string;
        candidateBaseRef?: string;
        candidateDiffSummary?: string;
        candidateFilesChanged?: string[];
        name?: string;
        metricName?: string;
        metricUnit?: string;
        direction?: "lower" | "higher";
        metricThreshold?: number;
        benchmarkCommand?: string;
        checksCommand?: string | null;
        timeoutSeconds?: number;
        checksTimeoutSeconds?: number;
        postureCommand?: string;
        postureTimeoutSeconds?: number;
        reconfigure?: boolean;
        decisionGoal?: string;
        decisionConstraints?: string[];
        decisionFilesInScope?: string[];
        decisionOffLimits?: string[];
        decisionIdeasBacklog?: string[];
        decisionAsiNotes?: string[];
        decisionDeadEndMemory?: string[];
      };

      assertReadProfileRejectsTool(options, AUTORESEARCH_RUN_TOOL_NAME);
      const result = await executeAutoresearchRun({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        description: request.description,
        runKind: request.runKind,
        experiment: {
          hypothesisId: request.hypothesisId,
          hypothesis: request.hypothesis,
          interventionSummary: request.interventionSummary,
          expectedPrimaryEffect: request.expectedPrimaryEffect,
          targetFiles: request.hypothesisTargetFiles,
          risk: request.experimentRisk,
          candidate: {
            source: request.candidateSource,
            worktreePath: request.candidateWorktree,
            branch: request.candidateBranch,
            baseRef: request.candidateBaseRef,
            diffSummary: request.candidateDiffSummary,
            filesChanged: request.candidateFilesChanged,
          },
        },
        name: request.name,
        metricName: request.metricName,
        metricUnit: request.metricUnit,
        direction: request.direction,
        metricThreshold: request.metricThreshold,
        benchmarkCommand: request.benchmarkCommand,
        checksCommand: request.checksCommand,
        timeoutSeconds: request.timeoutSeconds,
        checksTimeoutSeconds: request.checksTimeoutSeconds,
        postureCommand: request.postureCommand,
        postureTimeoutSeconds: request.postureTimeoutSeconds,
        reconfigure: request.reconfigure,
        liveDecision: request.decisionGoal
          ? {
              runtime: resolveDecisionRuntime(ctx, signal, options),
              goal: request.decisionGoal,
              constraints: request.decisionConstraints,
              filesInScope: request.decisionFilesInScope,
              offLimits: request.decisionOffLimits,
              ideasBacklog: request.decisionIdeasBacklog,
              asiNotes: request.decisionAsiNotes,
              deadEndMemory: request.decisionDeadEndMemory,
              model: ctx.model?.id,
            }
          : undefined,
        signal,
      });

      return {
        content: [{ type: "text", text: formatAutoresearchRunResult(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_AUTOPLAN_TOOL_NAME,
    label: "Autoresearch Runtime Autoplan",
    description:
      "Explore the local repo/problem space and propose a bounded pi-autoresearch campaign setup, optionally with a DSPx-generated DSPy planner assembly.",
    promptSnippet:
      "Use before setup when campaign config, metric, benchmark, checks, or DSPx planner handoff should be inferred from the repo and objective.",
    parameters: asPiToolParameters(autoplanSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        objective: string;
        planner?: "heuristic" | "dspx_program";
        filesInScope?: string[];
        offLimits?: string[];
        constraints?: string[];
        benchmarkCommand?: string;
        checksCommand?: string | null;
        metricName?: string;
        metricUnit?: string;
        direction?: "lower" | "higher";
        metricThreshold?: number;
        materializeDspxIntent?: boolean;
        dspxIntentPath?: string;
        dspxOutdir?: string;
        dspxBehaviorPath?: string;
      };
      assertReadProfileRejectsTool(options, AUTORESEARCH_AUTOPLAN_TOOL_NAME);
      const result = buildAutoresearchAutoplan({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        objective: request.objective,
        planner: request.planner,
        filesInScope: request.filesInScope,
        offLimits: request.offLimits,
        constraints: request.constraints,
        benchmarkCommand: request.benchmarkCommand,
        checksCommand: request.checksCommand,
        metricName: request.metricName,
        metricUnit: request.metricUnit,
        direction: request.direction,
        metricThreshold: request.metricThreshold,
        materializeDspxIntent: request.materializeDspxIntent,
        dspxIntentPath: request.dspxIntentPath,
        dspxOutdir: request.dspxOutdir,
        dspxBehaviorPath: request.dspxBehaviorPath,
      });
      return {
        content: [{ type: "text", text: formatAutoresearchAutoplanResult(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_SETUP_TOOL_NAME,
    label: "Autoresearch Runtime Setup",
    description:
      "Plan, apply, or baseline a pi-autoresearch campaign/segment config without requiring a human slash-command wizard.",
    promptSnippet:
      "Use after autoplan to write a config receipt, optionally create autoresearch scripts, or run the first baseline.",
    parameters: asPiToolParameters(setupSchema),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        action?: "plan" | "apply" | "baseline";
        name: string;
        metricName: string;
        metricUnit?: string;
        direction: "lower" | "higher";
        metricThreshold?: number;
        benchmarkCommand?: string;
        checksCommand?: string | null;
        reconfigure?: boolean;
        description?: string;
        benchmarkScript?: string;
        checksScript?: string | null;
        allowOverwriteScripts?: boolean;
        postureCommand?: string;
        postureTimeoutSeconds?: number;
        timeoutSeconds?: number;
        checksTimeoutSeconds?: number;
      };
      assertReadProfileRejectsTool(options, AUTORESEARCH_SETUP_TOOL_NAME);
      const result = await executeAutoresearchSetup({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        action: request.action,
        name: request.name,
        metricName: request.metricName,
        metricUnit: request.metricUnit,
        direction: request.direction,
        metricThreshold: request.metricThreshold,
        benchmarkCommand: request.benchmarkCommand,
        checksCommand: request.checksCommand,
        reconfigure: request.reconfigure,
        description: request.description,
        benchmarkScript: request.benchmarkScript,
        checksScript: request.checksScript,
        allowOverwriteScripts: request.allowOverwriteScripts,
        postureCommand: request.postureCommand,
        postureTimeoutSeconds: request.postureTimeoutSeconds,
        timeoutSeconds: request.timeoutSeconds,
        checksTimeoutSeconds: request.checksTimeoutSeconds,
        signal,
      });
      return {
        content: [{ type: "text", text: formatAutoresearchSetupResult(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
    label: "Autoresearch Campaign Start",
    description:
      "Start from one bounded optimization objective and compose the pi-autoresearch supervised campaign front door: setup planning, optional governed setup packet, optional baseline, or optional bounded loop.",
    promptSnippet:
      "Use as the one-command/tool front door before lower-level autoresearch setup/run/loop calls when the operator gives a bounded optimization objective.",
    parameters: asPiToolParameters(campaignStartSchema),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        objective: string;
        setupMode?: "autoplan" | "prompt_vault_setup";
        runMode?: "plan_only" | "baseline" | "bounded_loop";
        maxIterations?: number;
        maxWallClockMinutes?: number;
        planner?: "heuristic" | "dspx_program";
        filesInScope?: string[];
        offLimits?: string[];
        constraints?: string[];
        benchmarkCommand?: string;
        checksCommand?: string | null;
        metricName?: string;
        metricUnit?: string;
        direction?: "lower" | "higher";
        metricThreshold?: number;
        materializeDspxIntent?: boolean;
        runDspxProgramGen?: boolean;
        dspxProgramGenTimeoutSeconds?: number;
        dspxIntentPath?: string;
        dspxOutdir?: string;
        dspxBehaviorPath?: string;
        description?: string;
        allowOverwriteScripts?: boolean;
        reconfigure?: boolean;
        timeoutSeconds?: number;
        checksTimeoutSeconds?: number;
        postureCommand?: string;
        postureTimeoutSeconds?: number;
        decisionGoal?: string;
        decisionConstraints?: string[];
        decisionFilesInScope?: string[];
        decisionOffLimits?: string[];
        decisionIdeasBacklog?: string[];
        decisionAsiNotes?: string[];
        decisionDeadEndMemory?: string[];
        stopOn?: Array<
          | "baseline"
          | "candidate"
          | "keep"
          | "discard"
          | "crash"
          | "checks_failed"
          | "blocked"
          | "rebaseline"
          | "finalize"
        >;
        peerMode?: "off" | "plan" | "launch_scout" | "launch_candidate" | "launch_fork";
        candidatePolicy?: {
          mode?: "worktree";
          keep?: "preserve_branch" | "plan_review_branch";
          discard?: "suggest_cleanup" | "delete_worktree_after_confirm";
          rewind?: "reset_worktree_to_base" | "recreate_worktree_from_base";
        };
        campaignGoalId?: string;
        campaignGoalIterationBudget?: number;
        campaignGoalWallClockMinutesBudget?: number;
        campaignGoalTokenBudget?: number;
        campaignGoalAutoContinue?: boolean;
      };
      assertReadProfileRejectsTool(options, AUTORESEARCH_CAMPAIGN_START_TOOL_NAME);
      const result = await executeAutoresearchCampaignStart({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        objective: request.objective,
        setupMode: request.setupMode,
        runMode: request.runMode,
        maxIterations: request.maxIterations,
        maxWallClockMinutes: request.maxWallClockMinutes,
        planner: request.planner,
        filesInScope: request.filesInScope,
        offLimits: request.offLimits,
        constraints: request.constraints,
        benchmarkCommand: request.benchmarkCommand,
        checksCommand: request.checksCommand,
        metricName: request.metricName,
        metricUnit: request.metricUnit,
        direction: request.direction,
        metricThreshold: request.metricThreshold,
        materializeDspxIntent: request.materializeDspxIntent,
        runDspxProgramGen: request.runDspxProgramGen,
        dspxProgramGenTimeoutSeconds: request.dspxProgramGenTimeoutSeconds,
        dspxIntentPath: request.dspxIntentPath,
        dspxOutdir: request.dspxOutdir,
        dspxBehaviorPath: request.dspxBehaviorPath,
        description: request.description,
        allowOverwriteScripts: request.allowOverwriteScripts,
        reconfigure: request.reconfigure,
        timeoutSeconds: request.timeoutSeconds,
        checksTimeoutSeconds: request.checksTimeoutSeconds,
        postureCommand: request.postureCommand,
        postureTimeoutSeconds: request.postureTimeoutSeconds,
        decisionRuntime:
          request.setupMode === "prompt_vault_setup" || request.decisionGoal
            ? resolveDecisionRuntime(ctx, signal, options)
            : undefined,
        decisionGoal: request.decisionGoal,
        decisionConstraints: request.decisionConstraints,
        decisionFilesInScope: request.decisionFilesInScope,
        decisionOffLimits: request.decisionOffLimits,
        decisionIdeasBacklog: request.decisionIdeasBacklog,
        decisionAsiNotes: request.decisionAsiNotes,
        decisionDeadEndMemory: request.decisionDeadEndMemory,
        model: ctx.model?.id,
        stopOn: request.stopOn,
        peerMode: request.peerMode,
        candidatePolicy: request.candidatePolicy,
        campaignGoalId: request.campaignGoalId,
        campaignGoalIterationBudget: request.campaignGoalIterationBudget,
        campaignGoalWallClockMinutesBudget: request.campaignGoalWallClockMinutesBudget,
        campaignGoalTokenBudget: request.campaignGoalTokenBudget,
        campaignGoalAutoContinue: request.campaignGoalAutoContinue,
        signal,
        onProgress: (event) => emitAutoresearchLoopUpdate(onUpdate, event),
      });
      return {
        content: [{ type: "text", text: formatAutoresearchCampaignStartResult(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
    label: "Autoresearch Runtime Peer Assist",
    description:
      "Plan one canonical visible peer assist lane for the current pi-autoresearch runtime without launching it.",
    promptSnippet:
      "Plan scout_peer_spawn, candidate_peer_spawn, or fork_peer_spawn from current autoresearch state without auto-spawning peers.",
    parameters: asPiToolParameters(peerAssistSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        lane?: "auto" | "none" | "scout" | "candidate" | "fork";
        objective?: string;
        targetFiles?: string[];
        offLimits?: string[];
        constraints?: string[];
        reportBack?: "intercom" | "manual" | "none";
        parentPeerTarget?: string;
      };
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
        action: "plan",
        allowedActions: ["plan"],
      });
      const result = buildAutoresearchPeerAssistPlan({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        lane: request.lane,
        objective: request.objective,
        targetFiles: request.targetFiles,
        offLimits: request.offLimits,
        constraints: request.constraints,
        reportBack: request.reportBack,
        parentPeerTarget: request.parentPeerTarget,
      });
      return {
        content: [{ type: "text", text: formatAutoresearchPeerAssistPlan(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_LOOP_TOOL_NAME,
    label: "Autoresearch Runtime Loop",
    description:
      "Execute a bounded pi-autoresearch loop with required iteration budget, receipt/ledger recording, optional posture gate, and optional governed next-hypothesis decisions.",
    promptSnippet:
      "Run a bounded autoresearch loop; requires maxIterations and stops on budget, control gates, posture gates, or governed decisions.",
    parameters: asPiToolParameters(loopSchema),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        goal: string;
        maxIterations: number;
        maxWallClockMinutes?: number;
        description?: string;
        name?: string;
        metricName?: string;
        metricUnit?: string;
        direction?: "lower" | "higher";
        metricThreshold?: number;
        benchmarkCommand?: string;
        checksCommand?: string | null;
        timeoutSeconds?: number;
        checksTimeoutSeconds?: number;
        reconfigure?: boolean;
        postureCommand?: string;
        postureTimeoutSeconds?: number;
        decisionGoal?: string;
        decisionConstraints?: string[];
        decisionFilesInScope?: string[];
        decisionOffLimits?: string[];
        decisionIdeasBacklog?: string[];
        decisionAsiNotes?: string[];
        decisionDeadEndMemory?: string[];
        stopOn?: Array<
          | "baseline"
          | "candidate"
          | "keep"
          | "discard"
          | "crash"
          | "checks_failed"
          | "blocked"
          | "rebaseline"
          | "finalize"
        >;
        peerMode?: "off" | "plan" | "launch_scout" | "launch_candidate" | "launch_fork";
        campaignGoalId?: string;
        campaignGoalIterationBudget?: number;
        campaignGoalWallClockMinutesBudget?: number;
        campaignGoalTokenBudget?: number;
        campaignGoalAutoContinue?: boolean;
      };
      assertReadProfileRejectsTool(options, AUTORESEARCH_LOOP_TOOL_NAME);
      const result = await executeAutoresearchLoop({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        goal: request.goal,
        maxIterations: request.maxIterations,
        maxWallClockMinutes: request.maxWallClockMinutes,
        description: request.description,
        name: request.name,
        metricName: request.metricName,
        metricUnit: request.metricUnit,
        direction: request.direction,
        metricThreshold: request.metricThreshold,
        benchmarkCommand: request.benchmarkCommand,
        checksCommand: request.checksCommand,
        timeoutSeconds: request.timeoutSeconds,
        checksTimeoutSeconds: request.checksTimeoutSeconds,
        reconfigure: request.reconfigure,
        postureCommand: request.postureCommand,
        postureTimeoutSeconds: request.postureTimeoutSeconds,
        decisionGoal: request.decisionGoal,
        decisionRuntime: request.decisionGoal
          ? resolveDecisionRuntime(ctx, signal, options)
          : undefined,
        decisionConstraints: request.decisionConstraints,
        decisionFilesInScope: request.decisionFilesInScope,
        decisionOffLimits: request.decisionOffLimits,
        decisionIdeasBacklog: request.decisionIdeasBacklog,
        decisionAsiNotes: request.decisionAsiNotes,
        decisionDeadEndMemory: request.decisionDeadEndMemory,
        model: ctx.model?.id,
        stopOn: request.stopOn,
        peerMode: request.peerMode,
        campaignGoalId: request.campaignGoalId,
        campaignGoalIterationBudget: request.campaignGoalIterationBudget,
        campaignGoalWallClockMinutesBudget: request.campaignGoalWallClockMinutesBudget,
        campaignGoalTokenBudget: request.campaignGoalTokenBudget,
        campaignGoalAutoContinue: request.campaignGoalAutoContinue,
        signal,
        onProgress: (event) => emitAutoresearchLoopUpdate(onUpdate, event),
      });
      return {
        content: [{ type: "text", text: formatAutoresearchLoopResult(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
    label: "Autoresearch Runtime Resume Apply",
    description:
      "Run an explicit foreground pi-autoresearch resume using exact resume_apply_plan keys, required budgets, and exact operator confirmation.",
    promptSnippet:
      "Apply a reviewed resume plan only in the foreground; requires exact segment/runtime keys, maxIterations, maxWallClockMinutes, and operatorConfirmation.",
    parameters: asPiToolParameters(resumeApplySchema),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        segmentKey: string;
        runtimeKey: string;
        maxIterations: number;
        maxWallClockMinutes: number;
        operatorConfirmation: string;
        description?: string;
        timeoutSeconds?: number;
        checksTimeoutSeconds?: number;
        postureCommand?: string;
        postureTimeoutSeconds?: number;
      };
      assertReadProfileRejectsTool(options, AUTORESEARCH_RESUME_APPLY_TOOL_NAME);
      const result = await executeAutoresearchResumeApply({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        segmentKey: request.segmentKey,
        runtimeKey: request.runtimeKey,
        maxIterations: request.maxIterations,
        maxWallClockMinutes: request.maxWallClockMinutes,
        operatorConfirmation: request.operatorConfirmation,
        description: request.description,
        timeoutSeconds: request.timeoutSeconds,
        checksTimeoutSeconds: request.checksTimeoutSeconds,
        postureCommand: request.postureCommand,
        postureTimeoutSeconds: request.postureTimeoutSeconds,
        signal,
        onProgress: (event) => emitAutoresearchLoopUpdate(onUpdate, event),
      });
      return {
        content: [{ type: "text", text: formatAutoresearchResumeApplyResult(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_SELF_HOSTING_TOOL_NAME,
    label: "Autoresearch Self-Hosting Run",
    description:
      "Inspect or run the bounded supervised self-hosting controller/candidate/evaluator flow, optionally stream progress while one bounded wave runs, and optionally plan/apply explicit promotion or rollback records.",
    promptSnippet:
      "Use the bounded supervised self-hosting surface to inspect artifacts, prepare the candidate worktree, run one controller/candidate/evaluator wave, stream progress with start_and_watch, or record explicit rollback after external controller rotation.",
    promptGuidelines: [
      "Use this tool for the bounded supervised self-hosting contract in packages/pi-autoresearch, not for hidden daemonized autonomy.",
      "Keep promotion external: this tool may plan/apply the explicit promotion record but still must not self-promote the package or mutate AK directly.",
      "Use action=run to materialize/reuse the candidate worktree, optionally execute one candidate subprocess, run locked evaluator suites, and classify applicability in one bounded call.",
      "Use action=start_and_watch when you want the same bounded wave plus live in-call progress updates without starting a background daemon or session.",
      "Use action=rollback only after an external controller rotation has already been recorded and later evidence requires explicit rollback truth.",
    ],
    parameters: asPiToolParameters(selfHostingSchema),
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      const request = params as {
        action?: "status" | "prepare_candidate" | "run" | "start_and_watch" | "rollback";
        cwd?: string;
        apply?: boolean;
        candidateCommand?: string[];
        candidateTimeoutMs?: number;
        suiteIds?: string[];
        suiteTimeoutMs?: number;
        primaryMetricBaseline?: number;
        primaryMetricCandidate?: number;
        variantTargetProfileImproved?: boolean;
        suiteRegressionPercents?: Array<{ suiteId: string; regressionPercent: number }>;
        approvedBy?: Array<"operator_review" | "orchestrator_supervision">;
        approvedAt?: number;
        evidenceRefs?: string[];
        promotedCandidateRef?: string;
        promotionStatus?: "planned" | "approved" | "rotated" | "superseded";
        promotionApply?: boolean;
        rollbackReason?: string;
        rolledBackAt?: number;
      };
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();
      const action = request.action ?? "status";
      assertReadProfileRejectsTool(options, AUTORESEARCH_SELF_HOSTING_TOOL_NAME);

      if (action === "prepare_candidate") {
        const result = prepareAutoresearchSelfHostingCandidateWorktree({
          cwd,
          apply: request.apply,
        });
        return {
          content: [{ type: "text", text: formatAutoresearchSelfHostingPrepareText(result) }],
          details: result,
        };
      }

      if (action === "rollback") {
        if (!request.rollbackReason) {
          throw new Error(
            "rollbackReason is required when action=rollback for autoresearch_self_hosting_run",
          );
        }

        const result = recordAutoresearchSelfHostingRollback({
          cwd,
          rollbackReason: request.rollbackReason,
          rolledBackAt: request.rolledBackAt,
          evidenceRefs: request.evidenceRefs,
          apply: request.apply,
        });
        return {
          content: [{ type: "text", text: formatAutoresearchSelfHostingRollbackText(result) }],
          details: result,
        };
      }

      if (action === "run" || action === "start_and_watch") {
        if (
          request.primaryMetricBaseline === undefined ||
          request.primaryMetricCandidate === undefined
        ) {
          throw new Error(
            `primaryMetricBaseline and primaryMetricCandidate are required when action=${action} for autoresearch_self_hosting_run`,
          );
        }

        const watchMode = action === "start_and_watch";
        emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "loading_artifacts", {
          action,
          cwd,
          message: `Loading supervised self-hosting artifacts from ${cwd}.`,
        });
        const artifacts = loadAutoresearchSelfHostingArtifacts(cwd);

        emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "prepare_candidate", {
          action,
          cwd,
          message: `Preparing candidate worktree ${artifacts.contract.candidate.worktreePath}.`,
        });
        const prepareCandidate = prepareAutoresearchSelfHostingCandidateWorktree({
          cwd,
          apply: true,
        });
        emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "prepare_candidate_complete", {
          action,
          cwd,
          registered: prepareCandidate.candidate.registered,
          candidateWorktree: prepareCandidate.candidate.worktreePath,
          message: `Candidate worktree ${prepareCandidate.candidate.worktreePath} is ${prepareCandidate.candidate.registered ? "ready" : "missing"}.`,
        });

        const candidateCommand = normalizeAutoresearchSelfHostingCommand(request.candidateCommand);
        if (candidateCommand) {
          emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "candidate_subprocess_start", {
            action,
            cwd,
            command: candidateCommand,
            message: `Running candidate subprocess ${formatAutoresearchSelfHostingCommandInvocation(candidateCommand)}.`,
          });
        }
        const candidateRun = candidateCommand
          ? executeAutoresearchSelfHostingCandidateSubprocess({
              cwd,
              command: candidateCommand,
              timeoutMs: request.candidateTimeoutMs,
            })
          : null;
        if (candidateRun) {
          emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "candidate_subprocess_complete", {
            action,
            cwd,
            command: candidateRun.command.command,
            exitCode: candidateRun.command.exitCode,
            timedOut: candidateRun.command.timedOut,
            signal: candidateRun.command.signal,
            message: `Candidate subprocess completed with ${formatAutoresearchSelfHostingCommandResult(candidateRun.command)}.`,
          });
        }
        const commandFailed =
          candidateRun !== null &&
          (candidateRun.command.exitCode !== 0 ||
            candidateRun.command.timedOut ||
            candidateRun.command.signal !== null);
        if (commandFailed) {
          const details = {
            action,
            cwd,
            prepareCandidate,
            candidateRun,
            suiteResults: [],
            classification: null,
            promotion: null,
            promotionError: null,
            nextStep: candidateRun?.nextStep ?? prepareCandidate.nextStep,
          };
          emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "wave_complete", {
            action,
            cwd,
            nextStep: details.nextStep,
            message: details.nextStep,
          });
          return {
            content: [{ type: "text", text: formatAutoresearchSelfHostingWaveText(details) }],
            details,
          };
        }

        const suiteIds =
          request.suiteIds ?? artifacts.evaluatorLock.suites.map((suite) => suite.id);
        const regressionPercents = normalizeAutoresearchSelfHostingRegressionPercents(
          request.suiteRegressionPercents,
        );
        const unexpectedRegressionSuiteIds = [...regressionPercents.keys()]
          .filter((suiteId) => !suiteIds.includes(suiteId))
          .sort();
        if (unexpectedRegressionSuiteIds.length > 0) {
          throw new Error(
            `suiteRegressionPercents included suite ids outside the executed set: ${unexpectedRegressionSuiteIds.join(", ")}`,
          );
        }

        const suiteResults = suiteIds.map((suiteId) => {
          emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "locked_suite_start", {
            action,
            cwd,
            suiteId,
            message: `Running locked evaluator suite ${suiteId}.`,
          });
          const result = executeAutoresearchSelfHostingEvaluatorSuite({
            cwd,
            suiteId,
            timeoutMs: request.suiteTimeoutMs,
          });
          emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "locked_suite_complete", {
            action,
            cwd,
            suiteId,
            exitCode: result.command.exitCode,
            timedOut: result.command.timedOut,
            signal: result.command.signal,
            message: `Locked evaluator suite ${suiteId} completed with ${formatAutoresearchSelfHostingCommandResult(result.command)}.`,
          });
          return result;
        });

        emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "classify_applicability", {
          action,
          cwd,
          message: "Classifying supervised self-hosting applicability.",
        });
        const classification = classifyAutoresearchSelfHostingApplicability({
          cwd,
          suiteOutcomes: suiteResults.map((result) => ({
            suiteId: result.resolvedSuite.suiteId,
            passed: result.command.exitCode === 0,
            regressionPercent: regressionPercents.get(result.resolvedSuite.suiteId),
          })),
          primaryMetric: {
            baseline: request.primaryMetricBaseline,
            candidate: request.primaryMetricCandidate,
          },
          variantTargetProfileImproved: request.variantTargetProfileImproved,
        });
        emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "classification_complete", {
          action,
          cwd,
          outcome: classification.outcome,
          blockingReasons: classification.blockingReasons,
          message: `Applicability classification produced ${classification.outcome}.`,
        });

        const promotionRequested =
          request.promotionApply === true ||
          request.approvedBy !== undefined ||
          request.approvedAt !== undefined ||
          request.evidenceRefs !== undefined ||
          request.promotedCandidateRef !== undefined ||
          request.promotionStatus !== undefined;
        let promotion: ReturnType<typeof prepareAutoresearchSelfHostingPromotionRecord> | null =
          null;
        let promotionError: string | null = null;
        if (promotionRequested) {
          emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "promotion_record_start", {
            action,
            cwd,
            message: "Preparing explicit self-hosting promotion record.",
          });
          try {
            promotion = prepareAutoresearchSelfHostingPromotionRecord({
              cwd,
              classification,
              approvedBy: request.approvedBy,
              approvedAt: request.approvedAt,
              evidenceRefs: request.evidenceRefs,
              promotedCandidateRef: request.promotedCandidateRef,
              status: request.promotionStatus,
              apply: request.promotionApply,
            });
            emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "promotion_record_complete", {
              action,
              cwd,
              status: promotion.record.status,
              path: promotion.promotionRecordPath,
              message: `Promotion record is now ${promotion.record.status}.`,
            });
          } catch (error) {
            promotionError = error instanceof Error ? error.message : String(error);
            emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "promotion_record_failed", {
              action,
              cwd,
              error: promotionError,
              message: `Promotion record failed: ${promotionError}`,
            });
          }
        }

        const details = {
          action,
          cwd,
          prepareCandidate,
          candidateRun,
          suiteResults,
          classification,
          promotion,
          promotionError,
          nextStep: promotion?.nextStep ?? promotionError ?? classification.nextStep,
        };
        emitAutoresearchSelfHostingUpdate(onUpdate, watchMode, "wave_complete", {
          action,
          cwd,
          nextStep: details.nextStep,
          message: details.nextStep,
        });
        return {
          content: [{ type: "text", text: formatAutoresearchSelfHostingWaveText(details) }],
          details,
        };
      }

      const artifacts = loadAutoresearchSelfHostingArtifacts(cwd);
      const prepareCandidate = prepareAutoresearchSelfHostingCandidateWorktree({ cwd });
      const scope = prepareCandidate.candidate.registered
        ? inspectAutoresearchSelfHostingCandidateScope(cwd)
        : null;
      const promotionRecordPath = resolveAutoresearchSelfHostingPromotionRecordPath(
        cwd,
        artifacts.contract.promotion.promotionRecordPath,
      );
      const promotionRecord = existsSync(promotionRecordPath)
        ? loadAutoresearchSelfHostingPromotionRecord(cwd)
        : null;
      const details = {
        action,
        cwd,
        artifacts,
        prepareCandidate,
        scope,
        promotionRecordPath,
        promotionRecord,
      };
      return {
        content: [{ type: "text", text: formatAutoresearchSelfHostingStatusText(details) }],
        details,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
    label: "Autoresearch llama.cpp Campaign Control",
    description:
      "Public consumer/control seam for one manifest-driven llama.cpp campaign: inspect current control posture, optionally compose exact-task AK-binding context, and plan/apply exactly one truthful next step without raw stage/build inputs.",
    promptSnippet:
      "Use this tool when the user wants the bounded public campaign-control surface for a manifest-driven llama.cpp campaign rather than the lower-level technical helper actions.",
    promptGuidelines: [
      "Use this tool when the caller wants current campaign-control status or one-step advancement without choosing raw stage/build inputs.",
      "Use taskId only when the caller already has an exact AK task id and wants optional AK-ready completion context; do not guess tasks.",
      "Use action=advance with apply=true only when the caller clearly wants exactly one next step executed.",
      "Keep this surface below whole-campaign execution, fork automation, and direct AK mutation.",
    ],
    parameters: asPiToolParameters(campaignControlSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        action?: "status" | "advance";
        cwd?: string;
        manifestPath: string;
        taskId?: number;
        apply?: boolean;
        persistProjection?: boolean;
      };
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();
      const action = request.action ?? "status";
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_LLAMACPP_CAMPAIGN_CONTROL_TOOL_NAME,
        action,
        allowedActions: ["status"],
        apply: request.apply,
        persistProjection: request.persistProjection,
      });
      const updatedAt = Date.now();

      if (action === "status" && request.apply === true) {
        throw new Error(
          "apply=true is only supported with action=advance for autoresearch_llamacpp_campaign_control",
        );
      }

      const result =
        action === "advance"
          ? executeLlamacppCampaignControl({
              cwd,
              manifestPath: request.manifestPath,
              taskId: request.taskId,
              apply: request.apply,
              updatedAt,
            })
          : inspectLlamacppCampaignControl({
              cwd,
              manifestPath: request.manifestPath,
              taskId: request.taskId,
              updatedAt,
            });
      const persistProjection = shouldPersistLlamacppProjection(request);
      const persistedProjection = persistProjection
        ? persistDerivedLlamacppCampaignProjection({
            cwd,
            projection: result.projection,
          })
        : null;
      const projection = persistedProjection?.projection ?? result.projection;
      const text = [
        formatLlamacppCampaignControlResult(result),
        "",
        ...formatLlamacppProjectionLines({
          projectionPath: persistedProjection?.path ?? null,
          projection,
          persisted: persistProjection,
        }),
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: {
          ...result,
          projectionPath: persistedProjection?.path ?? null,
          projection,
        },
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
    label: "Autoresearch llama.cpp Campaign",
    description:
      "Load a typed llama.cpp benchmark campaign manifest, emit the exact 41/42/43 branch-lane matrix, plan/apply fork preparation, plan/apply one exact stage invocation, or derive one exact AK-ready binding snapshot for an anchored task. This remains the technical manifest-helper surface below the public autoresearch_llamacpp_campaign_control seam.",
    promptSnippet:
      "Use this tool when the user wants a deterministic branch/benchmark matrix, fork preparation plan, one exact 41/42/43 stage binding, or one exact AK-ready milestone snapshot for a brownfield llama.cpp campaign. This is the lower-level technical helper seam, not the dedicated public control tool.",
    promptGuidelines: [
      "Use autoresearch_llamacpp_campaign_control instead when the caller wants the bounded public control/status seam without raw stage/build inputs.",
      "Use this tool instead of freeform planning when the user names branches, cherry-picks, lanes, or the 41/42/43 workflow.",
      "Prefer action=plan_matrix before action=execute_stage so branch/lane intent is explicit before script binding.",
      "Use action=prepare_fork with apply=true only when the user clearly wants the fork workspace created or switched.",
      "Use action=execute_stage for one exact build/stage, not as a whole-campaign runner.",
      "Use action=build_ak_binding only when the user already has an exact AK task id and wants a compact AK-ready snapshot rather than an AK mutation.",
      "Use action=advance_campaign to derive or execute exactly one truthful next stage step; it is still a technical helper action rather than the public autoresearch_llamacpp_campaign_control surface or a whole-campaign runner.",
    ],
    parameters: asPiToolParameters(campaignSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        action?:
          | "plan_matrix"
          | "prepare_fork"
          | "execute_stage"
          | "build_ak_binding"
          | "advance_campaign";
        cwd?: string;
        manifestPath: string;
        stage?: "41" | "42" | "43";
        buildId?: string;
        apply?: boolean;
        taskId?: number;
        persistProjection?: boolean;
      };
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();
      const action = request.action ?? "plan_matrix";
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
        action,
        allowedActions: [
          "plan_matrix",
          "prepare_fork",
          "execute_stage",
          "build_ak_binding",
          "advance_campaign",
        ],
        apply: request.apply,
        persistProjection: request.persistProjection,
      });
      const updatedAt = Date.now();
      const result =
        action === "prepare_fork"
          ? prepareLlamacppCampaignFork({
              cwd,
              manifestPath: request.manifestPath,
              apply: request.apply,
            })
          : action === "execute_stage"
            ? executeLlamacppCampaignStage({
                cwd,
                manifestPath: request.manifestPath,
                stage: request.stage ?? "41",
                buildId: request.buildId ?? "",
                apply: request.apply,
              })
            : action === "build_ak_binding"
              ? (() => {
                  if (request.taskId === undefined) {
                    throw new Error(
                      "taskId is required when action=build_ak_binding for autoresearch_llamacpp_campaign",
                    );
                  }
                  const binding = buildLlamacppCampaignAkBinding({
                    cwd,
                    manifestPath: request.manifestPath,
                    taskId: request.taskId,
                    updatedAt,
                  });
                  return {
                    action: "build_ak_binding" as const,
                    binding,
                    details: buildLlamacppCampaignAkBindingDetails(binding),
                    nextAction:
                      binding.lifecycle.action === "complete_task_candidate"
                        ? `A caller above the package may now evaluate whether AK task ${binding.taskId} should be completed; this helper does not mutate AK directly.`
                        : `Reuse or record AK evidence for task ${binding.taskId}; terminal stage ${binding.manifest.terminalStage} is not fully materialized yet.`,
                  };
                })()
              : action === "advance_campaign"
                ? advanceLlamacppCampaign({
                    cwd,
                    manifestPath: request.manifestPath,
                    apply: request.apply,
                    updatedAt,
                  })
                : planLlamacppCampaignMatrix({
                    cwd,
                    manifestPath: request.manifestPath,
                  });
      const persistProjection = shouldPersistLlamacppProjection(request);
      const persistedProjection = persistProjection
        ? persistLlamacppCampaignProjection({
            cwd,
            manifestPath: request.manifestPath,
            updatedAt,
          })
        : null;
      const projection =
        persistedProjection?.projection ??
        buildLlamacppCampaignProjection({
          cwd,
          manifestPath: request.manifestPath,
          updatedAt,
        });
      const text = [
        formatLlamacppCampaignResult(result),
        "",
        ...formatLlamacppProjectionLines({
          projectionPath: persistedProjection?.path ?? null,
          projection,
          persisted: persistProjection,
        }),
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: {
          ...result,
          projectionPath: persistedProjection?.path ?? null,
          projection,
        },
      };
    },
  });
}

export default function piAutoresearchExtension(pi: ExtensionAPI): void {
  registerPiAutoresearchExtension(pi);
}

function emitAutoresearchLoopUpdate(onUpdate: unknown, event: AutoresearchLoopProgressEvent): void {
  if (typeof onUpdate !== "function") {
    return;
  }

  const status = buildAutoresearchRuntimeStatus(event.cwd);
  const progressCard = [
    `# PI-AUTORESEARCH LIVE UPDATE — ${event.phase}`,
    "",
    event.message,
    "",
    `- elapsed: ${event.elapsedSeconds.toFixed(2)}s`,
    `- iteration: ${event.iteration ?? "-"}/${event.maxIterations}`,
    `- machine state: ${status.runtimeProjection.state}`,
    `- empirical posture: ${status.empiricalPosture.classification}`,
    `- promotion ready: ${status.empiricalPosture.promotionReady ? "yes" : "no"}`,
    `- best metric: ${status.currentSegment.bestMetric ?? "n/a"}${status.currentSegment.metricUnit}`,
    `- confidence: ${status.currentSegment.confidence ?? "n/a"}`,
    `- next: ${status.empiricalPosture.recommendedNextAction}`,
  ].join("\n");

  (
    onUpdate as (update: {
      content: Array<{ type: "text"; text: string }>;
      details: Record<string, unknown>;
    }) => void
  )({
    content: [{ type: "text", text: progressCard }],
    details: {
      tool: AUTORESEARCH_LOOP_TOOL_NAME,
      dashboard: formatAutoresearchDashboard(status),
      ...event,
    },
  });
}
