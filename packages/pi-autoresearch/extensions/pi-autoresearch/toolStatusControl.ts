// summary: Registers status, evidence packet, resume planning, control, and finalization tool surfaces.
// read_when:
//   - Inspecting autoresearch status actions, operator controls, exports, or finalization workflow.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
} from "./eagerContract.ts";
import { buildAutoresearchAutoContinuationSessionGateForCwd } from "./extensionAutoContinuation.ts";
import type { PiAutoresearchExtensionOptions } from "./extensionOptions.ts";
import { resolveDecisionRuntime } from "./extensionOptions.ts";
import type { AutoresearchLazyModules } from "./lazyModules.ts";
import { assertReadProfileAllowsAction } from "./readProfile.ts";
import { asPiToolParameters, controlSchema, finalizeSchema, statusSchema } from "./schemas.ts";

export function registerAutoresearchStatusControlTools(input: {
  pi: ExtensionAPI;
  options: PiAutoresearchExtensionOptions;
  autoContinuationCounts: Map<string, number>;
  modules: AutoresearchLazyModules;
}): void {
  const { pi, options, autoContinuationCounts, modules } = input;
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

      const runtimeModule = await modules.runtime();
      const {
        applyAutoresearchCandidateInventoryCleanup,
        buildAutoresearchAdapterContractCatalog,
        buildAutoresearchAkEvidencePacket,
        buildAutoresearchCandidateInventoryCleanupPlan,
        buildAutoresearchCandidateResultPacket,
        buildAutoresearchKnowledgeExportPacket,
        buildAutoresearchOracleEvidencePacket,
        buildAutoresearchResumeApplyPlan,
        buildAutoresearchResumePlan,
        buildAutoresearchRuntimeStatus,
        buildAutoresearchSegmentCloseout,
        formatAutoresearchAdapterContractCatalog,
        formatAutoresearchAdapterPacketValidationResult,
        formatAutoresearchAkEvidencePacket,
        formatAutoresearchCampaignGoalStatus,
        formatAutoresearchCandidateInventoryCleanupPlan,
        formatAutoresearchCandidateResultExportResult,
        formatAutoresearchCandidateResultPacket,
        formatAutoresearchDashboard,
        formatAutoresearchDecisionResult,
        formatAutoresearchKnowledgeExportPacket,
        formatAutoresearchLearningExportResult,
        formatAutoresearchOracleEvidenceExportResult,
        formatAutoresearchOracleEvidencePacket,
        formatAutoresearchResumeApplyPlan,
        formatAutoresearchResumePlan,
        formatAutoresearchSegmentCloseout,
        formatAutoresearchStatusText,
        requestAutoresearchFinalizeDecision,
        requestAutoresearchSetupDecision,
        validateAutoresearchAdapterPacket,
        writeAutoresearchCandidateResultPacket,
        writeAutoresearchKnowledgeExportPacket,
        writeAutoresearchOracleEvidencePacket,
      } = runtimeModule;

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
          runtime: resolveDecisionRuntime(ctx, signal, options, modules),
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
          runtime: resolveDecisionRuntime(ctx, signal, options, modules),
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

      const {
        buildAutoresearchRuntimeStatus,
        formatAutoresearchCampaignGoalStatus,
        formatAutoresearchControlResult,
        inspectAutoresearchRuntimeControl,
        setAutoresearchCampaignGoalControl,
        setAutoresearchRuntimeControl,
      } = await modules.runtime();

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
      const { executeAutoresearchFinalization, formatAutoresearchFinalizationResult } =
        await modules.finalize();
      const result = await executeAutoresearchFinalization({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        action: request.action,
        reason: request.reason,
        runtime:
          request.action === "plan"
            ? resolveDecisionRuntime(ctx, signal, options, modules)
            : undefined,
        model: ctx.model?.id,
        signal,
      });

      return {
        content: [{ type: "text", text: formatAutoresearchFinalizationResult(result) }],
        details: result,
      };
    },
  });
}
