// summary: Registers peer-assist planning, bounded loop execution, and explicit foreground resume tools.
// read_when:
//   - Reviewing autoresearch loop, peer-assist, or resume tool registration and execution boundaries.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
} from "./eagerContract.ts";
import type { PiAutoresearchExtensionOptions } from "./extensionOptions.ts";
import { resolveDecisionRuntime } from "./extensionOptions.ts";
import type { AutoresearchLazyModules } from "./lazyModules.ts";
import { emitAutoresearchLoopUpdate } from "./loopProgressUpdate.ts";
import { assertReadProfileAllowsAction, assertReadProfileRejectsTool } from "./readProfile.ts";
import { asPiToolParameters, loopSchema, peerAssistSchema, resumeApplySchema } from "./schemas.ts";
import type { AutoresearchSessionEffects } from "./sessionEffects.ts";

export function registerAutoresearchLoopResumeTools(
  pi: ExtensionAPI,
  options: PiAutoresearchExtensionOptions,
  modules: AutoresearchLazyModules,
  getSessionEffects: () => AutoresearchSessionEffects,
): void {
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
      const { buildAutoresearchPeerAssistPlan, formatAutoresearchPeerAssistPlan } =
        await modules.runtime();
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
      const effects = getSessionEffects();
      const runtimeModule = await modules.runtime();
      const { executeAutoresearchLoop, formatAutoresearchLoopResult } = runtimeModule;
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
          ? resolveDecisionRuntime(ctx, signal, options, modules)
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
        onProgress: (event) => emitAutoresearchLoopUpdate(onUpdate, event, runtimeModule, effects),
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
      const effects = getSessionEffects();
      const runtimeModule = await modules.runtime();
      const { executeAutoresearchResumeApply, formatAutoresearchResumeApplyResult } = runtimeModule;
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
        onProgress: (event) => emitAutoresearchLoopUpdate(onUpdate, event, runtimeModule, effects),
      });
      return {
        content: [{ type: "text", text: formatAutoresearchResumeApplyResult(result) }],
        details: result,
      };
    },
  });
}
