// summary: "exposes ontology tools through read and mutating toolbox bundle profiles."
// read_when:
//   - "changing toolbox bundle identity, profile membership, tool risk, or registration filtering."

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import registerOntologyWorkflowsExtension from "../extensions/ontology-workflows.ts";

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
    { name: "ontology_inspect", profile: "read", risk: "read" },
    { name: "ontology_proposal", profile: "read", risk: "read" },
  ],
  mutating: [{ name: "ontology_change", profile: "mutating", risk: "mutating" }],
};

export const id = "ontology";
export const version = 1;

export function registerToolboxBundle(
  pi: ExtensionAPI,
  context: ToolboxBundleContext = { profile: "read" },
): ToolboxRegisteredToolSummary[] {
  registerOntologyWorkflowsExtension(pi);

  const profile = context.profile || "read";
  const summaries = PROFILE_TOOLS[profile] ?? Object.values(PROFILE_TOOLS).flat();
  const requested = new Set(context.requestedTools ?? []);
  if (requested.size === 0) return summaries;
  return summaries.filter((summary) => requested.has(summary.name));
}

export default registerToolboxBundle;
