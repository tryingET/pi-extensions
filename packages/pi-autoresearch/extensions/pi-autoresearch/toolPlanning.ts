// summary: Registers read-only candidate binding, lifecycle decision, and vLLM campaign planning tools.
// read_when:
//   - Inspecting autoresearch candidate planning or workstation vLLM campaign tool surfaces.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME,
} from "./eagerContract.ts";
import type { PiAutoresearchExtensionOptions } from "./extensionOptions.ts";
import type { AutoresearchLazyModules } from "./lazyModules.ts";
import { assertReadProfileAllowsAction } from "./readProfile.ts";
import {
  asPiToolParameters,
  candidateBindSchema,
  candidateDecisionSchema,
  vllmCampaignSchema,
} from "./schemas.ts";

export function registerAutoresearchPlanningTools(
  pi: ExtensionAPI,
  options: PiAutoresearchExtensionOptions,
  modules: AutoresearchLazyModules,
): void {
  pi.registerTool({
    name: AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
    label: "Autoresearch Candidate Bind",
    description:
      "Inspect a controller-verified candidate worktree/branch and prepare the exact pi-autoresearch measurement call without running or mutating anything.",
    promptSnippet:
      "Plan candidate intake for pi-autoresearch. Read-only: inspect candidate worktree/branch/base ref, summarize changed files/diff posture, and return the exact autoresearch_runtime_run call needed to bind and measure the candidate.",
    parameters: asPiToolParameters(candidateBindSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        action?: "status" | "plan_run";
        candidateSource?: "candidate_peer_spawn" | "manual";
        candidateWorktree?: string;
        candidateBranch?: string;
        candidateBaseRef?: string;
        description?: string;
      };
      const action = request.action ?? "status";
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
        action,
        allowedActions: ["status", "plan_run"],
      });
      const { buildAutoresearchCandidateBindPlan, formatAutoresearchCandidateBindPlan } =
        await modules.runtime();
      const result = buildAutoresearchCandidateBindPlan({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        action: request.action,
        candidateSource: request.candidateSource,
        candidateWorktree: request.candidateWorktree,
        candidateBranch: request.candidateBranch,
        candidateBaseRef: request.candidateBaseRef,
        description: request.description,
      });
      return {
        content: [{ type: "text", text: formatAutoresearchCandidateBindPlan(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
    label: "Autoresearch Candidate Decision",
    description:
      "Plan current pi-autoresearch candidate keep/discard/rewind decisions from runtime status, closeout, and candidate-result evidence without mutating worktrees or promoting.",
    promptSnippet:
      "Inspect or plan the current pi-autoresearch candidate lifecycle decision. Read-only: status, plan_keep, plan_discard, or plan_rewind. It consumes runtime receipts/closeout/candidate-result posture and returns exact next calls/commands without applying them.",
    parameters: asPiToolParameters(candidateDecisionSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        action?: "status" | "plan_keep" | "plan_discard" | "plan_rewind";
        cwd?: string;
        candidatePolicy?: {
          mode?: "worktree";
          keep?: "preserve_branch" | "plan_review_branch";
          discard?: "suggest_cleanup" | "delete_worktree_after_confirm";
          rewind?: "reset_worktree_to_base" | "recreate_worktree_from_base";
        };
      };
      const action = request.action ?? "status";
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
        action,
        allowedActions: ["status", "plan_keep", "plan_discard", "plan_rewind"],
      });
      const {
        buildAutoresearchCandidateDecisionWorkbench,
        formatAutoresearchCandidateDecisionWorkbench,
      } = await modules.runtime();
      const result = buildAutoresearchCandidateDecisionWorkbench({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        action: request.action,
        candidatePolicy: request.candidatePolicy,
      });
      return {
        content: [{ type: "text", text: formatAutoresearchCandidateDecisionWorkbench(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME,
    label: "vLLM Autoresearch Campaign Cockpit",
    description:
      "Inspect and plan a bounded, multi-matrix workstation vLLM autoresearch campaign for local model speed optimization without hidden daemonization or direct service promotion.",
    promptSnippet:
      "Use the vLLM autoresearch campaign cockpit to inspect workstation GPU/lane/benchmark readiness, plan matrix axes, produce exact bounded autoresearch next calls, and generate a fresh-session handoff prompt. This surface is plan/read-only; execution still happens through bounded autoresearch/workstation owner seams.",
    parameters: asPiToolParameters(vllmCampaignSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        action?: "status" | "plan" | "run_segment_plan" | "handoff_prompt";
        cwd?: string;
        modelPath?: string;
        hardware?: string;
        knowledgeBase?: string;
        objective?: string;
        maxWallClockMinutes?: number;
        maxIterations?: number;
        maxCellsPerSegment?: number;
        targets?: string[];
        matrixAxes?: Record<string, string[]>;
        benchmarkProfile?: "smoke" | "longcot" | "throughput";
      };
      const action = request.action ?? "status";
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME,
        action,
        allowedActions: ["status", "plan", "run_segment_plan", "handoff_prompt"],
      });
      const { buildVllmAutoresearchCampaignPlan, formatVllmAutoresearchCampaignPlan } =
        await modules.vllm();
      const result = buildVllmAutoresearchCampaignPlan({
        ...request,
        action,
        cwd: request.cwd ?? ctx.cwd,
      });
      return {
        content: [{ type: "text", text: formatVllmAutoresearchCampaignPlan(result) }],
        details: result,
      };
    },
  });
}
