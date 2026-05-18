import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerDesignmdExtension from "../extensions/designmd.ts";

type ToolboxRisk = "read" | "mutating";

interface ToolboxBundleContext {
  profile: string;
  requestedTools?: string[];
}

interface ToolboxRegisteredToolSummary {
  name: string;
  profile: string;
  risk: ToolboxRisk;
}

const PROFILE_TOOLS: Record<string, ToolboxRegisteredToolSummary[]> = {
  read: [
    { name: "designmd_lint", profile: "read", risk: "read" },
    { name: "designmd_export", profile: "read", risk: "read" },
    { name: "designmd_agent_prompt", profile: "read", risk: "read" },
    { name: "designmd_oat_visual_snapshot", profile: "read", risk: "read" },
    { name: "designmd_openpencil_prompt", profile: "read", risk: "read" },
    { name: "designmd_openpencil_info", profile: "read", risk: "read" },
    { name: "designmd_openpencil_lint", profile: "read", risk: "read" },
    { name: "designmd_palette_from_text", profile: "read", risk: "read" },
    { name: "designmd_penpot_mcp_inspect", profile: "read", risk: "read" },
    { name: "designmd_visual_dossier_pi_critique", profile: "read", risk: "read" },
    { name: "designmd_readiness", profile: "read", risk: "read" },
  ],
  mutating: [
    { name: "designmd_openpencil_export", profile: "mutating", risk: "mutating" },
    { name: "designmd_penpot_mcp_bridge", profile: "mutating", risk: "mutating" },
    { name: "designmd_penpot_mcp_export", profile: "mutating", risk: "mutating" },
    { name: "designmd_session_plan", profile: "mutating", risk: "mutating" },
    { name: "designmd_session_variants", profile: "mutating", risk: "mutating" },
    { name: "designmd_session_closeout", profile: "mutating", risk: "mutating" },
    { name: "designmd_session_handoff", profile: "mutating", risk: "mutating" },
    { name: "designmd_session_guided_run", profile: "mutating", risk: "mutating" },
    { name: "designmd_session_promotion_candidate", profile: "mutating", risk: "mutating" },
    { name: "designmd_import_penpot", profile: "mutating", risk: "mutating" },
  ],
};

export const id = "designmd";
export const version = 1;

export function registerToolboxBundle(
  pi: ExtensionAPI,
  context: ToolboxBundleContext = { profile: "read" },
): ToolboxRegisteredToolSummary[] {
  registerDesignmdExtension(pi);

  const profile = context.profile || "read";
  const summaries = PROFILE_TOOLS[profile] ?? Object.values(PROFILE_TOOLS).flat();
  const requested = new Set(context.requestedTools ?? []);
  if (requested.size === 0) return summaries;
  return summaries.filter((summary) => requested.has(summary.name));
}

export default registerToolboxBundle;
