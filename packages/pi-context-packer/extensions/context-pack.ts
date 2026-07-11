import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { CONTEXT_PACK_PARAMETERS, contextPacketToolResult } from "../src/context-pack.js";
import {
  buildContextPlan,
  CONTEXT_PLAN_PARAMETERS,
  compactContextPlanDetails,
  formatContextPlan,
} from "../src/context-plan.js";
import {
  DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS,
  DOGFOOD_OBSERVATION_EVALUATION_PARAMETERS,
  dogfoodAggregateEvaluationToolResult,
  dogfoodObservationEvaluationToolResult,
} from "../src/dogfood-observation.js";

export const CONTEXT_PACKER_REGISTERED_TOOL_CONTRACT = Object.freeze({
  package: "@tryinget/pi-context-packer",
  registeredToolContract: "context-packer-registered-tools-v1",
  runtimeBuild: "provider-capabilities-docs-buffer-v2",
  requiresCompactContextPlanDetails: true,
});

type RuntimeDetails = Record<string, unknown>;
type ContextPackerToolResult = AgentToolResult<RuntimeDetails>;
type ContextPackerToolDefinition = Omit<Parameters<ExtensionAPI["registerTool"]>[0], "execute"> & {
  execute: (
    toolCallId: string,
    rawParams: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: ExtensionContext,
  ) => Promise<ContextPackerToolResult>;
};

type SmokeDetails = {
  runtimeContract?: { registeredToolContract?: unknown };
  redaction?: { rawSeedsOmitted?: unknown };
  ok?: unknown;
  dogfoodObservationEvaluation?: { status?: unknown };
  dogfoodAggregateEvaluation?: { validReceiptCount?: unknown };
};

const withRuntimeContract = (details: RuntimeDetails = {}) => ({
  ...details,
  runtimeContract: CONTEXT_PACKER_REGISTERED_TOOL_CONTRACT,
});

const textResult = (text: string, details: RuntimeDetails = {}): ContextPackerToolResult => ({
  content: [{ type: "text" as const, text }],
  details: withRuntimeContract(details),
});

const asToolResult = async (result: Promise<unknown>): Promise<ContextPackerToolResult> =>
  (await result) as ContextPackerToolResult;

const truthyEnv = (value: string | undefined) => /^(1|true|yes)$/iu.test(value ?? "");

const contextEnv = (ctx: ExtensionContext | undefined, signal?: AbortSignal) => ({
  cwd: ctx?.cwd,
  systemPrompt: ctx?.getSystemPrompt?.(),
  contextUsage: ctx?.getContextUsage?.(),
  modelLabel: ctx?.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
  sciReadOnlySafe: truthyEnv(process.env.PI_CONTEXT_PACKER_SCI_READ_ONLY_SAFE),
  signal,
});

function assertSmoke(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const resultText = (result: ContextPackerToolResult | undefined) => {
  const firstContent = result?.content?.[0];
  return firstContent?.type === "text" ? firstContent.text : "";
};

const smokeDetails = (result: ContextPackerToolResult | undefined) =>
  result?.details as SmokeDetails | undefined;

const contextPackerToolDefinition = (name: string) => {
  const definition = contextPackerToolDefinitionByName.get(name);
  assertSmoke(definition, `${name} tool definition missing from local registration table`);
  return definition;
};

const pathIsInsideOrEqual = (candidatePath: string, rootPath: string) => {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath));
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith(sep));
};

const contextPlanTool: ContextPackerToolDefinition = {
  name: "context_plan",
  label: "Context Plan",
  description:
    "Plan a read-only context packet across source-owned providers such as SCI, docs, repo-bounded AGENTS/CLAUDE instruction projection, git, session context, Prompt Vault, AK, and FCOS without retrieving or mutating source data.",
  promptSnippet:
    "Use context_plan before broad context gathering when you need to reduce raw read/search tool calls and preserve source-owner authority boundaries.",
  promptGuidelines: [
    "Use context_plan for cross-source planning before collecting large code/docs/task context.",
    "Treat the result as a read-only plan and provider-boundary membrane, not as task/evidence authority.",
    "Use SCI for code context and separate docs/repo-bounded AGENTS/CLAUDE/AK/FCOS/Prompt Vault providers for non-code context.",
    "Follow owner-surface recommendations directly when the task needs self, subagent execution, peer messaging/launch, workflow supervision, AK/FCOS authority, or Prompt Vault governance.",
  ],
  parameters: CONTEXT_PLAN_PARAMETERS,
  async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const plan = buildContextPlan(
      rawParams as Parameters<typeof buildContextPlan>[0],
      contextEnv(ctx, signal),
    );
    signal?.throwIfAborted();
    return textResult(formatContextPlan(plan), compactContextPlanDetails(plan));
  },
};

const contextPackTool: ContextPackerToolDefinition = {
  name: "context_pack",
  label: "Context Pack",
  description:
    "Assemble a bounded read-only context packet from wired providers such as repo-bounded AGENTS/CLAUDE instruction files, Markdown/docs-list, git status, session metadata, and SCI seeded code context, while recording omissions and owner-surface routes for unavailable or authority-sensitive providers.",
  promptSnippet:
    "Use context_pack after context_plan when a small read-only packet from repo-bounded AGENTS/CLAUDE/docs/git plus explicit provider omissions can reduce raw read/search tool calls.",
  promptGuidelines: [
    "Use context_pack only for read-only packet assembly; it must not mutate files, git, AK, FCOS, Prompt Vault, SCI, ASC, or peer tooling.",
    "Treat packet content as a projection with provenance and omissions, not source-owner authority.",
    "Expect early MVP omissions for providers that are planned but not wired yet.",
    "Treat owner-surface routing as advice only; context_pack does not call self, spawn subagents, message peers, launch worktrees, or move authority.",
  ],
  parameters: CONTEXT_PACK_PARAMETERS,
  async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
    signal?.throwIfAborted();
    const result = await asToolResult(
      contextPacketToolResult(
        rawParams as Parameters<typeof contextPacketToolResult>[0],
        contextEnv(ctx, signal),
      ),
    );
    return { ...result, details: withRuntimeContract(result.details) };
  },
};

const dogfoodEvaluateTool: ContextPackerToolDefinition = {
  name: "context_dogfood_evaluate",
  label: "Context Dogfood Evaluate",
  description:
    "Evaluate a filled context_pack_dogfood_observation_v1 receipt locally without persisting evidence, reading files, invoking providers, or moving AK/FCOS/session authority.",
  promptSnippet:
    "Use context_dogfood_evaluate after filling a context_pack dogfood observation template to compare predicted usefulness with observed low-level read/search/status probes.",
  promptGuidelines: [
    "Use only with redacted context_pack_dogfood_observation_v1 templates; do not paste raw packet content or secrets into observation notes.",
    "Treat the result as packet-local dogfood calibration, not AK evidence, FCOS closeout, session memory, or proof of task completion.",
    "Review overestimated/underestimated/needs_review outcomes before changing ranking or adding provider adapters.",
  ],
  parameters: DOGFOOD_OBSERVATION_EVALUATION_PARAMETERS,
  async execute(_toolCallId, rawParams) {
    const result = await asToolResult(
      dogfoodObservationEvaluationToolResult(
        rawParams as Parameters<typeof dogfoodObservationEvaluationToolResult>[0],
      ),
    );
    return { ...result, details: withRuntimeContract(result.details) };
  },
};

const dogfoodSummarizeTool: ContextPackerToolDefinition = {
  name: "context_dogfood_summarize",
  label: "Context Dogfood Summarize",
  description:
    "Summarize multiple redacted context_pack dogfood observations or evaluations locally without persisting evidence, reading files, invoking providers, or moving owner-surface authority.",
  promptSnippet:
    "Use context_dogfood_summarize to compare repeated redacted dogfood receipts before tuning ranking or adding provider adapters.",
  promptGuidelines: [
    "Use only with redacted context_pack dogfood observations/evaluations; do not paste raw packet content, selected paths, or secrets.",
    "Treat aggregate output as packet-local calibration, not AK evidence, FCOS closeout, session memory, or provider authority.",
    "Review invalid, overestimated, or needs_review clusters before making product or provider changes.",
  ],
  parameters: DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS,
  async execute(_toolCallId, rawParams) {
    const result = await asToolResult(
      dogfoodAggregateEvaluationToolResult(
        rawParams as Parameters<typeof dogfoodAggregateEvaluationToolResult>[0],
      ),
    );
    return { ...result, details: withRuntimeContract(result.details) };
  },
};

const CONTEXT_PACKER_TOOL_DEFINITIONS = [
  contextPlanTool,
  contextPackTool,
  dogfoodEvaluateTool,
  dogfoodSummarizeTool,
] as const;

const CONTEXT_PACKER_TOOL_NAMES = CONTEXT_PACKER_TOOL_DEFINITIONS.map((tool) => tool.name);
const contextPackerToolDefinitionByName = new Map(
  CONTEXT_PACKER_TOOL_DEFINITIONS.map((tool) => [tool.name, tool]),
);

const runtimeSmokeContext = (workspace: string, ctx: ExtensionContext | undefined) =>
  ({
    cwd: workspace,
    getSystemPrompt: () => ctx?.getSystemPrompt?.() ?? "",
    getContextUsage: () => ctx?.getContextUsage?.() ?? { usedTokens: 0, maxTokens: 100000 },
    model: ctx?.model,
  }) as ExtensionContext;

export async function runContextPackerRegisteredToolSmoke(
  pi: Pick<ExtensionAPI, "getAllTools" | "getCommands">,
  ctx?: ExtensionContext,
) {
  const registeredTools = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
  const commands = pi.getCommands();
  const expectedSourceRoot = process.env.INSTALLED_PACKAGE_ROOT;

  for (const name of CONTEXT_PACKER_TOOL_NAMES) {
    const registeredTool = registeredTools.get(name);
    assertSmoke(registeredTool, `${name} tool not registered`);
    assertSmoke(
      registeredTool.sourceInfo?.source !== "builtin" &&
        registeredTool.sourceInfo?.source !== "sdk",
      `${name} registered from unexpected source: ${registeredTool.sourceInfo?.source}`,
    );
    assertSmoke(registeredTool.description, `${name} missing description`);
    assertSmoke(registeredTool.parameters, `${name} missing parameters`);
    if (expectedSourceRoot) {
      assertSmoke(
        pathIsInsideOrEqual(String(registeredTool.sourceInfo?.path ?? ""), expectedSourceRoot),
        `${name} registered from ${registeredTool.sourceInfo?.path ?? "unknown"}, expected ${expectedSourceRoot}`,
      );
    }
  }

  for (const commandName of ["context-pack", "context-packer-release-smoke"]) {
    const command = commands.find((candidate) => candidate.name === commandName);
    assertSmoke(command, `${commandName} command not registered`);
    assertSmoke(
      command.source === "extension" || command.sourceInfo?.source === "extension",
      `${commandName} command registered from unexpected source: ${command.source}`,
    );
    if (expectedSourceRoot) {
      assertSmoke(
        pathIsInsideOrEqual(String(command.sourceInfo?.path ?? ""), expectedSourceRoot),
        `${commandName} command registered from ${command.sourceInfo?.path ?? "unknown"}, expected ${expectedSourceRoot}`,
      );
    }
  }

  const workspace = await mkdtemp(join(tmpdir(), "pi-context-packer-runtime-tool-smoke-"));
  try {
    await mkdir(join(workspace, "docs", "project"), { recursive: true });
    await writeFile(join(workspace, "AGENTS.md"), "# Runtime AGENTS\n\nRead-only smoke.\n", "utf8");
    await writeFile(
      join(workspace, "docs", "project", "smoke.md"),
      "# Runtime Smoke\n\nInstalled context_pack can read seeded Markdown.\n",
      "utf8",
    );

    const runtimeContext = runtimeSmokeContext(workspace, ctx);
    const baseParams = {
      objective: "Installed runtime smoke for context-packer tools",
      cwd: workspace,
      repoRoot: workspace,
      providers: { agents: "required", docs: "required", git: "off", sci: "off", session: "off" },
    };

    const registeredPlanResult = await contextPackerToolDefinition("context_plan").execute(
      "release-smoke-context-plan",
      {
        ...baseParams,
        objective: "Installed registered context_plan wrapper smoke",
        seeds: [
          { kind: "path", value: join(workspace, "docs", "project", "smoke.md") },
          { kind: "path", value: "/etc/passwd" },
          { kind: "path", value: "/etc/hosts" },
        ],
      },
      undefined,
      undefined,
      runtimeContext,
    );
    const registeredPlanText = resultText(registeredPlanResult);
    const registeredPlanDetails = smokeDetails(registeredPlanResult);
    assertSmoke(
      registeredPlanText.includes("absolute/home-relative path seed omitted (2 seeds)"),
      "registered context_plan wrapper did not group unsafe absolute seed risks",
    );
    assertSmoke(
      !registeredPlanText.includes(
        "absolute/home-relative path seed omitted\n- blocked: absolute/home-relative",
      ),
      "registered context_plan wrapper repeated unsafe absolute seed risk rows",
    );
    assertSmoke(
      registeredPlanDetails?.runtimeContract?.registeredToolContract ===
        "context-packer-registered-tools-v1",
      `registered context_plan wrapper missing runtime contract: ${JSON.stringify(registeredPlanDetails)}`,
    );
    assertSmoke(
      registeredPlanDetails?.redaction?.rawSeedsOmitted,
      "registered context_plan wrapper did not return compact redacted details",
    );

    const registeredPackResult = await contextPackerToolDefinition("context_pack").execute(
      "release-smoke-context-pack",
      {
        ...baseParams,
        seeds: [{ kind: "path", value: "docs/project/smoke.md" }],
      },
      undefined,
      undefined,
      runtimeContext,
    );
    const registeredPackDetails = smokeDetails(registeredPackResult);
    assertSmoke(
      registeredPackDetails?.ok,
      `registered context_pack wrapper execution failed: ${JSON.stringify(registeredPackDetails)}`,
    );
    assertSmoke(
      registeredPackDetails?.runtimeContract?.registeredToolContract ===
        "context-packer-registered-tools-v1",
      `registered context_pack wrapper missing runtime contract: ${JSON.stringify(registeredPackDetails)}`,
    );
    assertSmoke(
      resultText(registeredPackResult).includes("Runtime Smoke"),
      "registered context_pack wrapper did not include seeded Markdown packet content",
    );

    const evaluationResult = await contextPackerToolDefinition("context_dogfood_evaluate").execute(
      "release-smoke-context-dogfood-evaluate",
      {
        observation: {
          kind: "context_pack_dogfood_observation_v1",
          prediction: {
            expectedLowLevelCallsAvoided: 1,
            packetUtilityRecommendationStatus: "use_packet",
          },
          observation: {
            runtimeContext: "installed_registered_tool_closure",
            actualLowLevelReadSearchStatusCalls: 0,
            actualLowLevelCallsAvoided: 1,
            validationCommandsRun: 0,
            duplicateReadsObserved: false,
            omissionFollowupsUsed: [],
            recommendationMatchedOutcome: true,
            notes: "installed runtime release smoke",
          },
        },
      },
      undefined,
      undefined,
      runtimeContext,
    );
    const evaluationDetails = smokeDetails(evaluationResult);
    const dogfoodObservationEvaluation = evaluationDetails?.dogfoodObservationEvaluation;
    assertSmoke(
      dogfoodObservationEvaluation?.status === "matched",
      `registered context_dogfood_evaluate execution failed: ${JSON.stringify(evaluationDetails)}`,
    );
    assertSmoke(
      evaluationDetails?.runtimeContract?.registeredToolContract ===
        "context-packer-registered-tools-v1",
      "registered context_dogfood_evaluate wrapper missing runtime contract",
    );

    const aggregateResult = await contextPackerToolDefinition("context_dogfood_summarize").execute(
      "release-smoke-context-dogfood-summarize",
      { evaluations: [dogfoodObservationEvaluation] },
      undefined,
      undefined,
      runtimeContext,
    );
    const aggregateDetails = smokeDetails(aggregateResult);
    assertSmoke(
      aggregateDetails?.dogfoodAggregateEvaluation?.validReceiptCount === 1,
      `registered context_dogfood_summarize execution failed: ${JSON.stringify(aggregateDetails)}`,
    );
    assertSmoke(
      aggregateDetails?.runtimeContract?.registeredToolContract ===
        "context-packer-registered-tools-v1",
      "registered context_dogfood_summarize wrapper missing runtime contract",
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export default function contextPackerExtension(pi: ExtensionAPI) {
  pi.registerCommand("context-pack", {
    description: "Preview the read-only context-packer planning surface",
    handler: async (_args, ctx) => {
      const plan = buildContextPlan(
        {
          objective:
            "Plan a read-only context packet for the current task using source-owned providers.",
          cwd: ctx.cwd,
        },
        contextEnv(ctx),
      );
      const message = formatContextPlan(plan);
      if (ctx.hasUI) {
        ctx.ui.notify(message, "info");
        return;
      }
      console.log(message);
    },
  });

  pi.registerCommand("context-packer-release-smoke", {
    description:
      "Assert installed context-packer command/tool registration and registered tool closure execution",
    handler: async (_args, ctx) => {
      await runContextPackerRegisteredToolSmoke(pi, ctx);
      console.log("context-packer runtime registration and registered tool closure execution OK");
    },
  });

  for (const tool of CONTEXT_PACKER_TOOL_DEFINITIONS) {
    pi.registerTool(tool as Parameters<ExtensionAPI["registerTool"]>[0]);
  }
}
