export const TOOLBOX_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["search", "activate", "deactivate", "status", "doctor", "plan", "explain"],
      description: "Toolbox operation to perform. Defaults to status.",
    },
    query: { type: "string", description: "Search text for action=search." },
    bundle: {
      type: "string",
      description:
        "Catalog bundle id such as vault, context-packer, designmd, ontology, autoresearch, agent_vent, or peer-spawn.",
    },
    profile: {
      type: "string",
      description: "Bundle profile id. Defaults to default or read when available.",
    },
    tools: {
      type: "array",
      items: { type: "string" },
      description: "Explicit tool names to activate/deactivate.",
    },
    ttlTurns: {
      type: "number",
      description:
        "Requested activation lifetime in turns. Defaults to the selected profile TTL and is capped to a bounded maximum.",
    },
    pin: {
      type: "boolean",
      description:
        "Whether activation should stay active until explicit deactivation instead of expiring by TTL.",
    },
    autoContinue: {
      type: "boolean",
      description:
        "Whether toolbox should queue a same-task continuation after activation changes the active tool set. Defaults true; set false for activation-only calls.",
    },
    riskAcknowledged: {
      type: "boolean",
      description: "Required for mutating, external-mutation, and orchestrator-gated profiles.",
    },
    riskJustification: {
      type: "string",
      description:
        "Required with riskAcknowledged for mutating, external-mutation, and orchestrator-gated activation. Summarize the explicit user intent/risk reason.",
    },
  },
} as const;
