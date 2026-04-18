import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  type AutoresearchDecisionRuntime,
  createAutoresearchDecisionRuntime,
} from "../src/core/decisions.ts";
import {
  executeAutoresearchFinalization,
  formatAutoresearchFinalizationResult,
} from "../src/core/finalize.ts";
import {
  AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
  executeLlamacppCampaignStage,
  formatLlamacppCampaignResult,
  persistLlamacppCampaignProjection,
  planLlamacppCampaignMatrix,
  prepareLlamacppCampaignFork,
} from "../src/core/llamacppCampaign.ts";
import {
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_CONTROL_TOOL_NAME,
  AUTORESEARCH_FINALIZE_TOOL_NAME,
  AUTORESEARCH_RUN_TOOL_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  buildAutoresearchHelpText,
  buildAutoresearchRuntimeStatus,
  executeAutoresearchRun,
  formatAutoresearchControlResult,
  formatAutoresearchDecisionResult,
  formatAutoresearchRunResult,
  formatAutoresearchStatusText,
  inspectAutoresearchRuntimeControl,
  requestAutoresearchFinalizeDecision,
  requestAutoresearchSetupDecision,
  setAutoresearchRuntimeControl,
} from "../src/core/runtime.ts";

const stringArraySchema = Type.Array(Type.String());
const nullableStringSchema = Type.Union([
  Type.String(),
  Type.Null({ description: "Explicitly clear this string value." }),
]);
const statusActionSchema = Type.Union(
  [Type.Literal("status"), Type.Literal("setup"), Type.Literal("finalize")],
  {
    description:
      "Inspect status, or request a governed setup/finalize Prompt Vault packet through the bounded runtime surface.",
  },
);

const statusSchema = Type.Object({
  action: Type.Optional(statusActionSchema),
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for runtime reporting" })),
  optimizationObjective: Type.Optional(
    Type.String({
      description:
        "Required for action=setup. The bounded optimization objective for the setup packet.",
    }),
  ),
  repoContext: Type.Optional(stringArraySchema),
  filesInScope: Type.Optional(stringArraySchema),
  offLimits: Type.Optional(stringArraySchema),
  benchmarkSurfaces: Type.Optional(stringArraySchema),
  existingArtifacts: Type.Optional(stringArraySchema),
  hardConstraints: Type.Optional(stringArraySchema),
  blockers: Type.Optional(stringArraySchema),
  akTaskId: Type.Optional(
    Type.Number({ description: "Optional AK task id reference for action=setup.", minimum: 1 }),
  ),
  akScopeSummary: Type.Optional(stringArraySchema),
  akAllowedPaths: Type.Optional(stringArraySchema),
  akRequiredPaths: Type.Optional(stringArraySchema),
  keptRuns: Type.Optional(stringArraySchema),
  campaignContext: Type.Optional(stringArraySchema),
  mergeBase: Type.Optional(nullableStringSchema),
  trunkTarget: Type.Optional(nullableStringSchema),
  commitSummaries: Type.Optional(stringArraySchema),
  dependencyNotes: Type.Optional(stringArraySchema),
  ideasToLeaveOut: Type.Optional(stringArraySchema),
});

const controlActionSchema = Type.Union([Type.Literal("status"), Type.Literal("set")], {
  description:
    "Inspect the current operator control overlay or set an explicit continue/rebaseline/finalize/stop decision.",
});

const controlDecisionSchema = Type.Union(
  [
    Type.Literal("continue"),
    Type.Literal("rebaseline"),
    Type.Literal("finalize"),
    Type.Literal("stop"),
  ],
  {
    description: "Explicit operator control decision for the current bounded runtime posture.",
  },
);

const controlSchema = Type.Object({
  action: Type.Optional(controlActionSchema),
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for control inspection." })),
  decision: Type.Optional(controlDecisionSchema),
  reason: Type.Optional(
    Type.String({
      description: "Optional short reason for the selected control decision.",
    }),
  ),
});

const finalizeActionSchema = Type.Union(
  [
    Type.Literal("status"),
    Type.Literal("plan"),
    Type.Literal("approve"),
    Type.Literal("materialize"),
  ],
  {
    description:
      "Inspect the current finalization plan state, refresh/reuse a plan, record approval, or materialize local review branches.",
  },
);

const finalizeSchema = Type.Object({
  action: Type.Optional(finalizeActionSchema),
  cwd: Type.Optional(
    Type.String({ description: "Optional cwd override for finalization actions." }),
  ),
  reason: Type.Optional(
    Type.String({
      description: "Optional short reason for approve/materialize actions.",
    }),
  ),
});

const directionSchema = Type.Union([Type.Literal("lower"), Type.Literal("higher")], {
  description: "Whether lower or higher metric values are better.",
});

const campaignActionSchema = Type.Union(
  [Type.Literal("plan_matrix"), Type.Literal("prepare_fork"), Type.Literal("execute_stage")],
  {
    description:
      "Load a typed llama.cpp benchmark campaign manifest, either expand the exact 41/42/43 branch-lane matrix, plan/apply the fork workspace preparation, or plan/apply one exact stage invocation.",
  },
);

const campaignStageSchema = Type.Union(
  [Type.Literal("41"), Type.Literal("42"), Type.Literal("43")],
  {
    description: "Only for action=execute_stage. Select the exact workstation stage to bind.",
  },
);

const campaignSchema = Type.Object({
  action: Type.Optional(campaignActionSchema),
  cwd: Type.Optional(
    Type.String({
      description:
        "Optional cwd override for manifest loading, fork preparation, and stage execution binding.",
    }),
  ),
  manifestPath: Type.String({
    description: "Path to the checked campaign manifest JSON relative to cwd or absolute.",
  }),
  stage: Type.Optional(campaignStageSchema),
  buildId: Type.Optional(
    Type.String({
      description:
        "Only for action=execute_stage. Exact manifest-listed build id to bind to the selected stage.",
    }),
  ),
  apply: Type.Optional(
    Type.Boolean({
      description:
        "For action=prepare_fork or action=execute_stage. When true, apply the fork/stage action instead of only printing the plan.",
    }),
  ),
});

const runSchema = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for the bounded runtime" })),
  description: Type.String({
    description: "Short description of what this bounded run is trying.",
  }),
  name: Type.Optional(
    Type.String({
      description:
        "Campaign name. Required when bootstrapping the first config receipt or reconfiguring the bounded runtime.",
    }),
  ),
  metricName: Type.Optional(
    Type.String({
      description:
        "Primary metric name. Required when bootstrapping the first config receipt or reconfiguring the bounded runtime.",
    }),
  ),
  metricUnit: Type.Optional(
    Type.String({ description: "Primary metric unit (defaults to empty string)." }),
  ),
  direction: Type.Optional(directionSchema),
  benchmarkCommand: Type.Optional(
    Type.String({
      description:
        "Benchmark command override. Defaults to the config receipt command or 'bash autoresearch.sh' when present.",
    }),
  ),
  checksCommand: Type.Optional(
    Type.Union([
      Type.String({ description: "Checks command override." }),
      Type.Null({ description: "Pass null to disable checks for this run." }),
    ]),
  ),
  timeoutSeconds: Type.Optional(
    Type.Number({ description: "Benchmark timeout in seconds (default: 600).", minimum: 1 }),
  ),
  checksTimeoutSeconds: Type.Optional(
    Type.Number({ description: "Checks timeout in seconds (default: 300).", minimum: 1 }),
  ),
  reconfigure: Type.Optional(
    Type.Boolean({
      description:
        "Append a new config receipt before this run. Requires name + metricName and resets the current segment.",
    }),
  ),
  decisionGoal: Type.Optional(
    Type.String({
      description:
        "When set, request a governed Prompt Vault next-hypothesis decision after the run using this bounded goal.",
    }),
  ),
  decisionConstraints: Type.Optional(stringArraySchema),
  decisionFilesInScope: Type.Optional(stringArraySchema),
  decisionOffLimits: Type.Optional(stringArraySchema),
  decisionIdeasBacklog: Type.Optional(stringArraySchema),
  decisionAsiNotes: Type.Optional(stringArraySchema),
  decisionDeadEndMemory: Type.Optional(stringArraySchema),
});

export interface PiAutoresearchExtensionOptions {
  createDecisionRuntime?: (
    ctx: ExtensionContext,
    signal: AbortSignal | undefined,
  ) => AutoresearchDecisionRuntime;
}

export function registerPiAutoresearchExtension(
  pi: ExtensionAPI,
  options: PiAutoresearchExtensionOptions = {},
): void {
  pi.registerCommand(AUTORESEARCH_COMMAND_NAME, {
    description: "Open the pi-autoresearch bounded-runtime overview",
    handler: async (args, ctx) => {
      await openAutoresearchShell(args, ctx);
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_STATUS_TOOL_NAME,
    label: "Autoresearch Runtime Status",
    description:
      "Inspect the current pi-autoresearch bounded runtime, or request a governed setup/finalize packet through the existing runtime surface.",
    promptSnippet:
      "Inspect the current pi-autoresearch bounded runtime, machine projection, receipt log, event ledger, and optionally request a governed setup/finalize packet.",
    parameters: statusSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        action?: "status" | "setup" | "finalize";
        cwd?: string;
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

      const status = buildAutoresearchRuntimeStatus(cwd);
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
    parameters: controlSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        action?: "status" | "set";
        cwd?: string;
        decision?: "continue" | "rebaseline" | "finalize" | "stop";
        reason?: string;
      };
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();
      const action = request.action ?? "status";

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
    parameters: finalizeSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        action?: "status" | "plan" | "approve" | "materialize";
        cwd?: string;
        reason?: string;
      };
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
    parameters: runSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const request = params as {
        cwd?: string;
        description: string;
        name?: string;
        metricName?: string;
        metricUnit?: string;
        direction?: "lower" | "higher";
        benchmarkCommand?: string;
        checksCommand?: string | null;
        timeoutSeconds?: number;
        checksTimeoutSeconds?: number;
        reconfigure?: boolean;
        decisionGoal?: string;
        decisionConstraints?: string[];
        decisionFilesInScope?: string[];
        decisionOffLimits?: string[];
        decisionIdeasBacklog?: string[];
        decisionAsiNotes?: string[];
        decisionDeadEndMemory?: string[];
      };

      const result = await executeAutoresearchRun({
        cwd: request.cwd ?? ctx.cwd ?? process.cwd(),
        description: request.description,
        name: request.name,
        metricName: request.metricName,
        metricUnit: request.metricUnit,
        direction: request.direction,
        benchmarkCommand: request.benchmarkCommand,
        checksCommand: request.checksCommand,
        timeoutSeconds: request.timeoutSeconds,
        checksTimeoutSeconds: request.checksTimeoutSeconds,
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
    name: AUTORESEARCH_LLAMACPP_CAMPAIGN_TOOL_NAME,
    label: "Autoresearch llama.cpp Campaign",
    description:
      "Load a typed llama.cpp benchmark campaign manifest, emit the exact 41/42/43 branch-lane matrix, plan/apply fork preparation, and plan/apply one exact stage invocation against the current workstation scripts.",
    promptSnippet:
      "Use this tool when the user wants a deterministic branch/benchmark matrix, fork preparation plan, or one exact 41/42/43 stage binding for a brownfield llama.cpp campaign.",
    promptGuidelines: [
      "Use this tool instead of freeform planning when the user names branches, cherry-picks, lanes, or the 41/42/43 workflow.",
      "Prefer action=plan_matrix before action=execute_stage so branch/lane intent is explicit before script binding.",
      "Use action=prepare_fork with apply=true only when the user clearly wants the fork workspace created or switched.",
      "Use action=execute_stage for one exact build/stage, not as a whole-campaign runner.",
    ],
    parameters: campaignSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as {
        action?: "plan_matrix" | "prepare_fork" | "execute_stage";
        cwd?: string;
        manifestPath: string;
        stage?: "41" | "42" | "43";
        buildId?: string;
        apply?: boolean;
      };
      const cwd = request.cwd ?? ctx.cwd ?? process.cwd();
      const action = request.action ?? "plan_matrix";
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
            : planLlamacppCampaignMatrix({
                cwd,
                manifestPath: request.manifestPath,
              });
      const projection = persistLlamacppCampaignProjection({
        cwd,
        manifestPath: request.manifestPath,
      });
      const text = [
        formatLlamacppCampaignResult(result),
        "",
        "## Projection",
        `- path: ${projection.path}`,
        `- campaign: ${projection.projection.manifest.campaignId}`,
        `- overall state: ${projection.projection.status.overallState}`,
      ].join("\n");

      return {
        content: [{ type: "text", text }],
        details: {
          ...result,
          projectionPath: projection.path,
          projection: projection.projection,
        },
      };
    },
  });
}

export default function piAutoresearchExtension(pi: ExtensionAPI): void {
  registerPiAutoresearchExtension(pi);
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

async function openAutoresearchShell(args: string, ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI) return;

  const normalizedArgs = args.trim();
  const status = buildAutoresearchRuntimeStatus(ctx.cwd);

  if (normalizedArgs.length > 0 && normalizedArgs !== "help" && normalizedArgs !== "status") {
    ctx.ui.notify(
      "The autonomous loop is still out of scope. Opened the bounded runtime overview instead; use autoresearch_runtime_control for continue/rebaseline/finalize/stop, autoresearch_runtime_finalize for plan/approve/materialize, autoresearch_runtime_run for machine/ledger-backed runs, or autoresearch_runtime_status with action=setup|finalize for governed packets.",
      "info",
    );
  }

  await ctx.ui.editor("pi-autoresearch", buildAutoresearchHelpText(status));
}
