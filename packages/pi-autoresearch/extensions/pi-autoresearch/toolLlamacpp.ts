// ---
// summary: "Registers public and low-level llama.cpp campaign tools with read-profile enforcement and optional projection persistence."
// read_when:
//   - "Changing llama.cpp tool guidance, action dispatch, read-profile policy, projection writes, or returned campaign details."
// ---
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
} from "../../src/core/llamacppCampaign.ts";
import type { PiAutoresearchExtensionOptions } from "./extensionOptions.ts";
import { assertReadProfileAllowsAction } from "./readProfile.ts";
import { asPiToolParameters, campaignControlSchema, campaignSchema } from "./schemas.ts";

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

export function registerAutoresearchLlamacppTools(
  pi: ExtensionAPI,
  options: PiAutoresearchExtensionOptions,
): void {
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
