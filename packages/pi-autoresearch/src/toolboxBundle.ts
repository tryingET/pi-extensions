import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { registerPiAutoresearchExtension } from "../extensions/pi-autoresearch.ts";

type ToolboxRisk = "diagnostic" | "mutating";

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
    { name: "autoresearch_runtime_status", profile: "read", risk: "diagnostic" },
    { name: "autoresearch_runtime_control", profile: "read", risk: "diagnostic" },
    { name: "autoresearch_runtime_finalize", profile: "read", risk: "diagnostic" },
    { name: "autoresearch_runtime_peer_assist", profile: "read", risk: "diagnostic" },
    { name: "autoresearch_llamacpp_campaign_control", profile: "read", risk: "diagnostic" },
    { name: "autoresearch_llamacpp_campaign", profile: "read", risk: "diagnostic" },
  ],
  mutating: [
    { name: "autoresearch_runtime_run", profile: "mutating", risk: "mutating" },
    { name: "autoresearch_runtime_autoplan", profile: "mutating", risk: "mutating" },
    { name: "autoresearch_runtime_setup", profile: "mutating", risk: "mutating" },
    { name: "autoresearch_campaign_start", profile: "mutating", risk: "mutating" },
    { name: "autoresearch_runtime_loop", profile: "mutating", risk: "mutating" },
    { name: "autoresearch_runtime_resume_apply", profile: "mutating", risk: "mutating" },
    { name: "autoresearch_self_hosting_run", profile: "mutating", risk: "mutating" },
  ],
};

export const id = "autoresearch";
export const version = 1;

export function registerToolboxBundle(
  pi: ExtensionAPI,
  context: ToolboxBundleContext = { profile: "read" },
): ToolboxRegisteredToolSummary[] {
  const profile = context.profile || "read";
  registerPiAutoresearchExtension(pi, {
    effectProfile: profile === "read" ? "read" : "unrestricted",
  });

  const summaries = PROFILE_TOOLS[profile] ?? Object.values(PROFILE_TOOLS).flat();
  const requested = new Set(context.requestedTools ?? []);
  if (requested.size === 0) return summaries;
  return summaries.filter((summary) => requested.has(summary.name));
}

export default registerToolboxBundle;
