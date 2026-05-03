import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type ToolboxAction = "search" | "activate" | "deactivate" | "status" | "explain";
type ToolboxRisk =
  | "safe"
  | "read"
  | "diagnostic"
  | "mutating"
  | "external-mutation"
  | "orchestrator-gated";

interface ToolboxProfile {
  id: string;
  description: string;
  tools: string[];
  risk: ToolboxRisk;
  defaultTtlTurns: number;
  requiresExplicitUserIntent: boolean;
}

interface ToolboxBundle {
  id: string;
  title: string;
  description: string;
  ownerPackage: string;
  ownerSemantics: string;
  keywords: string[];
  profiles: ToolboxProfile[];
}

interface ToolboxParams {
  action?: ToolboxAction;
  query?: string;
  bundle?: string;
  profile?: string;
  tools?: string[];
  ttlTurns?: number;
  pin?: boolean;
  riskAcknowledged?: boolean;
}

const ALWAYS_ACTIVE_TOOLS = ["read", "bash", "edit", "write", "self", "interview", "toolbox"];

const CATALOG: ToolboxBundle[] = [
  {
    id: "vault",
    title: "Prompt Vault tools",
    description:
      "Prompt Vault query, retrieve, vocabulary, dispatch-check, mutation, execution, and feedback workflows.",
    ownerPackage: "packages/pi-vault-client",
    ownerSemantics:
      "pi-vault-client owns Prompt Vault behavior; toolbox only discovers and activates already-registered tools in this first slice.",
    keywords: ["prompt vault", "vault", "template", "prompt", "governed prompt"],
    profiles: [
      {
        id: "read",
        description: "Read-only Prompt Vault lookup and dispatch posture checks.",
        tools: ["vault_query", "vault_retrieve", "vault_vocabulary", "vault_dispatch_check"],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
      {
        id: "diagnostic",
        description: "Prompt Vault local diagnostics and execution receipt inspection.",
        tools: [
          "vault_schema_diagnostics",
          "vault_dolt_telemetry",
          "vault_executions",
          "vault_replay",
        ],
        risk: "diagnostic",
        defaultTtlTurns: 3,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description:
          "Governed Prompt Vault insert, update, rating, and prompt evaluation workflows.",
        tools: ["vault_insert", "vault_update", "vault_rate", "prompt_eval"],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "ontology",
    title: "Ontology workflow tools",
    description: "ROCS-backed ontology inspect, proposal, and governed change workflows.",
    ownerPackage: "packages/pi-ontology-workflows",
    ownerSemantics:
      "pi-ontology-workflows owns ontology workflow behavior; toolbox only activates the owning package tools.",
    keywords: ["ontology", "rocs", "concept", "relation", "semantic"],
    profiles: [
      {
        id: "read",
        description: "Read-only ontology status, search, and pack inspection.",
        tools: ["ontology_inspect", "ontology_proposal"],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description: "Governed ontology change planning and apply workflow.",
        tools: ["ontology_change"],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "designmd",
    title: "DesignMD Foundry tools",
    description:
      "DESIGN.md lint, export, Oat snapshot, OpenPencil, Penpot, palette, and session handoff workflows.",
    ownerPackage: "packages/pi-designmd-foundry",
    ownerSemantics:
      "pi-designmd-foundry owns DesignMD tool behavior; toolbox only activates the owning package tools.",
    keywords: ["design", "designmd", "css", "tokens", "penpot", "openpencil", "oat", "palette"],
    profiles: [
      {
        id: "read",
        description:
          "Read-only design lint, export, prompt, snapshot, inspect, and readiness flows.",
        tools: [
          "designmd_lint",
          "designmd_export",
          "designmd_agent_prompt",
          "designmd_oat_visual_snapshot",
          "designmd_openpencil_prompt",
          "designmd_openpencil_info",
          "designmd_openpencil_lint",
          "designmd_palette_from_text",
          "designmd_penpot_mcp_inspect",
          "designmd_readiness",
        ],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description:
          "Design artifact export or materialization flows that write requested local outputs or apply bounded session packets.",
        tools: [
          "designmd_openpencil_export",
          "designmd_penpot_mcp_bridge",
          "designmd_penpot_mcp_export",
          "designmd_session_plan",
          "designmd_session_variants",
          "designmd_session_closeout",
          "designmd_session_handoff",
          "designmd_session_promotion_candidate",
          "designmd_import_penpot",
        ],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "orchestrator",
    title: "Society orchestrator tools",
    description:
      "Society diagnostics, evidence, cognitive dispatch, workflow, and loop execution surfaces.",
    ownerPackage: "packages/pi-society-orchestrator",
    ownerSemantics:
      "pi-society-orchestrator owns orchestration behavior; toolbox only activates the owning package tools.",
    keywords: ["society", "orchestrator", "workflow", "loop", "evidence", "cognitive dispatch"],
    profiles: [
      {
        id: "read",
        description: "Read-only society/orchestrator diagnostics and context tools.",
        tools: ["society_query", "orchestrator_boundary_telemetry", "ontology_context"],
        risk: "read",
        defaultTtlTurns: 4,
        requiresExplicitUserIntent: false,
      },
      {
        id: "orchestrator-gated",
        description:
          "Orchestrator dispatch, workflow, loop, evidence, and release coordination surfaces.",
        tools: [
          "cognitive_dispatch",
          "evidence_record",
          "workflow_execute",
          "loop_execute",
          "vault_execute_template",
          "ts_quality_release_workflow",
          "autoresearch_live_supervision",
          "autoresearch_manifest_campaign_supervision",
        ],
        risk: "orchestrator-gated",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "autoresearch",
    title: "Autoresearch runtime tools",
    description:
      "Bounded pi-autoresearch setup, run, loop, supervision, candidate, and campaign-control surfaces.",
    ownerPackage: "packages/pi-autoresearch",
    ownerSemantics:
      "pi-autoresearch owns bounded experiment runtime behavior; toolbox only activates the owning package tools.",
    keywords: ["autoresearch", "experiment", "benchmark", "campaign", "self-hosting", "llamacpp"],
    profiles: [
      {
        id: "read",
        description:
          "Read-only autoresearch status, control inspection, finalization planning, and peer-assist planning.",
        tools: [
          "autoresearch_runtime_status",
          "autoresearch_runtime_control",
          "autoresearch_runtime_finalize",
          "autoresearch_runtime_peer_assist",
          "autoresearch_llamacpp_campaign_control",
          "autoresearch_llamacpp_campaign",
        ],
        risk: "diagnostic",
        defaultTtlTurns: 3,
        requiresExplicitUserIntent: false,
      },
      {
        id: "mutating",
        description:
          "Bounded autoresearch setup, run, loop, finalization, and self-hosting actions that can write receipts or local artifacts.",
        tools: [
          "autoresearch_runtime_run",
          "autoresearch_runtime_autoplan",
          "autoresearch_runtime_setup",
          "autoresearch_campaign_start",
          "autoresearch_runtime_loop",
          "autoresearch_self_hosting_run",
        ],
        risk: "mutating",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "peer-messaging",
    title: "Peer messaging tools",
    description: "Local Pi peer-session intercom and visible peer launch helpers.",
    ownerPackage: "packages/pi-peer-messaging and packages/pi-little-helpers",
    ownerSemantics:
      "peer-messaging and little-helpers own peer communication/launch behavior; toolbox only activates the owning package tools.",
    keywords: ["peer", "intercom", "sidequest", "candidate", "scout", "message"],
    profiles: [
      {
        id: "default",
        description: "Local peer messaging and visible peer spawn tools.",
        tools: ["intercom", "fork_peer_spawn", "scout_peer_spawn", "candidate_peer_spawn"],
        risk: "orchestrator-gated",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "session-introspection",
    title: "Session introspection tools",
    description: "Foundational self-inspection and subagent dispatch surfaces.",
    ownerPackage: "packages/pi-autonomous-session-control",
    ownerSemantics:
      "pi-autonomous-session-control owns self/subagent behavior; self remains always-active while dispatch_subagent is activated explicitly.",
    keywords: ["self", "subagent", "introspection", "progress", "loop"],
    profiles: [
      {
        id: "default",
        description: "Self-inspection and explicit subagent dispatch.",
        tools: ["self", "dispatch_subagent"],
        risk: "orchestrator-gated",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "operator-interaction",
    title: "Operator interaction tools",
    description: "Foundational structured operator input surface.",
    ownerPackage: "pi-interview / interaction packages",
    ownerSemantics:
      "operator interaction packages own UI behavior; interview remains always-active as the core structured input tool.",
    keywords: ["interview", "operator", "form", "requirements", "decision"],
    profiles: [
      {
        id: "default",
        description: "Structured operator interview tool.",
        tools: ["interview"],
        risk: "safe",
        defaultTtlTurns: 6,
        requiresExplicitUserIntent: false,
      },
    ],
  },
];

const TOOLBOX_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: ["search", "activate", "deactivate", "status", "explain"],
      description: "Toolbox operation to perform. Defaults to status.",
    },
    query: { type: "string", description: "Search text for action=search." },
    bundle: {
      type: "string",
      description: "Catalog bundle id such as vault, designmd, ontology, or autoresearch.",
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
        "Requested activation lifetime in turns. This first slice reports but does not enforce TTL.",
    },
    pin: {
      type: "boolean",
      description:
        "Whether activation should be treated as pinned. This first slice reports but does not persist pins.",
    },
    riskAcknowledged: {
      type: "boolean",
      description: "Required for mutating, external-mutation, and orchestrator-gated profiles.",
    },
  },
} as const;

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function findBundle(bundleId: string | undefined): ToolboxBundle | undefined {
  const normalized = normalizeText(bundleId);
  return CATALOG.find((bundle) => bundle.id === normalized);
}

function defaultProfile(bundle: ToolboxBundle): ToolboxProfile {
  return (
    bundle.profiles.find((profile) => profile.id === "default") ??
    bundle.profiles.find((profile) => profile.id === "read") ??
    bundle.profiles[0]
  );
}

function findProfile(
  bundle: ToolboxBundle,
  profileId: string | undefined,
): ToolboxProfile | undefined {
  const normalized = normalizeText(profileId);
  if (!normalized) return defaultProfile(bundle);
  return bundle.profiles.find((profile) => profile.id === normalized);
}

function searchCatalog(query: string | undefined): ToolboxBundle[] {
  const normalized = normalizeText(query);
  if (!normalized) return CATALOG;
  return CATALOG.filter((bundle) => {
    const haystack = [
      bundle.id,
      bundle.title,
      bundle.description,
      bundle.ownerPackage,
      ...bundle.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

function formatBundle(bundle: ToolboxBundle): string {
  const profiles = bundle.profiles
    .map((profile) => `${profile.id}(${profile.risk}: ${profile.tools.join(", ")})`)
    .join("; ");
  return `- ${bundle.id}: ${bundle.title} — ${bundle.description}\n  owner: ${bundle.ownerPackage}\n  profiles: ${profiles}`;
}

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

function activationRiskRequiresAcknowledgement(profile: ToolboxProfile): boolean {
  return (
    profile.requiresExplicitUserIntent ||
    ["mutating", "external-mutation", "orchestrator-gated"].includes(profile.risk)
  );
}

function resolveRequestedTools(params: ToolboxParams): {
  bundle?: ToolboxBundle;
  profile?: ToolboxProfile;
  requestedTools: string[];
  errors: string[];
} {
  const explicitTools = params.tools?.map((tool) => tool.trim()).filter(Boolean) ?? [];
  if (explicitTools.length > 0) {
    return { requestedTools: [...new Set(explicitTools)], errors: [] };
  }

  const bundle = findBundle(params.bundle);
  if (!bundle) {
    return {
      requestedTools: [],
      errors: params.bundle
        ? [`Unknown toolbox bundle: ${params.bundle}`]
        : ["Provide either tools or bundle."],
    };
  }

  const profile = findProfile(bundle, params.profile);
  if (!profile) {
    return {
      bundle,
      requestedTools: [],
      errors: [`Unknown profile ${params.profile} for bundle ${bundle.id}.`],
    };
  }

  return { bundle, profile, requestedTools: [...new Set(profile.tools)], errors: [] };
}

function formatStatus(pi: ExtensionAPI): string {
  const active = pi.getActiveTools();
  const all = pi.getAllTools();
  const registeredNames = new Set(all.map((tool) => tool.name));
  const latentCatalogTools = [
    ...new Set(CATALOG.flatMap((bundle) => bundle.profiles.flatMap((profile) => profile.tools))),
  ];
  const registeredCatalogTools = latentCatalogTools.filter((tool) => registeredNames.has(tool));
  const unavailableCatalogTools = latentCatalogTools.filter((tool) => !registeredNames.has(tool));

  return [
    "toolbox status",
    `- active tools (${active.length}): ${active.join(", ") || "none"}`,
    `- registered tools (${all.length}): ${all.map((tool) => tool.name).join(", ") || "none"}`,
    `- catalog bundles (${CATALOG.length}): ${CATALOG.map((bundle) => bundle.id).join(", ")}`,
    `- registered catalog tools (${registeredCatalogTools.length}): ${registeredCatalogTools.join(", ") || "none"}`,
    `- not currently registered (${unavailableCatalogTools.length}): ${unavailableCatalogTools.join(", ") || "none"}`,
    "- lazy import: not implemented in this first slice; activate works only for already-registered tools.",
  ].join("\n");
}

export default function toolboxDiscoveryExtension(pi: ExtensionAPI) {
  pi.registerCommand("toolbox", {
    description: "Inspect the toolbox discovery catalog and currently active tools",
    handler: async (_args, ctx) => {
      const message = formatStatus(pi);
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
      "Discover, explain, activate, deactivate, or inspect pi-extension tool bundles while keeping heavyweight package tools off by default.",
    promptSnippet:
      "Discover and activate pi-extension capability bundles on demand; keep self and interview active by default.",
    promptGuidelines: [
      "Use toolbox to discover domain-specific Pi tools before assuming a heavyweight custom tool is active.",
      "Do not activate mutating, external-mutation, or orchestrator-gated profiles without explicit user intent.",
    ],
    parameters: TOOLBOX_PARAMETERS,
    async execute(_toolCallId, rawParams) {
      const params = rawParams as ToolboxParams;
      const action = params.action ?? "status";

      if (action === "status") {
        return textResult(formatStatus(pi), {
          activeTools: pi.getActiveTools(),
          bundles: CATALOG.map((bundle) => bundle.id),
        });
      }

      if (action === "search") {
        const matches = searchCatalog(params.query);
        const text =
          matches.length > 0 ? matches.map(formatBundle).join("\n") : "No toolbox bundles matched.";
        return textResult(text, { matches: matches.map((bundle) => bundle.id) });
      }

      if (action === "explain") {
        const bundle = findBundle(params.bundle);
        if (!bundle) {
          return textResult(`Unknown toolbox bundle: ${params.bundle ?? "<missing>"}`, {
            ok: false,
          });
        }
        return textResult(formatBundle(bundle), { bundle });
      }

      if (action === "activate") {
        const resolved = resolveRequestedTools(params);
        if (resolved.errors.length > 0) {
          return textResult(`Cannot activate tools: ${resolved.errors.join("; ")}`, {
            ok: false,
            errors: resolved.errors,
          });
        }

        if (
          resolved.profile &&
          activationRiskRequiresAcknowledgement(resolved.profile) &&
          !params.riskAcknowledged
        ) {
          return textResult(
            `Refusing to activate ${resolved.bundle?.id ?? "requested"}/${resolved.profile.id} (${resolved.profile.risk}) without riskAcknowledged=true and explicit user intent.`,
            { ok: false, risk: resolved.profile.risk },
          );
        }

        const knownToolNames = new Set(pi.getAllTools().map((tool) => tool.name));
        const availableTools = resolved.requestedTools.filter((tool) => knownToolNames.has(tool));
        const missingTools = resolved.requestedTools.filter((tool) => !knownToolNames.has(tool));
        const nextActive = [...new Set([...pi.getActiveTools(), ...availableTools])];
        pi.setActiveTools(nextActive);

        const text = [
          `Activated tools: ${availableTools.join(", ") || "none"}`,
          missingTools.length > 0
            ? `Not registered in this session: ${missingTools.join(", ")} (lazy package import is a later RFC phase).`
            : undefined,
          resolved.profile
            ? `Profile: ${resolved.bundle?.id}/${resolved.profile.id}; risk=${resolved.profile.risk}; ttlTurns=${params.ttlTurns ?? resolved.profile.defaultTtlTurns}; pin=${params.pin === true}`
            : undefined,
        ]
          .filter(Boolean)
          .join("\n");

        return textResult(text, {
          ok: true,
          activated: availableTools,
          missing: missingTools,
          activeTools: nextActive,
          bundle: resolved.bundle?.id,
          profile: resolved.profile?.id,
        });
      }

      if (action === "deactivate") {
        const resolved = resolveRequestedTools(params);
        if (resolved.errors.length > 0) {
          return textResult(`Cannot deactivate tools: ${resolved.errors.join("; ")}`, {
            ok: false,
            errors: resolved.errors,
          });
        }
        const remove = new Set(resolved.requestedTools);
        const nextActive = pi
          .getActiveTools()
          .filter((tool) => !remove.has(tool) || ALWAYS_ACTIVE_TOOLS.includes(tool));
        pi.setActiveTools(nextActive);
        const protectedTools = resolved.requestedTools.filter((tool) =>
          ALWAYS_ACTIVE_TOOLS.includes(tool),
        );
        return textResult(
          [
            `Deactivated requested tools except protected always-active tools. Active tools: ${nextActive.join(", ") || "none"}`,
            protectedTools.length > 0
              ? `Protected always-active tools retained: ${protectedTools.join(", ")}`
              : undefined,
          ]
            .filter(Boolean)
            .join("\n"),
          { ok: true, activeTools: nextActive, protectedTools },
        );
      }

      return textResult(`Unknown toolbox action: ${action}`, { ok: false });
    },
  });
}
