import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  extractLatestAssistantMessageProvenance,
  formatAssistantMessageProvenanceSummary,
} from "../src/provenance-core.js";

function writeLine(ctx: ExtensionContext, message: string): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, "info");
    return;
  }
  console.log(message);
}

function parseArgs(args: string): { json: boolean } {
  const tokens = args
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return {
    json: tokens.includes("--json") || tokens.includes("-j"),
  };
}

export default function provenanceExtension(pi: ExtensionAPI) {
  pi.registerCommand("provenance", {
    description: "Show minimal provenance for the latest persisted assistant message",
    handler: async (args, ctx) => {
      const options = parseArgs(args);
      const provenance = extractLatestAssistantMessageProvenance(ctx.sessionManager);

      if (!provenance) {
        writeLine(ctx, "provenance: no persisted assistant message found in this session");
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(provenance, null, 2));
        if (ctx.hasUI) {
          ctx.ui.notify("provenance JSON written to stdout", "info");
        }
        return;
      }

      writeLine(ctx, `provenance: ${formatAssistantMessageProvenanceSummary(provenance)}`);
    },
  });
}
