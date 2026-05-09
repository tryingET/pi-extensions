import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import registerSocietyOrchestratorExtension from "../extensions/society-orchestrator.ts";

type ToolboxRisk = "read" | "orchestrator-gated";

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
    { name: "society_query", profile: "read", risk: "read" },
    { name: "orchestrator_boundary_telemetry", profile: "read", risk: "read" },
    { name: "ontology_context", profile: "read", risk: "read" },
  ],
  "orchestrator-gated": [
    { name: "cognitive_dispatch", profile: "orchestrator-gated", risk: "orchestrator-gated" },
    { name: "evidence_record", profile: "orchestrator-gated", risk: "orchestrator-gated" },
    { name: "workflow_execute", profile: "orchestrator-gated", risk: "orchestrator-gated" },
    { name: "loop_execute", profile: "orchestrator-gated", risk: "orchestrator-gated" },
    { name: "vault_execute_template", profile: "orchestrator-gated", risk: "orchestrator-gated" },
    {
      name: "ts_quality_release_workflow",
      profile: "orchestrator-gated",
      risk: "orchestrator-gated",
    },
    {
      name: "autoresearch_live_supervision",
      profile: "orchestrator-gated",
      risk: "orchestrator-gated",
    },
    {
      name: "autoresearch_manifest_campaign_supervision",
      profile: "orchestrator-gated",
      risk: "orchestrator-gated",
    },
    {
      name: "autoresearch_self_hosting_supervision",
      profile: "orchestrator-gated",
      risk: "orchestrator-gated",
    },
    {
      name: "autoresearch_learning_kes_adapter",
      profile: "orchestrator-gated",
      risk: "orchestrator-gated",
    },
  ],
};

export const id = "orchestrator";
export const version = 1;

export function registerToolboxBundle(
  pi: ExtensionAPI,
  context: ToolboxBundleContext = { profile: "read" },
): ToolboxRegisteredToolSummary[] {
  registerSocietyOrchestratorExtension(pi);

  const profile = context.profile || "read";
  const summaries = PROFILE_TOOLS[profile] ?? Object.values(PROFILE_TOOLS).flat();
  const requested = new Set(context.requestedTools ?? []);
  if (requested.size === 0) return summaries;
  return summaries.filter((summary) => requested.has(summary.name));
}

export default registerToolboxBundle;
