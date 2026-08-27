// ---
// summary: "Registers the bounded manifest, self-hosting, and learning autoresearch adapter tools."
// read_when:
//   - "Changing autoresearch adapter schemas, rendering, or owner-seam behavior."
// ---

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  type AutoresearchLearningKesAdapterAction,
  buildAutoresearchLearningKesAdapterResult,
  loadAutoresearchLearningPacketWithSource,
} from "../src/runtime/autoresearch-learning-kes-adapter.ts";
import type { AutoresearchManifestCampaignSupervisor } from "../src/runtime/autoresearch-manifest-campaign-supervision.ts";
import type {
  AutoresearchLearningKesAdapterToolDetails,
  AutoresearchManifestCampaignSupervisionAction,
  AutoresearchManifestCampaignSupervisionToolDetails,
  AutoresearchSelfHostingSupervisionToolDetails,
} from "../src/runtime/autoresearch-report-format.ts";
import {
  formatAutoresearchLearningKesAdapterReport,
  formatAutoresearchManifestCampaignEvidenceReport,
  formatAutoresearchManifestCampaignObservationReport,
  formatAutoresearchSelfHostingEvidenceReport,
  formatAutoresearchSelfHostingObservationReport,
} from "../src/runtime/autoresearch-report-format.ts";
import type {
  AutoresearchSelfHostingSupervisionAction,
  AutoresearchSelfHostingSupervisor,
} from "../src/runtime/autoresearch-self-hosting-supervision.ts";
import {
  createAutoresearchLearningKesAdapterToolResult,
  createAutoresearchManifestCampaignToolResult,
  createAutoresearchSelfHostingToolResult,
} from "./autoresearch-tool-adapters.ts";

type CompatToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "parameters"> & {
  parameters?: unknown;
};

function registerCompatTool(pi: ExtensionAPI, tool: CompatToolDefinition): void {
  pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
}

export interface AutoresearchAdapterRegistrationOptions {
  manifestCampaignSupervisor: AutoresearchManifestCampaignSupervisor;
  selfHostingSupervisor: AutoresearchSelfHostingSupervisor;
  autoresearchLearningKesPackageRoot: string;
}

export function registerAutoresearchAdapterTools(
  pi: ExtensionAPI,
  options: AutoresearchAdapterRegistrationOptions,
): void {
  const { manifestCampaignSupervisor, selfHostingSupervisor, autoresearchLearningKesPackageRoot } =
    options;
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
}
