import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  AUTORESEARCH_COMMAND_NAME,
  AUTORESEARCH_STATUS_TOOL_NAME,
  buildAutoresearchHelpText,
  buildAutoresearchScaffoldStatus,
  formatAutoresearchStatusText,
} from "../src/runtime.ts";

const statusSchema = Type.Object({
  cwd: Type.Optional(Type.String({ description: "Optional cwd override for scaffold reporting" })),
});

export default function piAutoresearchExtension(pi: ExtensionAPI): void {
  pi.registerCommand(AUTORESEARCH_COMMAND_NAME, {
    description: "Open the pi-autoresearch package-shell overview",
    handler: async (args, ctx) => {
      await openAutoresearchShell(args, ctx);
    },
  });

  pi.registerTool({
    name: AUTORESEARCH_STATUS_TOOL_NAME,
    label: "Autoresearch Runtime Status",
    description: "Inspect the current pi-autoresearch scaffold/runtime boundary.",
    promptSnippet:
      "Inspect the current pi-autoresearch scaffold/runtime boundary and local artifact contract.",
    parameters: statusSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const request = params as { cwd?: string };
      const status = buildAutoresearchScaffoldStatus(request.cwd ?? ctx.cwd);
      return {
        content: [{ type: "text", text: formatAutoresearchStatusText(status) }],
        details: status,
      };
    },
  });
}

async function openAutoresearchShell(args: string, ctx: ExtensionContext): Promise<void> {
  if (!ctx.hasUI) return;

  const normalizedArgs = args.trim();
  const status = buildAutoresearchScaffoldStatus(ctx.cwd);

  if (normalizedArgs.length > 0 && normalizedArgs !== "help" && normalizedArgs !== "status") {
    ctx.ui.notify(
      "pi-autoresearch is currently a package shell. Showing scaffold status instead of running experiments.",
      "info",
    );
  }

  await ctx.ui.editor("pi-autoresearch", buildAutoresearchHelpText(status));
}
