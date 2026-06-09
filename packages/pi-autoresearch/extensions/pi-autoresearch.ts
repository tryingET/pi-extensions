import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  type AutoresearchAutoContinuationDecision,
  buildAutoresearchAutoContinuationSessionGateFromEnv,
  formatAutoresearchAutoContinuationDecision,
} from "../src/core/autoContinuation.ts";
import {
  type AutoresearchDecisionRuntime,
  createAutoresearchDecisionRuntime,
} from "../src/core/decisions.ts";
import {
  executeAutoresearchFinalization,
  formatAutoresearchFinalizationResult,
} from "../src/core/finalize.ts";
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
  AUTORESEARCH_CANDIDATE_BIND_TOOL_NAME,
  AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME,
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_LOOP_TOOL_NAME,
  AUTORESEARCH_PEER_ASSIST_TOOL_NAME,
  AUTORESEARCH_RESUME_APPLY_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_SETUP_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  type AutoresearchLoopProgressEvent,
  applyAutoresearchCandidateInventoryCleanup,
  buildAutoresearchAdapterContractCatalog,
  buildAutoresearchAkEvidencePacket,
  buildAutoresearchAutoplan,
  buildAutoresearchCandidateBindPlan,
  buildAutoresearchCandidateDecisionWorkbench,
  buildAutoresearchCandidateInventoryCleanupPlan,
  buildAutoresearchCandidateResultPacket,
  buildAutoresearchKnowledgeExportPacket,
  buildAutoresearchOracleEvidencePacket,
  buildAutoresearchPeerAssistPlan,
  buildAutoresearchResumeApplyPlan,
  buildAutoresearchResumePlan,
  buildAutoresearchRuntimeStatus,
  buildAutoresearchSegmentCloseout,
  executeAutoresearchCampaignStart,
  executeAutoresearchLoop,
  executeAutoresearchResumeApply,
  executeAutoresearchRun,
  executeAutoresearchSetup,
  exportAutoresearchDashboardHtml,
  formatAutoresearchAdapterContractCatalog,
  formatAutoresearchAdapterPacketValidationResult,
  formatAutoresearchAkEvidencePacket,
  formatAutoresearchAutoplanResult,
  formatAutoresearchCampaignGoalStatus,
  formatAutoresearchCampaignStartResult,
  formatAutoresearchCandidateBindPlan,
  formatAutoresearchCandidateDecisionWorkbench,
  formatAutoresearchCandidateInventoryCleanupPlan,
  formatAutoresearchCandidateResultExportResult,
  formatAutoresearchCandidateResultPacket,
  formatAutoresearchControlResult,
  formatAutoresearchDashboard,
  formatAutoresearchDecisionResult,
  formatAutoresearchKnowledgeExportPacket,
  formatAutoresearchLearningExportResult,
  formatAutoresearchLoopResult,
  formatAutoresearchOracleEvidenceExportResult,
  formatAutoresearchOracleEvidencePacket,
  formatAutoresearchPeerAssistPlan,
  formatAutoresearchResumeApplyPlan,
  formatAutoresearchResumeApplyResult,
  formatAutoresearchResumePlan,
  formatAutoresearchRunResult,
  formatAutoresearchSegmentCloseout,
  formatAutoresearchSetupResult,
  formatAutoresearchStatusText,
  inspectAutoresearchRuntimeControl,
  requestAutoresearchFinalizeDecision,
  requestAutoresearchSetupDecision,
  setAutoresearchCampaignGoalControl,
  setAutoresearchRuntimeControl,
  validateAutoresearchAdapterPacket,
  writeAutoresearchCandidateResultPacket,
  writeAutoresearchKnowledgeExportPacket,
  writeAutoresearchOracleEvidencePacket,
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
import {
  AUTORESEARCH_VLLM_CAMPAIGN_TOOL_NAME,
  buildVllmAutoresearchCampaignPlan,
  formatVllmAutoresearchCampaignPlan,
} from "../src/core/vllmCampaignCockpit.ts";

type AutoresearchTriggerCandidate = {
  id: string;
  label: string;
  detail: string;
  runMode: AutoresearchTriggerRunMode;
  setupMode: AutoresearchTriggerSetupMode;
  maxIterations: number;
};

type AutoresearchCandidateDecisionTriggerCandidate = {
  id: string;
  label: string;
  detail: string;
  action: AutoresearchCandidateDecisionTriggerAction;
};

type AutoresearchCandidateBindTriggerCandidate = {
  id: string;
  label: string;
  detail: string;
};

type AutoresearchTriggerParsedInput = {
  objective: string;
  query: string;
  raw: string;
};

type AutoresearchCandidateDecisionTriggerParsedInput = {
  query: string;
  raw: string;
  directAction: AutoresearchCandidateDecisionTriggerAction | null;
};

type AutoresearchCandidateBindTriggerParsedInput = {
  mode: AutoresearchCandidateBindTriggerMode;
  candidateWorktree: string;
  query: string;
  raw: string;
};

type AutoresearchTriggerSurface = {
  registerPickerInteraction?: (config: Record<string, unknown>) => { unregister?: () => void };
};

type AutoresearchTriggerApi = {
  setText?: (text: string) => void;
  notify?: (message: string, level?: string) => void;
};

type AutoresearchTriggerContext = {
  cwd?: string;
};

type AutoresearchWidgetUi = {
  setWidget?: (id: string, widget: unknown, options?: unknown) => void;
  notify?: (message: string, level?: "info" | "warning" | "error") => void;
  editor?: (title: string, text: string) => Promise<void> | void;
  custom?: <T>(factory: AutoresearchCustomFactory<T>, options?: unknown) => Promise<T>;
};

type AutoresearchWidgetContext = {
  cwd: string;
  hasUI: boolean;
  ui: AutoresearchWidgetUi;
};

type AutoresearchWidgetTui = {
  requestRender?: () => void;
};

type AutoresearchCustomFactory<T> = (
  tui: AutoresearchWidgetTui,
  theme: unknown,
  keybindings: unknown,
  done: (result: T) => void,
) => unknown;

type AutoresearchOverlayComponent = {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
  dispose?: () => void;
};

type AutoresearchCandidateDecisionReviewComponent = AutoresearchOverlayComponent;

type AutoresearchBrowserOpenCommand = {
  command: string;
  args: string[];
};

const AUTORESEARCH_LIVE_TRIGGER_ID = "autoresearch-campaign-start-picker";
const AUTORESEARCH_CANDIDATE_BIND_TRIGGER_ID = "autoresearch-candidate-bind-picker";
const AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_ID = "autoresearch-candidate-decision-picker";
const AUTORESEARCH_WIDGET_ID = "pi-autoresearch-status-widget";
const AUTORESEARCH_TRIGGER_CANDIDATES: AutoresearchTriggerCandidate[] = [
  {
    id: "plan-only",
    label: "Plan only",
    detail: "Review metric contract, scope, warnings, and next exact call before execution.",
    runMode: "plan_only",
    setupMode: "autoplan",
    maxIterations: 3,
  },
  {
    id: "governed-setup-plan",
    label: "Governed setup plan",
    detail: "Request the package-owned Prompt Vault setup decision, then stop for review.",
    runMode: "plan_only",
    setupMode: "prompt_vault_setup",
    maxIterations: 3,
  },
  {
    id: "baseline",
    label: "Run baseline",
    detail: "Apply setup and run the first baseline through explicit runMode=baseline.",
    runMode: "baseline",
    setupMode: "autoplan",
    maxIterations: 3,
  },
  {
    id: "bounded-loop",
    label: "Bounded loop",
    detail: "Enter the supervised loop with an explicit three-iteration budget.",
    runMode: "bounded_loop",
    setupMode: "autoplan",
    maxIterations: 3,
  },
];
const AUTORESEARCH_CANDIDATE_BIND_TRIGGER_CANDIDATES: AutoresearchCandidateBindTriggerCandidate[] =
  [
    {
      id: "plan-run",
      label: "Plan candidate measurement",
      detail:
        "Inspect the selected worktree/branch and insert autoresearch_candidate_bind; no run or mutation is applied.",
    },
  ];
const AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES: AutoresearchCandidateDecisionTriggerCandidate[] =
  [
    {
      id: "status",
      label: "Candidate status",
      detail:
        "Inspect current candidate posture and recommended lifecycle decision without planning a worktree command.",
      action: "status",
    },
    {
      id: "keep",
      label: "Plan keep",
      detail:
        "Plan a safe keep/review path; no merge, branch materialization, evidence write, or promotion is automatic.",
      action: "plan_keep",
    },
    {
      id: "discard",
      label: "Plan discard",
      detail:
        "Plan cleanup guidance only; worktree removal and branch deletion require explicit operator confirmation.",
      action: "plan_discard",
    },
    {
      id: "rewind",
      label: "Plan rewind",
      detail:
        "Plan reset/recreate guidance only; no destructive worktree command is applied by pi-autoresearch.",
      action: "plan_rewind",
    },
  ];

import type {
  AutoresearchCandidateBindTriggerMode,
  AutoresearchCandidateDecisionReviewParsedInput,
  AutoresearchCandidateDecisionTriggerAction,
  AutoresearchTriggerRunMode,
  AutoresearchTriggerSetupMode,
} from "./pi-autoresearch/commandText.ts";
import {
  buildAutoresearchCampaignStartEditorCall,
  buildAutoresearchCampaignStartToolCall,
  buildAutoresearchLearningExportEditorCall,
  buildAutoresearchResumeApplyEditorCall,
  extractAutoresearchResumeEditorCall,
  formatAutoresearchCommandNotification,
  parseAutoresearchLearningHandoffCommand,
  parseAutoresearchResumeCommand,
  parseAutoresearchRunObjectiveCommand,
  transformAutoresearchDollarInput,
} from "./pi-autoresearch/commandText.ts";
import {
  buildAutoresearchCandidateBindEditorCall,
  buildAutoresearchCandidateBindOrMeasureEditorCall,
  buildAutoresearchCandidateDecisionEditorCall,
  buildAutoresearchCandidateIntegrationEditorText,
  buildAutoresearchCandidateMeasureEditorCall,
  buildAutoresearchCandidateNextEditorCall,
  buildAutoresearchOpenCandidateReviewEditorText,
  parseAutoresearchCandidateBindCommand,
  parseAutoresearchCandidateDecisionCommand,
  parseAutoresearchCandidateDecisionReviewCommand,
  parseAutoresearchCandidateIntegrationCommand,
  parseAutoresearchCandidateMeasureCommand,
  parseAutoresearchCandidateNextCommand,
  parseAutoresearchOpenCandidateReviewCommand,
} from "./pi-autoresearch/commandTextCandidates.ts";
import {
  asPiToolParameters,
  autoplanSchema,
  campaignControlSchema,
  campaignSchema,
  campaignStartSchema,
  candidateBindSchema,
  candidateDecisionSchema,
  controlSchema,
  finalizeSchema,
  loopSchema,
  peerAssistSchema,
  resumeApplySchema,
  runSchema,
  selfHostingSchema,
  setupSchema,
  statusSchema,
  vllmCampaignSchema,
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

export type AutoresearchExtensionEffectProfile = "unrestricted" | "read";

export interface PiAutoresearchExtensionOptions {
  createDecisionRuntime?: (
    ctx: ExtensionContext,
    signal: AbortSignal | undefined,
  ) => AutoresearchDecisionRuntime;
  effectProfile?: AutoresearchExtensionEffectProfile;
  triggerSurface?: AutoresearchTriggerSurface | null;
}

function assertReadProfileAllowsAction(
  options: PiAutoresearchExtensionOptions,
  input: {
    toolName: string;
    action: string;
    allowedActions: readonly string[];
    apply?: boolean;
    persistProjection?: boolean;
  },
): void {
  if (options.effectProfile !== "read") return;
  if (input.persistProjection === true) {
    throw new Error(
      `${input.toolName} action=${input.action} persistProjection=true is unavailable in the autoresearch read profile; activate the mutating profile for explicit projection writes.`,
    );
  }
  if (input.apply === true) {
    throw new Error(
      `${input.toolName} action=${input.action} apply=true is unavailable in the autoresearch read profile; activate the mutating profile for local writes or execution.`,
    );
  }
  if (!input.allowedActions.includes(input.action)) {
    throw new Error(
      `${input.toolName} action=${input.action} is unavailable in the autoresearch read profile; allowed read actions: ${input.allowedActions.join(", ")}.`,
    );
  }
}

function assertReadProfileRejectsTool(
  options: PiAutoresearchExtensionOptions,
  toolName: string,
): void {
  if (options.effectProfile !== "read") return;
  throw new Error(
    `${toolName} is unavailable in the autoresearch read profile; activate the mutating profile for local writes or execution.`,
  );
}

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

  pi.registerTool({
    name: AUTORESEARCH_STATUS_TOOL_NAME,
    label: "Autoresearch Runtime Status",
    description:
      "Inspect the current pi-autoresearch bounded runtime, build package-local closeout/evidence/Oracle-ready/learning/candidate-result packets, export Oracle-ready evidence JSON, learning JSON, or candidate-result JSON for owner-routed handoff, list adapter packet contracts, validate adapter packets, or request a governed setup/finalize packet through the existing runtime surface.",
    promptSnippet:
      "Inspect the current pi-autoresearch bounded runtime, machine projection, receipt log, event ledger, optionally build a segment closeout, Oracle-ready evidence packet, local Oracle-ready evidence JSON export for DSPx preflight, exact-task AK evidence packet, adapter-ready learning packet, local learning JSON export for owner-routed KES handoff, candidate-result packet/export, adapter contract catalog, or adapter packet validation, and optionally request a governed setup/finalize packet.",
    parameters: asPiToolParameters(statusSchema),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        action?:
          | "status"
          | "dashboard"
          | "setup"
          | "finalize"
          | "closeout"
          | "ak_evidence"
          | "oracle_evidence"
          | "oracle_evidence_export"
          | "learning"
          | "learning_export"
          | "candidate_result"
          | "candidate_result_export"
          | "candidate_inventory_cleanup_plan"
          | "candidate_inventory_cleanup_apply"
          | "resume_plan"
          | "resume_apply_plan"
          | "campaign_goal"
          | "adapter_contracts"
          | "validate_packet";
        cwd?: string;
        outPath?: string;
        overwrite?: boolean;
        archiveLabel?: string;
        operatorConfirmation?: string;
        packet?: unknown;
        optimizationObjective?: string;
        repoContext?: string[];
        filesInScope?: string[];
        offLimits?: string[];
        benchmarkSurfaces?: string[];
        existingArtifacts?: string[];
        hardConstraints?: string[];
        blockers?: string[];
        akTaskId?: number;
        akScopeSummary?: string[];
        akAllowedPaths?: string[];
        akRequiredPaths?: string[];
        keptRuns?: string[];
        campaignContext?: string[];
        mergeBase?: string | null;
        trunkTarget?: string | null;
        commitSummaries?: string[];
        dependencyNotes?: string[];
        ideasToLeaveOut?: string[];
      };
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();
      const action = request.action ?? "status";
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_STATUS_TOOL_NAME,
        action,
        allowedActions: [
          "status",
          "dashboard",
          "closeout",
          "ak_evidence",
          "oracle_evidence",
          "learning",
          "candidate_result",
          "candidate_inventory_cleanup_plan",
          "resume_plan",
          "resume_apply_plan",
          "campaign_goal",
          "adapter_contracts",
          "validate_packet",
        ],
      });

      if (action === "dashboard") {
        const status = buildAutoresearchRuntimeStatus(cwd, {
          persistSnapshot: false,
          autoContinuationSession: buildAutoresearchAutoContinuationSessionGateForCwd(
            cwd,
            autoContinuationCounts,
          ),
        });
        return {
          content: [{ type: "text", text: formatAutoresearchDashboard(status) }],
          details: status,
        };
      }

      if (action === "setup") {
        const result = await requestAutoresearchSetupDecision({
          cwd,
          packet: {
            optimizationObjective: request.optimizationObjective ?? "",
            repoContext: request.repoContext ?? [],
            filesInScope: request.filesInScope ?? [],
            offLimits: request.offLimits ?? [],
            benchmarkSurfaces: request.benchmarkSurfaces ?? [],
            existingArtifacts: request.existingArtifacts ?? [],
            hardConstraints: request.hardConstraints ?? [],
            blockers: request.blockers ?? [],
            akTask:
              request.akTaskId !== undefined ||
              request.akScopeSummary !== undefined ||
              request.akAllowedPaths !== undefined ||
              request.akRequiredPaths !== undefined
                ? {
                    id: request.akTaskId,
                    scopeSummary: request.akScopeSummary ?? [],
                    allowedPaths: request.akAllowedPaths ?? [],
                    requiredPaths: request.akRequiredPaths ?? [],
                  }
                : null,
          },
          runtime: resolveDecisionRuntime(ctx, signal, options),
          model: ctx.model?.id,
          signal,
        });

        return {
          content: [{ type: "text", text: formatAutoresearchDecisionResult(result) }],
          details: result,
        };
      }

      if (action === "adapter_contracts") {
        const result = buildAutoresearchAdapterContractCatalog();
        return {
          content: [{ type: "text", text: formatAutoresearchAdapterContractCatalog(result) }],
          details: result,
        };
      }

      if (action === "validate_packet") {
        if (request.packet === undefined) {
          throw new Error("action=validate_packet requires a packet object.");
        }
        const result = validateAutoresearchAdapterPacket(request.packet);
        return {
          content: [
            { type: "text", text: formatAutoresearchAdapterPacketValidationResult(result) },
          ],
          details: result,
        };
      }

      if (action === "closeout") {
        const result = buildAutoresearchSegmentCloseout(cwd);
        return {
          content: [{ type: "text", text: formatAutoresearchSegmentCloseout(result) }],
          details: result,
        };
      }

      if (action === "ak_evidence") {
        if (request.akTaskId === undefined) {
          throw new Error("action=ak_evidence requires an exact akTaskId.");
        }
        const result = buildAutoresearchAkEvidencePacket({ cwd, taskId: request.akTaskId });
        return {
          content: [{ type: "text", text: formatAutoresearchAkEvidencePacket(result) }],
          details: result,
        };
      }

      if (action === "oracle_evidence") {
        const result = buildAutoresearchOracleEvidencePacket(cwd);
        return {
          content: [{ type: "text", text: formatAutoresearchOracleEvidencePacket(result) }],
          details: result,
        };
      }

      if (action === "oracle_evidence_export") {
        const result = writeAutoresearchOracleEvidencePacket({
          cwd,
          outPath: request.outPath,
          overwrite: request.overwrite,
        });
        return {
          content: [{ type: "text", text: formatAutoresearchOracleEvidenceExportResult(result) }],
          details: result,
        };
      }

      if (action === "learning") {
        const result = buildAutoresearchKnowledgeExportPacket(cwd);
        return {
          content: [{ type: "text", text: formatAutoresearchKnowledgeExportPacket(result) }],
          details: result,
        };
      }

      if (action === "learning_export") {
        const result = writeAutoresearchKnowledgeExportPacket({
          cwd,
          outPath: request.outPath,
          overwrite: request.overwrite,
        });
        return {
          content: [{ type: "text", text: formatAutoresearchLearningExportResult(result) }],
          details: result,
        };
      }

      if (action === "candidate_result") {
        const result = buildAutoresearchCandidateResultPacket(cwd);
        return {
          content: [{ type: "text", text: formatAutoresearchCandidateResultPacket(result) }],
          details: result,
        };
      }

      if (action === "candidate_result_export") {
        const result = writeAutoresearchCandidateResultPacket({
          cwd,
          outPath: request.outPath,
          overwrite: request.overwrite,
        });
        return {
          content: [{ type: "text", text: formatAutoresearchCandidateResultExportResult(result) }],
          details: result,
        };
      }

      if (action === "candidate_inventory_cleanup_plan") {
        const result = buildAutoresearchCandidateInventoryCleanupPlan({
          cwd,
          archiveLabel: request.archiveLabel,
        });
        return {
          content: [
            { type: "text", text: formatAutoresearchCandidateInventoryCleanupPlan(result) },
          ],
          details: result,
        };
      }

      if (action === "candidate_inventory_cleanup_apply") {
        const result = applyAutoresearchCandidateInventoryCleanup({
          cwd,
          archiveLabel: request.archiveLabel,
          operatorConfirmation: request.operatorConfirmation,
        });
        return {
          content: [
            { type: "text", text: formatAutoresearchCandidateInventoryCleanupPlan(result) },
          ],
          details: result,
        };
      }

      if (action === "resume_plan") {
        const result = buildAutoresearchResumePlan(cwd);
        return {
          content: [{ type: "text", text: formatAutoresearchResumePlan(result) }],
          details: result,
        };
      }

      if (action === "resume_apply_plan") {
        const result = buildAutoresearchResumeApplyPlan(cwd);
        return {
          content: [{ type: "text", text: formatAutoresearchResumeApplyPlan(result) }],
          details: result,
        };
      }

      if (action === "campaign_goal") {
        const status = buildAutoresearchRuntimeStatus(cwd, {
          persistSnapshot: false,
          autoContinuationSession: buildAutoresearchAutoContinuationSessionGateForCwd(
            cwd,
            autoContinuationCounts,
          ),
        });
        return {
          content: [
            {
              type: "text",
              text: formatAutoresearchCampaignGoalStatus(status.campaignGoal, {
                autoContinuation: status.autoContinuation,
              }),
            },
          ],
          details: status.campaignGoal,
        };
      }

      if (action === "finalize") {
        const result = await requestAutoresearchFinalizeDecision({
          cwd,
          packet: {
            keptRuns: request.keptRuns ?? [],
            campaignContext: request.campaignContext ?? [],
            mergeBase: request.mergeBase ?? null,
            trunkTarget: request.trunkTarget ?? null,
            commitSummaries: request.commitSummaries ?? [],
            dependencyNotes: request.dependencyNotes ?? [],
            ideasToLeaveOut: request.ideasToLeaveOut ?? [],
          },
          runtime: resolveDecisionRuntime(ctx, signal, options),
          model: ctx.model?.id,
          signal,
        });

        return {
          content: [{ type: "text", text: formatAutoresearchDecisionResult(result) }],
          details: result,
        };
      }

      const status = buildAutoresearchRuntimeStatus(cwd, {
        persistSnapshot: false,
        autoContinuationSession: buildAutoresearchAutoContinuationSessionGateForCwd(
          cwd,
          autoContinuationCounts,
        ),
      });
      return {
        content: [{ type: "text", text: formatAutoresearchStatusText(status) }],
        details: status,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_CONTROL_TOOL_NAME,
    label: "Autoresearch Runtime Control",
    description:
      "Inspect or set the explicit pi-autoresearch operator control overlay for continue/rebaseline/finalize/stop.",
    promptSnippet:
      "Inspect or set the explicit pi-autoresearch operator control overlay and report the truthful next bounded step.",
    parameters: asPiToolParameters(controlSchema),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        action?: "status" | "set" | "goal_pause" | "goal_resume" | "goal_complete";
        cwd?: string;
        decision?: "continue" | "rebaseline" | "finalize" | "stop";
        reason?: string;
      };
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();
      const action = request.action ?? "status";
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_CONTROL_TOOL_NAME,
        action,
        allowedActions: ["status"],
      });

      if (action === "set") {
        if (!request.decision) {
          throw new Error("decision is required when action=set for autoresearch_runtime_control");
        }

        const result = setAutoresearchRuntimeControl({
          cwd,
          decision: request.decision,
          reason: request.reason,
        });
        return {
          content: [{ type: "text", text: formatAutoresearchControlResult(result) }],
          details: result,
        };
      }

      if (action === "goal_pause" || action === "goal_resume" || action === "goal_complete") {
        const result = setAutoresearchCampaignGoalControl({
          cwd,
          action:
            action === "goal_pause" ? "pause" : action === "goal_resume" ? "resume" : "complete",
          reason: request.reason,
        });
        const status = buildAutoresearchRuntimeStatus(cwd, {
          persistSnapshot: false,
          autoContinuationSession: buildAutoresearchAutoContinuationSessionGateForCwd(
            cwd,
            autoContinuationCounts,
          ),
        });
        return {
          content: [
            {
              type: "text",
              text: formatAutoresearchCampaignGoalStatus(status.campaignGoal, {
                autoContinuation: status.autoContinuation,
              }),
            },
          ],
          details: result,
        };
      }

      const result = inspectAutoresearchRuntimeControl(cwd);
      return {
        content: [{ type: "text", text: formatAutoresearchControlResult(result) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_FINALIZE_TOOL_NAME,
    label: "Autoresearch Runtime Finalize",
    description:
      "Inspect, plan, approve, and materialize the bounded pi-autoresearch finalization workflow.",
    promptSnippet:
      "Inspect or advance the bounded pi-autoresearch finalization workflow through status, plan, approve, or materialize.",
    parameters: asPiToolParameters(finalizeSchema),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        action?: "status" | "plan" | "approve" | "materialize";
        cwd?: string;
        reason?: string;
      };
      const action = request.action ?? "status";
      assertReadProfileAllowsAction(options, {
        toolName: AUTORESEARCH_FINALIZE_TOOL_NAME,
        action,
        allowedActions: ["status"],
      });
      const result = await executeAutoresearchFinalization({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        action: request.action,
        reason: request.reason,
        runtime:
          request.action === "plan" ? resolveDecisionRuntime(ctx, signal, options) : undefined,
        model: ctx.model?.id,
        signal,
      });

      return {
        content: [{ type: "text", text: formatAutoresearchFinalizationResult(result) }],
        details: result,
      };
    },
  });

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

function resolveDecisionRuntime(
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
  options: PiAutoresearchExtensionOptions,
): AutoresearchDecisionRuntime {
  return options.createDecisionRuntime?.(ctx, signal) ?? createDefaultDecisionRuntime(ctx, signal);
}

function createDefaultDecisionRuntime(
  ctx: ExtensionContext,
  signal: AbortSignal | undefined,
): AutoresearchDecisionRuntime {
  return createAutoresearchDecisionRuntime({
    executePreparedPrompt: async (input) => {
      if (!ctx.model) {
        throw new Error(
          "No model selected for live pi-autoresearch Prompt Vault decisions in this session.",
        );
      }

      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
      if (!auth.ok || !auth.apiKey) {
        throw new Error(auth.ok ? `No API key for ${ctx.model.provider}` : auth.error);
      }

      const response = await complete(
        ctx.model,
        {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: input.preparedText }],
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: auth.apiKey,
          headers: auth.headers,
          signal: input.signal ?? signal,
        },
      );

      if (response.stopReason === "aborted") {
        throw new Error("Prompt Vault decision execution aborted.");
      }

      const outputText = response.content
        .filter((content): content is { type: "text"; text: string } => content.type === "text")
        .map((content) => content.text)
        .join("\n")
        .trim();
      if (outputText.length === 0) {
        throw new Error("Prompt Vault decision execution returned no text output.");
      }

      return {
        outputText,
        model: ctx.model.id,
      };
    },
  });
}

async function openAutoresearchShell(
  args: string,
  ctx: ExtensionContext,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
  options: PiAutoresearchExtensionOptions,
): Promise<void> {
  if (!ctx.hasUI) return;

  const normalizedArgs = args.trim();
  const status = buildAutoresearchRuntimeStatus(ctx.cwd);

  if (normalizedArgs === "widget off") {
    clearAutoresearchWidget(ctx as AutoresearchWidgetContext);
    ctx.ui.notify("Disabled the pi-autoresearch status widget for this session.", "info");
    return;
  }

  if (normalizedArgs === "widget" || normalizedArgs === "widget on") {
    registerAutoresearchWidget(ctx as AutoresearchWidgetContext);
    ctx.ui.notify("Enabled the pi-autoresearch status widget for this session.", "info");
    return;
  }

  if (normalizedArgs === "export" || normalizedArgs === "browser") {
    await exportAutoresearchDashboardToBrowser(
      ctx as AutoresearchWidgetContext,
      dashboardExportIntervals,
    );
    return;
  }

  if (normalizedArgs === "export off" || normalizedArgs === "browser off") {
    stopAutoresearchDashboardBrowserExport(ctx.cwd, dashboardExportIntervals);
    ctx.ui.notify("Stopped pi-autoresearch browser dashboard refresh for this session.", "info");
    return;
  }

  if (normalizedArgs === "overlay" || normalizedArgs === "fullscreen") {
    await openAutoresearchDashboardOverlay(ctx as AutoresearchWidgetContext);
    return;
  }

  if (normalizedArgs === "dashboard") {
    await ctx.ui.editor("Pi-autoresearch dashboard", formatAutoresearchDashboard(status));
    ctx.ui.notify(
      "Opened read-only pi-autoresearch dashboard. Use the listed exact calls to act.",
      "info",
    );
    return;
  }

  if (parseAutoresearchResumeCommand(normalizedArgs)) {
    await openAutoresearchResumeReview(ctx);
    return;
  }

  if (parseAutoresearchLearningHandoffCommand(normalizedArgs)) {
    await ctx.ui.editor(
      "Export autoresearch learning packet",
      buildAutoresearchLearningExportEditorCall(ctx.cwd),
    );
    ctx.ui.notify(
      "Prepared autoresearch learning export call for review. Submit it to write the local packet, then use the returned KES adapter plan call.",
      "info",
    );
    return;
  }

  if (parseAutoresearchOpenCandidateReviewCommand(normalizedArgs)) {
    await ctx.ui.editor(
      "Open autoresearch candidate review posture",
      buildAutoresearchOpenCandidateReviewEditorText(ctx.cwd),
    );
    ctx.ui.notify(
      "Opened read-only open candidate review posture. Use the exact owner-review call only after packet review.",
      "info",
    );
    return;
  }

  if (parseAutoresearchCandidateIntegrationCommand(normalizedArgs)) {
    await ctx.ui.editor(
      "Integrate useful autoresearch candidates",
      buildAutoresearchCandidateIntegrationEditorText(ctx.cwd),
    );
    ctx.ui.notify(
      "Prepared read-only candidate integration handoff. Review decides usefulness; finalizer apply still requires the exact owner token.",
      "info",
    );
    return;
  }

  const runObjective = parseAutoresearchRunObjectiveCommand(normalizedArgs);
  if (runObjective) {
    await executeAutoresearchFirstRun(runObjective, ctx, options);
    return;
  }

  if (parseAutoresearchCandidateNextCommand(normalizedArgs)) {
    await ctx.ui.editor(
      "Next autoresearch candidate action",
      buildAutoresearchCandidateNextEditorCall(ctx.cwd),
    );
    ctx.ui.notify(
      "Prepared the next recommended autoresearch candidate call for review. No worktree or durable action was applied.",
      "info",
    );
    return;
  }

  const candidateMeasure = parseAutoresearchCandidateMeasureCommand(normalizedArgs, ctx.cwd);
  if (candidateMeasure) {
    await ctx.ui.editor(
      "Measure autoresearch candidate",
      buildAutoresearchCandidateMeasureEditorCall(ctx.cwd, candidateMeasure.candidateWorktree),
    );
    ctx.ui.notify(
      "Prepared candidate measurement or intake-review call. Review readiness, benchmark/check settings, and metadata before execution.",
      "info",
    );
    return;
  }

  const candidateBind = parseAutoresearchCandidateBindCommand(normalizedArgs, ctx.cwd);
  if (candidateBind) {
    await ctx.ui.editor(
      "Bind autoresearch candidate",
      buildAutoresearchCandidateBindEditorCall(ctx.cwd, candidateBind.candidateWorktree),
    );
    ctx.ui.notify(
      "Prepared autoresearch_candidate_bind plan. Review the candidate path/base ref, then send it to inspect and prepare measurement.",
      "info",
    );
    return;
  }

  const candidateDecisionReview = parseAutoresearchCandidateDecisionReviewCommand(normalizedArgs);
  if (candidateDecisionReview) {
    await openAutoresearchCandidateDecisionReview(
      ctx as AutoresearchWidgetContext,
      candidateDecisionReview,
    );
    return;
  }

  const candidateDecisionAction = parseAutoresearchCandidateDecisionCommand(normalizedArgs);
  if (candidateDecisionAction) {
    await ctx.ui.editor(
      "Plan autoresearch candidate decision",
      buildAutoresearchCandidateDecisionEditorCall(ctx.cwd, candidateDecisionAction),
    );
    ctx.ui.notify(
      `Prepared autoresearch_candidate_decision ${candidateDecisionAction} call. Review the plan before any external worktree action.`,
      "info",
    );
    return;
  }

  if (normalizedArgs.length > 0 && normalizedArgs !== "help" && normalizedArgs !== "status") {
    const toolCall = buildAutoresearchCampaignStartEditorCall(ctx.cwd, normalizedArgs);
    await ctx.ui.editor("Start supervised autoresearch campaign", toolCall);
    ctx.ui.notify(
      "Prepared autoresearch_campaign_start front-door call. Review budget/scope, then send it to run the bounded campaign start.",
      "info",
    );
    return;
  }

  ctx.ui.notify(formatAutoresearchCommandNotification(status), "info");
}

async function executeAutoresearchFirstRun(
  objective: string,
  ctx: ExtensionContext,
  options: PiAutoresearchExtensionOptions,
): Promise<void> {
  let result: Awaited<ReturnType<typeof executeAutoresearchCampaignStart>>;
  try {
    assertReadProfileRejectsTool(options, AUTORESEARCH_CAMPAIGN_START_TOOL_NAME);
    ctx.ui.notify(
      "Starting bounded foreground autoresearch run. This stays local and stops on budget/gates.",
      "info",
    );
    result = await executeAutoresearchCampaignStart({
      cwd: ctx.cwd,
      objective,
      setupMode: "autoplan",
      runMode: "bounded_loop",
      maxIterations: 3,
      maxWallClockMinutes: 30,
      peerMode: "plan",
      model: ctx.model?.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const planCall = buildAutoresearchCampaignStartEditorCall(ctx.cwd, objective);
    await ctx.ui.editor(
      "Autoresearch campaign blocked",
      [
        "# PI-AUTORESEARCH CAMPAIGN BLOCKED",
        "",
        `- objective: ${objective}`,
        `- reason: ${message}`,
        "",
        "The first-entrypoint run did not execute. Review the fallback exact call below, usually by adding an explicit benchmarkCommand or running setup first.",
        "",
        "```ts",
        planCall,
        "```",
      ].join("\n"),
    );
    ctx.ui.notify(
      "Autoresearch run blocked before execution; opened fallback review call.",
      "warning",
    );
    return;
  }

  await ctx.ui.editor(
    "Autoresearch campaign result",
    formatAutoresearchCampaignStartResult(result),
  );
  ctx.ui.notify(
    "Completed bounded foreground autoresearch run. Review the final dashboard and next exact call.",
    "info",
  );
}

async function openAutoresearchResumeReview(ctx: ExtensionContext): Promise<void> {
  const reviewText = buildAutoresearchResumeApplyEditorCall(ctx.cwd);
  const editedText = await ctx.ui.editor("Review foreground autoresearch resume", reviewText);
  if (typeof editedText !== "string") {
    ctx.ui.notify("Canceled foreground resume review. No resume call was submitted.", "warning");
    return;
  }

  const editorCall = extractAutoresearchResumeEditorCall(editedText);
  if (!editorCall) {
    ctx.ui.notify(
      "Canceled foreground resume review: could not find an autoresearch resume call in the edited text.",
      "warning",
    );
    return;
  }

  ctx.ui.setEditorText(editorCall);
  ctx.ui.notify(
    "Accepted foreground resume call into the message editor. Replace any remaining <explicit> budgets, then press Enter to submit.",
    "info",
  );
}

async function openAutoresearchCandidateDecisionReview(
  ctx: AutoresearchWidgetContext,
  parsed: AutoresearchCandidateDecisionReviewParsedInput,
): Promise<void> {
  const candidates = buildAutoresearchCandidateDecisionTriggerCandidates({
    cwd: ctx.cwd,
    directAction: parsed.directAction,
  });
  const fallbackAction = candidates[0]?.action ?? parsed.directAction ?? "status";
  if (!ctx.hasUI || typeof ctx.ui.custom !== "function") {
    await ctx.ui.editor?.(
      "Review autoresearch candidate decision",
      buildAutoresearchCandidateDecisionEditorCall(ctx.cwd, fallbackAction),
    );
    ctx.ui.notify?.(
      "Candidate decision review overlay unavailable; opened the plan-only confirmation in the editor.",
      "warning",
    );
    return;
  }

  const selectedAction = await ctx.ui.custom<AutoresearchCandidateDecisionTriggerAction | null>(
    (tui, _theme, _keybindings, done) =>
      createAutoresearchCandidateDecisionReviewOverlay({
        cwd: ctx.cwd,
        candidates,
        tui,
        done,
      }),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "82%",
        maxHeight: "75%",
        margin: 1,
        visible: (termWidth: number, termHeight: number) => termWidth >= 70 && termHeight >= 16,
      },
    },
  );

  if (!selectedAction) {
    ctx.ui.notify?.(
      "Canceled autoresearch candidate decision review; no action was applied.",
      "info",
    );
    return;
  }

  await ctx.ui.editor?.(
    "Review autoresearch candidate decision",
    buildAutoresearchCandidateDecisionEditorCall(ctx.cwd, selectedAction),
  );
  ctx.ui.notify?.(
    `Prepared autoresearch_candidate_decision ${selectedAction} confirmation. Review the checklist before any external worktree action.`,
    "info",
  );
}

function createAutoresearchCandidateDecisionReviewOverlay(input: {
  cwd: string;
  candidates: readonly AutoresearchCandidateDecisionTriggerCandidate[];
  tui: AutoresearchWidgetTui;
  done: (result: AutoresearchCandidateDecisionTriggerAction | null) => void;
}): AutoresearchCandidateDecisionReviewComponent {
  const candidates = input.candidates.length > 0 ? [...input.candidates] : [];
  let selectedIndex = 0;
  let closed = false;
  const close = (result: AutoresearchCandidateDecisionTriggerAction | null) => {
    if (closed) return;
    closed = true;
    input.done(result);
  };
  const move = (delta: number) => {
    if (candidates.length === 0) return;
    selectedIndex = (selectedIndex + delta + candidates.length) % candidates.length;
    input.tui.requestRender?.();
  };

  return {
    render(width: number): string[] {
      return formatAutoresearchCandidateDecisionReviewOverlayLines({
        cwd: input.cwd,
        candidates,
        selectedIndex,
        width: Math.max(40, width),
      });
    },
    handleInput(data: string): void {
      if (data === "q" || data === "Q" || data === "\u001b" || data === "\u0003") {
        close(null);
        return;
      }
      if (data === "j" || data === "\u001b[B") {
        move(1);
        return;
      }
      if (data === "k" || data === "\u001b[A") {
        move(-1);
        return;
      }
      const digit = /^[1-4]$/u.exec(data)?.[0];
      if (digit) {
        const index = Number(digit) - 1;
        if (candidates[index]) {
          selectedIndex = index;
          close(candidates[index].action);
        }
        return;
      }
      if (data === "\r" || data === "\n") {
        close(candidates[selectedIndex]?.action ?? null);
      }
    },
    invalidate(): void {},
  };
}

function formatAutoresearchCandidateDecisionReviewOverlayLines(input: {
  cwd: string;
  candidates: readonly AutoresearchCandidateDecisionTriggerCandidate[];
  selectedIndex: number;
  width: number;
}): string[] {
  const innerWidth = Math.max(20, input.width - 2);
  const rows = input.candidates.map((candidate, index) => {
    const pointer = index === input.selectedIndex ? "▶" : " ";
    const number = `${index + 1}.`;
    const badges = [
      candidate.detail.includes("direct") ? "direct" : null,
      candidate.detail.includes("recommended") ? "recommended" : null,
    ].filter(Boolean);
    const label = badges.length > 0 ? `${candidate.label} [${badges.join(", ")}]` : candidate.label;
    const line = `${pointer} ${number} ${label} — ${candidate.detail}`;
    return borderedLine(truncatePlainLine(line, innerWidth), innerWidth);
  });
  const body = [
    borderLine("┌", "─", "┐", innerWidth),
    borderedLine("🔬 Review autoresearch candidate decision", innerWidth),
    borderedLine(
      "final owner decision after complete packet inventory • Enter choose • q/Esc cancel",
      innerWidth,
    ),
    borderLine("├", "─", "┤", innerWidth),
    borderedLine(`cwd: ${input.cwd}`, innerWidth),
    borderedLine(
      "No worktree, AK/KES/evidence, peer, merge, or promotion action is applied here.",
      innerWidth,
    ),
    borderLine("├", "─", "┤", innerWidth),
    ...rows,
    borderLine("└", "─", "┘", innerWidth),
  ];
  return body.map((line) => truncatePlainLine(line, input.width));
}

function buildAutoresearchCandidateDecisionTriggerCandidates(input: {
  cwd: string;
  directAction: AutoresearchCandidateDecisionTriggerAction | null;
}): AutoresearchCandidateDecisionTriggerCandidate[] {
  let recommendation: ReturnType<typeof buildAutoresearchCandidateDecisionWorkbench> | null = null;
  try {
    recommendation = buildAutoresearchCandidateDecisionWorkbench({ cwd: input.cwd });
  } catch {
    recommendation = null;
  }

  const decorated = AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES.map((candidate) => {
    const badges: string[] = [];
    if (input.directAction === candidate.action) badges.push("direct");
    if (
      recommendation &&
      candidateActionMatchesLifecycleDecision(candidate.action, recommendation.recommendedDecision)
    ) {
      badges.push("recommended");
    }
    return {
      ...candidate,
      detail: badges.length > 0 ? `${candidate.detail} (${badges.join(", ")})` : candidate.detail,
    };
  });

  return decorated.sort((left, right) => {
    const leftDirect = input.directAction === left.action ? 1 : 0;
    const rightDirect = input.directAction === right.action ? 1 : 0;
    if (leftDirect !== rightDirect) return rightDirect - leftDirect;
    const leftRecommended =
      recommendation &&
      candidateActionMatchesLifecycleDecision(left.action, recommendation.recommendedDecision)
        ? 1
        : 0;
    const rightRecommended =
      recommendation &&
      candidateActionMatchesLifecycleDecision(right.action, recommendation.recommendedDecision)
        ? 1
        : 0;
    return rightRecommended - leftRecommended;
  });
}

function candidateActionMatchesLifecycleDecision(
  action: AutoresearchCandidateDecisionTriggerAction,
  decision: string,
): boolean {
  return (
    (action === "status" && decision === "no_candidate_bound_yet") ||
    (action === "plan_keep" && (decision === "keep" || decision === "finalize")) ||
    (action === "plan_discard" && decision === "discard") ||
    (action === "plan_rewind" && decision === "rewind")
  );
}

function scheduleAutoresearchAutoContinuationFollowUp(
  pi: ExtensionAPI,
  ctx: AutoresearchWidgetContext,
  autoContinuationCounts: Map<string, number>,
  autoContinuationTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  const cwd = ctx.cwd;
  if (!cwd) return;
  cancelAutoresearchAutoContinuationFollowUp(cwd, autoContinuationTimers);

  const initialDecision = buildAutoresearchAutoContinuationDecisionForCwd(
    cwd,
    autoContinuationCounts,
  );
  if (!initialDecision.eligible) return;

  const timer = setTimeout(() => {
    autoContinuationTimers.delete(cwd);
    const decision = buildAutoresearchAutoContinuationDecisionForCwd(cwd, autoContinuationCounts);
    if (!decision.eligible || !decision.visibleFollowUpMessage) return;

    autoContinuationCounts.set(cwd, (autoContinuationCounts.get(cwd) ?? 0) + 1);
    const sendUserMessage = (pi as unknown as { sendUserMessage?: ExtensionAPI["sendUserMessage"] })
      .sendUserMessage;
    if (typeof sendUserMessage === "function") {
      sendUserMessage.call(pi, decision.visibleFollowUpMessage, { deliverAs: "followUp" });
      return;
    }

    ctx.ui?.notify?.(formatAutoresearchAutoContinuationDecision(decision), "info");
  }, getAutoresearchAutoContinuationSettleDelayMs());
  timer.unref?.();
  autoContinuationTimers.set(cwd, timer);
}

function cancelAutoresearchAutoContinuationFollowUp(
  cwd: string | undefined,
  autoContinuationTimers: Map<string, ReturnType<typeof setTimeout>>,
): void {
  if (!cwd) return;
  const timer = autoContinuationTimers.get(cwd);
  if (!timer) return;
  clearTimeout(timer);
  autoContinuationTimers.delete(cwd);
}

function buildAutoresearchAutoContinuationDecisionForCwd(
  cwd: string,
  autoContinuationCounts: Map<string, number>,
): AutoresearchAutoContinuationDecision {
  return buildAutoresearchRuntimeStatus(cwd, {
    persistSnapshot: false,
    autoContinuationSession: buildAutoresearchAutoContinuationSessionGateForCwd(
      cwd,
      autoContinuationCounts,
    ),
  }).autoContinuation;
}

function buildAutoresearchAutoContinuationSessionGateForCwd(
  cwd: string,
  autoContinuationCounts: Map<string, number>,
) {
  return buildAutoresearchAutoContinuationSessionGateFromEnv({
    autoContinueCount: autoContinuationCounts.get(cwd) ?? 0,
  });
}

function getAutoresearchAutoContinuationSettleDelayMs(): number {
  const parsed = Number(process.env.PI_AUTORESEARCH_AUTO_CONTINUE_SETTLE_MS ?? "1500");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 1500;
}

function registerAutoresearchWidget(ctx: AutoresearchWidgetContext): void {
  if (!ctx.hasUI || typeof ctx.ui.setWidget !== "function") return;

  ctx.ui.setWidget(AUTORESEARCH_WIDGET_ID, (tui: AutoresearchWidgetTui) => {
    const interval = setInterval(() => tui.requestRender?.(), 2000);
    interval.unref?.();
    return {
      render(width: number): string[] {
        return formatAutoresearchWidgetLines(ctx.cwd, width);
      },
      invalidate() {},
      dispose() {
        clearInterval(interval);
      },
    };
  });
}

function clearAutoresearchWidget(ctx: AutoresearchWidgetContext): void {
  if (typeof ctx.ui.setWidget !== "function") return;
  ctx.ui.setWidget(AUTORESEARCH_WIDGET_ID, undefined);
}

function formatAutoresearchWidgetLines(cwd: string, width: number): string[] {
  const status = buildAutoresearchRuntimeStatus(cwd);
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const segment = status.currentSegment;
  const metricName = segment.metricName ?? "metric";
  const unit = segment.metricUnit ?? "";
  const best = formatAutoresearchTuiMetric(segment.bestMetric, unit);
  const kept = closeout.runs.filter((run) => run.status === "keep").length;
  const candidates = closeout.runs.filter((run) => run.status === "candidate").length;
  const failed = closeout.runs.filter(
    (run) => run.status === "crash" || run.status === "checks_failed",
  ).length;
  const confidence =
    segment.confidence === null ? "conf —" : `conf ${segment.confidence.toFixed(1)}×`;
  const improvement = formatAutoresearchTuiImprovement(
    segment.baselineMetric,
    segment.bestMetric,
    segment.direction,
  );
  const readiness = status.empiricalPosture.promotionReady ? "ready" : "not-ready";
  const essential = [
    "🔬 autoresearch",
    `${segment.runCount} runs/${segment.successfulRunCount} ok`,
    candidates > 0 ? `${candidates} candidate${candidates === 1 ? "" : "s"}` : "",
    kept > 0 ? `${kept} kept(final)` : candidates > 0 ? "0 kept(final)" : "",
    failed > 0 ? `${failed} checks-failed` : "",
    `★ ${metricName}: ${best}`,
    improvement !== "—" ? improvement : "",
    confidence,
    `${status.empiricalPosture.classification}/${readiness}`,
  ].filter(Boolean);
  const hint =
    width >= 96
      ? "ctrl+shift+t expand • ctrl+shift+f fullscreen"
      : "overlay: /autoresearch overlay";
  return [truncatePlainLine(joinAutoresearchTuiParts(essential, hint, width), Math.max(20, width))];
}

function truncatePlainLine(line: string, width: number): string {
  if (line.length <= width) return line;
  if (width <= 1) return line.slice(0, Math.max(0, width));
  return `${line.slice(0, Math.max(0, width - 1))}…`;
}

function joinAutoresearchTuiParts(leftParts: string[], rightHint: string, width: number): string {
  const left = leftParts.join(" │ ");
  if (width < 80) return left;
  const gap = width - left.length - rightHint.length;
  if (gap < 3) return left;
  return `${left}${" ".repeat(gap)}${rightHint}`;
}

function formatAutoresearchTuiMetric(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted =
    Math.abs(value) >= 100
      ? value.toFixed(0)
      : Number.isInteger(value)
        ? String(value)
        : value.toFixed(2);
  return `${formatted}${unit}`;
}

function formatAutoresearchTuiImprovement(
  baseline: number | null,
  best: number | null,
  direction: string | null,
): string {
  if (
    baseline === null ||
    best === null ||
    baseline === 0 ||
    !Number.isFinite(baseline) ||
    !Number.isFinite(best)
  ) {
    return "—";
  }
  const raw = ((best - baseline) / baseline) * 100;
  const improved =
    direction === "lower" ? best < baseline : direction === "higher" ? best > baseline : false;
  const sign = raw > 0 ? "+" : "";
  const arrow = improved ? "↗" : raw === 0 ? "→" : "↘";
  return `${arrow} ${sign}${raw.toFixed(1)}%`;
}

async function exportAutoresearchDashboardToBrowser(
  ctx: AutoresearchWidgetContext,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
): Promise<void> {
  const result = exportAutoresearchDashboardHtml({ cwd: ctx.cwd });
  startAutoresearchDashboardBrowserRefresh(ctx.cwd, dashboardExportIntervals);
  try {
    await openAutoresearchFileUrl(result.fileUrl);
    ctx.ui.notify?.(
      `Opened pi-autoresearch measured packet inventory dashboard: ${result.path}`,
      "info",
    );
  } catch (error) {
    ctx.ui.notify?.(
      `Browser dashboard exported to ${result.path}, but auto-open failed: ${error instanceof Error ? error.message : String(error)}`,
      "warning",
    );
  }
}

function startAutoresearchDashboardBrowserRefresh(
  cwd: string,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
): void {
  const existing = dashboardExportIntervals.get(cwd);
  if (existing) clearInterval(existing);
  const interval = setInterval(() => {
    try {
      exportAutoresearchDashboardHtml({ cwd });
    } catch {
      // Browser export is best-effort read-only UI; status/tool surfaces remain authoritative.
    }
  }, 2000);
  interval.unref?.();
  dashboardExportIntervals.set(cwd, interval);
}

function stopAutoresearchDashboardBrowserExport(
  cwd: string,
  dashboardExportIntervals: Map<string, ReturnType<typeof setInterval>>,
): void {
  const existing = dashboardExportIntervals.get(cwd);
  if (existing) clearInterval(existing);
  dashboardExportIntervals.delete(cwd);
}

async function openAutoresearchFileUrl(fileUrl: string): Promise<void> {
  const { command, args } = getAutoresearchBrowserOpenCommand(fileUrl);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    try {
      const child = spawn(command, args, { detached: true, stdio: "ignore" });
      let settled = false;
      const settle = (callback: (value?: unknown) => void) => (value?: unknown) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      child.once(
        "error",
        settle((error) => rejectPromise(error instanceof Error ? error : new Error(String(error)))),
      );
      child.once(
        "spawn",
        settle(() => {
          child.unref();
          resolvePromise();
        }),
      );
    } catch (error) {
      rejectPromise(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function getAutoresearchBrowserOpenCommand(fileUrl: string): AutoresearchBrowserOpenCommand {
  if (process.platform === "darwin") return { command: "open", args: [fileUrl] };
  if (process.platform === "win32") return { command: "cmd", args: ["/c", "start", "", fileUrl] };
  return { command: "xdg-open", args: [fileUrl] };
}

async function openAutoresearchDashboardOverlay(ctx: AutoresearchWidgetContext): Promise<void> {
  if (!ctx.hasUI) return;
  if (typeof ctx.ui.custom !== "function") {
    await ctx.ui.editor?.(
      "Pi-autoresearch dashboard",
      formatAutoresearchDashboard(buildAutoresearchRuntimeStatus(ctx.cwd)),
    );
    ctx.ui.notify?.(
      "TUI overlay unavailable; opened read-only dashboard in the editor.",
      "warning",
    );
    return;
  }

  await ctx.ui.custom<void>(
    (tui, _theme, _keybindings, done) => createAutoresearchDashboardOverlay(ctx.cwd, tui, done),
    {
      overlay: true,
      overlayOptions: {
        anchor: "center",
        width: "92%",
        maxHeight: "85%",
        margin: 1,
        visible: (termWidth: number, termHeight: number) => termWidth >= 70 && termHeight >= 18,
      },
    },
  );
}

function createAutoresearchDashboardOverlay(
  cwd: string,
  tui: AutoresearchWidgetTui,
  done: () => void,
): AutoresearchOverlayComponent {
  let offset = 0;
  let closed = false;
  const interval = setInterval(() => tui.requestRender?.(), 2000);
  interval.unref?.();

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(interval);
    done();
  };

  return {
    render(width: number): string[] {
      return formatAutoresearchOverlayLines(cwd, Math.max(40, width), offset);
    },
    handleInput(data: string): void {
      if (data === "q" || data === "Q" || data === "\u001b" || data === "\u0003") {
        close();
        return;
      }
      if (data === "j" || data === "\u001b[B") offset += 1;
      if (data === "k" || data === "\u001b[A") offset = Math.max(0, offset - 1);
      if (data === "d" || data === "\u001b[6~") offset += 10;
      if (data === "u" || data === "\u001b[5~") offset = Math.max(0, offset - 10);
      tui.requestRender?.();
    },
    invalidate() {},
    dispose() {
      clearInterval(interval);
    },
  };
}

function formatAutoresearchOverlayLines(cwd: string, width: number, offset: number): string[] {
  const innerWidth = Math.max(20, width - 2);
  const body = buildAutoresearchOverlayBody(cwd, innerWidth);
  const visibleBody = body.slice(offset, offset + 22);

  const lines = [
    borderLine("┌", "─", "┐", innerWidth),
    borderedLine("🔬 pi-autoresearch live dashboard", innerWidth),
    borderedLine("q/Esc close • j/k scroll • ctrl+shift+t widget • read-only", innerWidth),
    borderLine("├", "─", "┤", innerWidth),
    ...visibleBody.map((line) => borderedLine(line, innerWidth)),
    borderLine("└", "─", "┘", innerWidth),
  ];
  return lines.map((line) => truncatePlainLine(line, width));
}

function buildAutoresearchOverlayBody(cwd: string, width: number): string[] {
  const status = buildAutoresearchRuntimeStatus(cwd);
  const closeout = buildAutoresearchSegmentCloseout(cwd);
  const segment = status.currentSegment;
  const candidateDecision = buildAutoresearchCandidateDecisionWorkbench({ cwd });
  const metricName = segment.metricName ?? "metric";
  const unit = segment.metricUnit ?? "";
  const baseline = formatAutoresearchTuiMetric(segment.baselineMetric, unit);
  const best = formatAutoresearchTuiMetric(segment.bestMetric, unit);
  const improvement = formatAutoresearchTuiImprovement(
    segment.baselineMetric,
    segment.bestMetric,
    segment.direction,
  );
  const confidence = segment.confidence === null ? "—" : `${segment.confidence.toFixed(1)}×`;
  const recentRuns = closeout.runs.slice(-10).reverse();
  const tableRows =
    recentRuns.length > 0
      ? recentRuns.map((run) => formatAutoresearchOverlayRunRow(run, metricName, unit, width))
      : ["  (no runs recorded yet)"];

  return [
    `cwd: ${cwd}`,
    `machine: ${status.runtimeProjection.state}  control: ${status.control.kind}  posture: ${status.empiricalPosture.classification}`,
    `promotion: ${status.empiricalPosture.promotionReady ? "ready" : "not ready"}  next: ${status.empiricalPosture.recommendedNextAction}`,
    "",
    `Baseline → Best: ${baseline} → ${best}`,
    `Improvement: ${improvement}  Runs: ${segment.runCount} total / ${segment.successfulRunCount} ok  Confidence: ${confidence}`,
    `Metric: ★ ${metricName} ${segment.direction ?? ""} ${unit ? `(${unit})` : ""}`,
    `Success threshold: ${formatAutoresearchOverlayThreshold(segment.metricThreshold, unit)}`,
    `Benchmark: ${segment.benchmarkCommand ?? "(unset)"}`,
    `Checks: ${segment.checksCommand ?? "(none)"}`,
    "",
    "Metric trajectory / recent runs",
    formatAutoresearchOverlayRunHeader(metricName, width),
    `  ${"─".repeat(Math.max(0, Math.min(width - 4, 96)))}`,
    ...tableRows,
    "",
    "Candidate decision",
    `candidate: ${candidateDecision.candidate?.label ?? "no candidate bound yet"}`,
    `decision: ${candidateDecision.recommendedDecision}  checks=${candidateDecision.empirical.checksStatus}`,
    `next surface: ${candidateDecision.exactNextCalls[0] ?? `${AUTORESEARCH_CANDIDATE_DECISION_TOOL_NAME}({ cwd: ${JSON.stringify(cwd)}, action: "status" })`}`,
    "",
    "Candidate policy",
    "mode=worktree • keep=preserve_branch • discard=suggest_cleanup • rewind=reset_worktree_to_base",
    "Replay Fabric observes history; ASC rewind is live session recovery; durable promotion remains external.",
    "Browser export has the upstream-style card/chart/table view: /autoresearch export",
  ];
}

function formatAutoresearchOverlayThreshold(value: number | null, unit: string): string {
  return value === null ? "not set; zero-target inference may apply" : `${value}${unit}`;
}

function formatAutoresearchOverlayRunHeader(metricName: string, width: number): string {
  const metric = truncatePlainLine(`★ ${metricName}`, width >= 100 ? 22 : 14);
  return `  ${"#".padEnd(4)}${"status".padEnd(17)}${metric.padEnd(width >= 100 ? 24 : 16)}${"decision".padEnd(24)}description`;
}

function formatAutoresearchOverlayRunRow(
  run: {
    iteration: number | null;
    status: string;
    runKind: string;
    metric: number;
    empiricalDecisionClass: string;
    description: string;
  },
  _metricName: string,
  unit: string,
  width: number,
): string {
  const metricWidth = width >= 100 ? 24 : 16;
  const idx = String(run.iteration ?? "-").padEnd(4);
  const status = truncatePlainLine(`${run.status}/${run.runKind}`, 16).padEnd(17);
  const metric = formatAutoresearchTuiMetric(run.metric, unit).padEnd(metricWidth);
  const decision = truncatePlainLine(run.empiricalDecisionClass, 23).padEnd(24);
  return truncatePlainLine(
    `  ${idx}${status}${metric}${decision}${run.description}`,
    Math.max(20, width - 2),
  );
}

function borderedLine(text: string, innerWidth: number): string {
  const truncated = truncatePlainLine(text, innerWidth);
  return `│${truncated}${" ".repeat(Math.max(0, innerWidth - truncated.length))}│`;
}

function borderLine(left: string, fill: string, right: string, innerWidth: number): string {
  return `${left}${fill.repeat(innerWidth)}${right}`;
}

async function loadAutoresearchTriggerSurface(): Promise<AutoresearchTriggerSurface | null> {
  try {
    const interactionModuleName = "@tryinget/pi-interaction";
    return (await import(interactionModuleName)) as AutoresearchTriggerSurface;
  } catch {
    try {
      const triggerAdapterModuleName = "@tryinget/pi-trigger-adapter";
      return (await import(triggerAdapterModuleName)) as AutoresearchTriggerSurface;
    } catch {
      return null;
    }
  }
}

async function maybeRegisterAutoresearchLiveTrigger(
  explicitTriggerSurface?: AutoresearchTriggerSurface | null,
): Promise<{ unregister: () => void }> {
  try {
    const triggerSurface = explicitTriggerSurface ?? (await loadAutoresearchTriggerSurface());
    if (typeof triggerSurface?.registerPickerInteraction !== "function") {
      return { unregister: () => {} };
    }

    const registrations: Array<{ unregister?: () => void }> = [];

    registrations.push(
      triggerSurface.registerPickerInteraction({
        id: AUTORESEARCH_CANDIDATE_BIND_TRIGGER_ID,
        description:
          "pi-autoresearch candidate bind/measure picker for $$ autoresearch bind|measure [current|<worktree>]",
        priority: 116,
        match: /^\$\$\s*(?:autoresearch|ar)\s+(?:candidate\s+)?(bind|measure)(?:\s+([^\n]*))?$/,
        requireCursorAtEnd: true,
        debounceMs: 150,
        showInPicker: true,
        pickerLabel: "$$ autoresearch bind/measure",
        pickerDetail: "Inspect a candidate worktree and prepare measurement binding",
        parseInput: (
          match: { groups?: string[] },
          context?: AutoresearchTriggerContext,
        ): AutoresearchCandidateBindTriggerParsedInput => {
          const mode = String(match?.groups?.[0] ?? "bind") === "measure" ? "measure" : "bind";
          const raw = String(match?.groups?.[1] ?? "").trim();
          const cwd = context?.cwd ?? process.cwd();
          const candidateWorktree = raw && raw.toLowerCase() !== "current" ? raw : cwd;
          return { mode, candidateWorktree, query: raw, raw };
        },
        loadCandidates: () => ({ candidates: AUTORESEARCH_CANDIDATE_BIND_TRIGGER_CANDIDATES }),
        selectTitle: ({ parsed }: { parsed?: AutoresearchCandidateBindTriggerParsedInput }) => {
          const query = parsed?.query ? `: ${parsed.query}` : " current";
          const mode = parsed?.mode ?? "bind";
          return `Autoresearch candidate ${mode}${query}`;
        },
        applySelection: ({
          parsed,
          context,
          api,
        }: {
          selected?: AutoresearchCandidateBindTriggerCandidate;
          parsed?: AutoresearchCandidateBindTriggerParsedInput;
          context?: AutoresearchTriggerContext;
          api?: AutoresearchTriggerApi;
        }) => {
          const cwd = context?.cwd ?? process.cwd();
          const candidateWorktree = parsed?.candidateWorktree ?? cwd;
          api?.setText?.(
            buildAutoresearchCandidateBindOrMeasureEditorCall(
              cwd,
              candidateWorktree,
              parsed?.mode ?? "bind",
            ),
          );
        },
        onNoCandidates: ({ api }: { api?: AutoresearchTriggerApi }) => {
          api?.notify?.("No autoresearch candidate-bind actions are available.", "warning");
        },
        onError: ({ error, api }: { error?: unknown; api?: AutoresearchTriggerApi }) => {
          api?.notify?.(
            `Autoresearch candidate-bind picker error: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        },
      }),
    );

    registrations.push(
      triggerSurface.registerPickerInteraction({
        id: AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_ID,
        description:
          "pi-autoresearch candidate decision picker for $$ autoresearch candidate|keep|discard|rewind",
        priority: 115,
        match:
          /^\$\$\s*(?:autoresearch|ar)\s+(?:(candidate|decision)(?:\s+([^\n]*))?|(keep|discard|rewind))$/,
        requireCursorAtEnd: true,
        debounceMs: 150,
        showInPicker: true,
        pickerLabel: "$$ autoresearch candidate decision",
        pickerDetail: "Plan keep/discard/rewind without applying worktree actions",
        parseInput: (match: {
          groups?: string[];
        }): AutoresearchCandidateDecisionTriggerParsedInput => {
          const direct = parseAutoresearchCandidateDecisionCommand(
            String(match?.groups?.[2] ?? ""),
          );
          const raw = direct ? String(match?.groups?.[2] ?? "") : String(match?.groups?.[1] ?? "");
          const query = direct ? raw : raw.trim();
          return { query, raw, directAction: direct };
        },
        loadCandidates: ({
          parsed,
          context,
        }: {
          parsed?: AutoresearchCandidateDecisionTriggerParsedInput;
          context?: AutoresearchTriggerContext;
        }) => ({
          candidates: buildAutoresearchCandidateDecisionTriggerCandidates({
            cwd: context?.cwd ?? process.cwd(),
            directAction: parsed?.directAction ?? null,
          }),
        }),
        selectTitle: ({ parsed }: { parsed?: AutoresearchCandidateDecisionTriggerParsedInput }) => {
          const query = parsed?.query ? `: ${parsed.query}` : "";
          return `Autoresearch candidate decision${query}`;
        },
        applySelection: ({
          selected,
          parsed,
          context,
          api,
        }: {
          selected?: AutoresearchCandidateDecisionTriggerCandidate;
          parsed?: AutoresearchCandidateDecisionTriggerParsedInput;
          context?: AutoresearchTriggerContext;
          api?: AutoresearchTriggerApi;
        }) => {
          const fallback = parsed?.directAction
            ? AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES.find(
                (candidate) => candidate.action === parsed.directAction,
              )
            : AUTORESEARCH_CANDIDATE_DECISION_TRIGGER_CANDIDATES[0];
          const selectedDecision = selected ?? fallback;
          if (!selectedDecision) {
            api?.notify?.("No autoresearch candidate-decision action is available.", "warning");
            return;
          }
          const cwd = context?.cwd ?? process.cwd();
          api?.setText?.(
            buildAutoresearchCandidateDecisionEditorCall(cwd, selectedDecision.action),
          );
        },
        onNoCandidates: ({ api }: { api?: AutoresearchTriggerApi }) => {
          api?.notify?.("No autoresearch candidate-decision actions are available.", "warning");
        },
        onError: ({ error, api }: { error?: unknown; api?: AutoresearchTriggerApi }) => {
          api?.notify?.(
            `Autoresearch candidate-decision picker error: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        },
      }),
    );

    registrations.push(
      triggerSurface.registerPickerInteraction({
        id: AUTORESEARCH_LIVE_TRIGGER_ID,
        description: "pi-autoresearch campaign-start picker for $$ autoresearch <objective>",
        priority: 105,
        match: /^\$\$\s*(?:autoresearch|ar)(?:\s+([^\n]*))?$/,
        requireCursorAtEnd: true,
        debounceMs: 150,
        showInPicker: true,
        pickerLabel: "$$ autoresearch picker",
        pickerDetail: "Supervised campaign start modes",
        parseInput: (match: { groups?: string[] }): AutoresearchTriggerParsedInput => {
          const raw = String(match?.groups?.[0] ?? "");
          const objective = raw.trim();
          return { objective, query: objective, raw };
        },
        loadCandidates: () => ({
          candidates: AUTORESEARCH_TRIGGER_CANDIDATES,
        }),
        selectTitle: ({ parsed }: { parsed?: AutoresearchTriggerParsedInput }) => {
          const objective = parsed?.objective ? `: ${parsed.objective}` : "";
          return `Autoresearch campaign start${objective}`;
        },
        applySelection: ({
          selected,
          parsed,
          context,
          api,
        }: {
          selected?: AutoresearchTriggerCandidate;
          parsed?: AutoresearchTriggerParsedInput;
          context?: AutoresearchTriggerContext;
          api?: AutoresearchTriggerApi;
        }) => {
          const objective = parsed?.objective.trim() ?? "";
          if (!objective) {
            api?.setText?.("$$ autoresearch <objective>");
            api?.notify?.(
              "Autoresearch picker needs an objective after '$$ autoresearch'.",
              "warning",
            );
            return;
          }

          const selectedMode = selected ?? AUTORESEARCH_TRIGGER_CANDIDATES[0];
          const cwd = context?.cwd ?? process.cwd();
          api?.setText?.(
            buildAutoresearchCampaignStartToolCall({
              cwd,
              objective,
              setupMode: selectedMode.setupMode,
              runMode: selectedMode.runMode,
              maxIterations: selectedMode.maxIterations,
            }),
          );
        },
        onNoCandidates: ({ api }: { api?: AutoresearchTriggerApi }) => {
          api?.notify?.("No autoresearch campaign-start modes are available.", "warning");
        },
        onError: ({ error, api }: { error?: unknown; api?: AutoresearchTriggerApi }) => {
          api?.notify?.(
            `Autoresearch picker error: ${error instanceof Error ? error.message : String(error)}`,
            "error",
          );
        },
      }),
    );

    return {
      unregister: () => {
        for (const registration of registrations) {
          if (typeof registration?.unregister === "function") registration.unregister();
        }
      },
    };
  } catch {
    return { unregister: () => {} };
  }
}
