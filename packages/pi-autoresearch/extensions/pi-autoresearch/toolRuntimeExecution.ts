import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AUTORESEARCH_AUTOPLAN_TOOL_NAME,
  AUTORESEARCH_CAMPAIGN_START_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  buildAutoresearchAutoplan,
  executeAutoresearchCampaignStart,
  executeAutoresearchRun,
  executeAutoresearchSetup,
  formatAutoresearchAutoplanResult,
  formatAutoresearchCampaignStartResult,
  formatAutoresearchRunResult,
  formatAutoresearchSetupResult,
} from "../../src/core/runtime.ts";
import type { PiAutoresearchExtensionOptions } from "./extensionOptions.ts";
import { resolveDecisionRuntime } from "./extensionOptions.ts";
import { emitAutoresearchLoopUpdate } from "./loopProgressUpdate.ts";
import { assertReadProfileRejectsTool } from "./readProfile.ts";
import {
  asPiToolParameters,
  autoplanSchema,
  campaignStartSchema,
  runSchema,
  setupSchema,
} from "./schemas.ts";

export function registerAutoresearchRuntimeExecutionTools(
  pi: ExtensionAPI,
  options: PiAutoresearchExtensionOptions,
): void {
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
}
