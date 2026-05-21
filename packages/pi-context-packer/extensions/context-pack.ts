import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CONTEXT_PACK_PARAMETERS, contextPacketToolResult } from "../src/context-pack.js";
import {
  buildContextPlan,
  CONTEXT_PLAN_PARAMETERS,
  formatContextPlan,
} from "../src/context-plan.js";

const textResult = (text: string, details: Record<string, unknown> = {}) => ({
  content: [{ type: "text" as const, text }],
  details,
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
        { cwd: ctx.cwd },
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
    ],
    parameters: CONTEXT_PLAN_PARAMETERS,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      const plan = buildContextPlan(rawParams, { cwd: ctx?.cwd });
      return textResult(formatContextPlan(plan), { ok: plan.ok, plan });
    },
  });

  pi.registerTool({
    name: "context_pack",
    label: "Context Pack",
    description:
      "Assemble a bounded read-only context packet from currently wired providers: AGENTS files, seeded Markdown docs, and git status, while recording omissions for planned providers such as SCI, AK, FCOS, Prompt Vault, and session context.",
    promptSnippet:
      "Use context_pack after context_plan when a small read-only packet from AGENTS/docs/git plus explicit provider omissions can reduce raw read/search tool calls.",
    promptGuidelines: [
      "Use context_pack only for read-only packet assembly; it must not mutate files, git, AK, FCOS, Prompt Vault, or SCI.",
      "Treat packet content as a projection with provenance and omissions, not source-owner authority.",
      "Expect early MVP omissions for providers that are planned but not wired yet.",
    ],
    parameters: CONTEXT_PACK_PARAMETERS,
    async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
      return contextPacketToolResult(rawParams, { cwd: ctx?.cwd });
    },
  });
}
