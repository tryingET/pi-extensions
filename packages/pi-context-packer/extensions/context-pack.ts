import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { CONTEXT_PACK_PARAMETERS, contextPacketToolResult } from "../src/context-pack.js";
import {
  buildContextPlan,
  CONTEXT_PLAN_PARAMETERS,
  formatContextPlan,
} from "../src/context-plan.js";
import {
  DOGFOOD_AGGREGATE_EVALUATION_PARAMETERS,
  DOGFOOD_OBSERVATION_EVALUATION_PARAMETERS,
  dogfoodAggregateEvaluationToolResult,
  dogfoodObservationEvaluationToolResult,
} from "../src/dogfood-observation.js";

const textResult = (text: string, details: Record<string, unknown> = {}) => ({
  content: [{ type: "text" as const, text }],
  details,
});

const contextEnv = (ctx: ExtensionContext | undefined) => ({
  cwd: ctx?.cwd,
  systemPrompt: ctx?.getSystemPrompt?.(),
  contextUsage: ctx?.getContextUsage?.(),
  modelLabel: ctx?.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
});

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

  pi.registerTool({
    name: "context_plan",
    label: "Context Plan",
    description:
      "Plan a read-only context packet across source-owned providers such as SCI, docs, AGENTS, git, session context, Prompt Vault, AK, and FCOS without retrieving or mutating source data.",
    promptSnippet:
      "Use context_plan before broad context gathering when you need to reduce raw read/search tool calls and preserve source-owner authority boundaries.",
    promptGuidelines: [
      "Use context_plan for cross-source planning before collecting large code/docs/task context.",
      "Treat the result as a read-only plan and provider-boundary membrane, not as task/evidence authority.",
      "Use SCI for code context and separate docs/AGENTS/AK/FCOS/Prompt Vault providers for non-code context.",
      "Follow owner-surface recommendations directly when the task needs self, subagent execution, peer messaging/launch, workflow supervision, AK/FCOS authority, or Prompt Vault governance.",
    ],
    parameters: CONTEXT_PLAN_PARAMETERS,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const plan = buildContextPlan(rawParams, contextEnv(ctx));
      return textResult(formatContextPlan(plan), { ok: plan.ok, plan });
    },
  });

  pi.registerTool({
    name: "context_pack",
    label: "Context Pack",
    description:
      "Assemble a bounded read-only context packet from wired providers such as AGENTS files, Markdown/docs-list, git status, session metadata, and SCI seeded code context, while recording omissions and owner-surface routes for unavailable or authority-sensitive providers.",
    promptSnippet:
      "Use context_pack after context_plan when a small read-only packet from AGENTS/docs/git plus explicit provider omissions can reduce raw read/search tool calls.",
    promptGuidelines: [
      "Use context_pack only for read-only packet assembly; it must not mutate files, git, AK, FCOS, Prompt Vault, SCI, ASC, or peer tooling.",
      "Treat packet content as a projection with provenance and omissions, not source-owner authority.",
      "Expect early MVP omissions for providers that are planned but not wired yet.",
      "Treat owner-surface routing as advice only; context_pack does not call self, spawn subagents, message peers, launch worktrees, or move authority.",
    ],
    parameters: CONTEXT_PACK_PARAMETERS,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      return contextPacketToolResult(rawParams, contextEnv(ctx));
    },
  });

  pi.registerTool({
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
      return dogfoodObservationEvaluationToolResult(rawParams);
    },
  });

  pi.registerTool({
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
      return dogfoodAggregateEvaluationToolResult(rawParams);
    },
  });
}
