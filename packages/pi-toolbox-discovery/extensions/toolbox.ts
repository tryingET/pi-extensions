import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { executeToolboxAction } from "../src/toolbox-actions.ts";
import { CATALOG } from "../src/toolbox-catalog.ts";
import { TOOLBOX_PARAMETERS } from "../src/toolbox-parameters.ts";
import { formatStatus } from "../src/toolbox-reports.ts";
import {
  applyStandardStartupProfile,
  createToolboxState,
  expireLeases,
} from "../src/toolbox-runtime.ts";

export { CATALOG };

export default function toolboxDiscoveryExtension(pi: ExtensionAPI) {
  const state = createToolboxState();

  pi.on("session_start", () => {
    state.leases.clear();
    applyStandardStartupProfile(pi);
  });

  pi.on("turn_start", () => {
    expireLeases(pi, state);
  });

  pi.registerCommand("toolbox", {
    description: "Inspect the toolbox discovery catalog and currently active tools",
    handler: async (_args, ctx) => {
      const message = formatStatus(pi, state);
      if (ctx.hasUI) {
        ctx.ui.notify(message, "info");
        return;
      }
      console.log(message);
    },
  });

  pi.registerTool({
    name: "toolbox",
    label: "Toolbox Discovery",
    description:
      "Discover, explain, activate, deactivate, or inspect pi-extension tool bundles while keeping heavyweight package tools off by default except standard peer-spawn and visible-loop checkpoint tools.",
    promptSnippet:
      "Discover and activate pi-extension capability bundles on demand; keep self, interview, dispatch_subagent, intercom, Prompt Vault read tools, context_plan, peer-spawn tools, visible-loop checkpoint fallback, and loop_execute active by default.",
    promptGuidelines: [
      "Use toolbox to discover domain-specific Pi tools before assuming a heavyweight custom tool is active.",
      "Use toolbox bundle agent_vent when repeated agent frustration, recurring bugs, tool failures, or workflow friction should be captured as local diagnostics.",
      "Do not activate mutating, external-mutation, or orchestrator-gated profiles without explicit user intent.",
    ],
    parameters: TOOLBOX_PARAMETERS,
    async execute(_toolCallId, rawParams) {
      return executeToolboxAction(pi, state, rawParams);
    },
  });
}
