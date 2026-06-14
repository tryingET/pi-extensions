import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
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
} from "../../src/core/selfHosting.ts";
import type { PiAutoresearchExtensionOptions } from "./extensionOptions.ts";
import { assertReadProfileRejectsTool } from "./readProfile.ts";
import { asPiToolParameters, selfHostingSchema } from "./schemas.ts";
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
} from "./selfHostingFormat.ts";

export function registerAutoresearchSelfHostingTool(
  pi: ExtensionAPI,
  options: PiAutoresearchExtensionOptions,
): void {
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
}
