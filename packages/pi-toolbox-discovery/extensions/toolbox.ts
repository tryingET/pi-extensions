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

  pi.on("session_start", (_event, ctx) => {
    const mutation = applyStandardStartupProfile(pi);
    if (mutation.ok) {
      state.leases.clear();
      return;
    }
    ctx.ui.notify(
      `Toolbox could not verify the standard startup active set (${mutation.failureClass}); prior lease bookkeeping was preserved. Run toolbox doctor and /reload before relying on tool visibility.`,
      "warning",
    );
  });

  pi.on("turn_start", (_event, ctx) => {
    const expiry = expireLeases(pi, state);
    if (expiry.mutation && !expiry.mutation.ok) {
      ctx.ui.notify(
        `Toolbox could not verify TTL deactivation (${expiry.mutation.failureClass}); expired leases remain tracked for retry. Run toolbox doctor if the problem persists.`,
        "warning",
      );
    }
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
      "Use toolbox action=recommend or search to discover domain-specific Pi tools before assuming a heavyweight custom tool is active.",
      "Use toolbox bundle agent_vent when self returns a diagnostic candidate, or when repeated agent frustration, recurring bugs, tool failures, or workflow friction should be captured as local diagnostics.",
      "After activating agent_vent for a self diagnostic candidate, prefer agent_vent action=preview before action=record so low-signal payloads are checked without writing local diagnostic state.",
      "Do not activate mutating, external-mutation, or orchestrator-gated profiles without explicit user intent.",
    ],
    parameters: TOOLBOX_PARAMETERS,
    async execute(_toolCallId, rawParams) {
      return executeToolboxAction(pi, state, rawParams);
    },
  });
}
