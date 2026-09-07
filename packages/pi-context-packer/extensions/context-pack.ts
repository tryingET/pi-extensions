/**
summary: "Register context planning, packet assembly, and dogfood evaluation tools with Pi."
read_when:
  - "You change context-packer tool registration, command behavior, or installed runtime smoke coverage."
*/

import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { activeCodeWorkingSet } from "../src/code-working-set.js";
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
import { runRipwireRuntimeSmoke } from "../src/ripwire-runtime-smoke.ts";
import { runRegisteredToolSmoke } from "../src/runtime-smoke.ts";

export const CONTEXT_PACKER_REGISTERED_TOOL_CONTRACT = Object.freeze({
  package: "@tryinget/pi-context-packer",
  registeredToolContract: "context-packer-registered-tools-v1",
  runtimeBuild: "ripwire-discovery-v1",
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

const contextEnv = (ctx: ExtensionContext | undefined, signal?: AbortSignal) => ({
  cwd: ctx?.cwd,
  workingSet: activeCodeWorkingSet(ctx),
  ripwire: { cacheRoot: process.env.PI_CONTEXT_PACKER_RIPWIRE_CACHE_ROOT },
  systemPrompt: ctx?.getSystemPrompt?.(),
  contextUsage: ctx?.getContextUsage?.(),
  modelLabel: ctx?.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
  signal,
});

const contextPlanTool: ContextPackerToolDefinition = {
  name: "context_plan",
  label: "Context Plan",
  description:
    "Plan a read-only context packet across source-owned providers such as ripwire code discovery, docs, repo-bounded AGENTS/CLAUDE instruction projection, git, session context, Prompt Vault, AK, and FCOS without retrieving or mutating source data.",
  promptSnippet:
    "Use context_plan before broad context gathering when you need to reduce raw read/search tool calls and preserve source-owner authority boundaries.",
  promptGuidelines: [
    "Use context_plan for cross-source planning before collecting large code/docs/task context.",
    "Treat the result as a read-only plan and provider-boundary membrane, not as task/evidence authority.",
    "Explicitly select providers.ripwire=required for code discovery without filename seeds; Pi read/search remains available. Use separate docs/repo-bounded AGENTS/CLAUDE/AK/FCOS/Prompt Vault providers for non-code context.",
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
    "Assemble a bounded read-only context packet from wired providers such as explicitly selected ripwire, repo-bounded AGENTS/CLAUDE instruction files, Markdown/docs-list, git status, session metadata, and explicit code-retrieval omissions, while recording omissions and owner-surface routes for unavailable or authority-sensitive providers.",
  promptSnippet:
    "Use context_pack after context_plan when a small read-only packet from repo-bounded AGENTS/CLAUDE/docs/git plus explicit provider omissions can reduce raw read/search tool calls.",
  promptGuidelines: [
    "Use context_pack only for read-only packet assembly; it must not mutate files, git, AK, FCOS, Prompt Vault, ASC, or peer tooling.",
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

export async function runContextPackerRegisteredToolSmoke(
  pi: Pick<ExtensionAPI, "getAllTools" | "getCommands">,
  ctx?: ExtensionContext,
) {
  await runRegisteredToolSmoke(pi, ctx, CONTEXT_PACKER_TOOL_DEFINITIONS);
  if (Number(process.env.PI_CONTEXT_PACKER_DOGFOOD_GATE?.slice(3)) >= 4) {
    await runRipwireRuntimeSmoke(contextPackTool, ctx);
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
