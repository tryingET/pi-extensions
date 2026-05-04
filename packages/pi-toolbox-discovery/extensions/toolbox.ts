import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type ToolboxAction =
  | "search"
  | "activate"
  | "deactivate"
  | "status"
  | "doctor"
  | "plan"
  | "explain";
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

interface ToolboxLazyModule {
  specifier: string;
  label: string;
}

interface ToolboxBundle {
  id: string;
  title: string;
  description: string;
  ownerPackage: string;
  ownerSemantics: string;
  keywords: string[];
  profiles: ToolboxProfile[];
  lazyModules?: ToolboxLazyModule[];
}

interface ActivationLease {
  tool: string;
  bundle?: string;
  profile?: string;
  pinned: boolean;
  expiresAtTurn?: number;
  riskJustification?: string;
}

interface LazyImportRecord {
  bundle: string;
  specifier: string;
  profile: string;
  ok: boolean;
  registeredTools: string[];
  message: string;
}

interface ToolboxState {
  turn: number;
  leases: Map<string, ActivationLease>;
  loadedBundles: Set<string>;
  lazyImportRecords: LazyImportRecord[];
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
  riskJustification?: string;
}

interface ToolCatalogMatch {
  bundle: ToolboxBundle;
  profile: ToolboxProfile;
}

interface ActivationPlan {
  bundle?: ToolboxBundle;
  profile?: ToolboxProfile;
  source: "bundle-profile" | "explicit-tools";
  requestedTools: string[];
  risks: ToolboxRisk[];
  requiresAcknowledgement: boolean;
  errors: string[];
}

const ALWAYS_ACTIVE_TOOLS = [
  "read",
  "bash",
  "edit",
  "write",
  "self",
  "interview",
  "dispatch_subagent",
  "intercom",
  "vault_query",
  "vault_retrieve",
  "vault_vocabulary",
  "vault_dispatch_check",
  "toolbox",
];

const DEFAULT_TTL_TURNS = 4;
const MAX_TTL_TURNS = 12;
const ALLOWED_EAGER_REGISTERED_BUNDLE_IDS = new Set([
  "vault",
  "session-introspection",
  "operator-interaction",
]);

export const CATALOG: ToolboxBundle[] = [
  {
    id: "vault",
    title: "Prompt Vault tools",
    description:
      "Prompt Vault query, retrieve, vocabulary, dispatch-check, mutation, execution, and feedback workflows.",
    ownerPackage: "packages/pi-vault-client",
    ownerSemantics:
      "pi-vault-client owns Prompt Vault behavior; toolbox discovers, lazily imports the owner extension when available, and activates the owner tools without reimplementing Prompt Vault behavior.",
    keywords: ["prompt vault", "vault", "template", "prompt", "governed prompt"],
    lazyModules: [
      {
        specifier: "pi-vault-client/toolbox-bundle",
        label: "published package-owned toolbox bundle",
      },
      {
        specifier: new URL("../../pi-vault-client/src/toolboxBundle.js", import.meta.url).href,
        label: "monorepo sibling package-owned toolbox bundle",
      },
    ],
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
      "pi-ontology-workflows owns ontology workflow behavior; toolbox discovers, lazily imports the owner bundle when available, and activates the owner tools without reimplementing ontology behavior.",
    keywords: ["ontology", "rocs", "concept", "relation", "semantic"],
    lazyModules: [
      {
        specifier: "@tryinget/pi-ontology-workflows/toolbox-bundle",
        label: "published package-owned toolbox bundle",
      },
      {
        specifier: new URL("../../pi-ontology-workflows/src/toolboxBundle.ts", import.meta.url)
          .href,
        label: "monorepo sibling package-owned toolbox bundle",
      },
    ],
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
      "pi-designmd-foundry owns DesignMD tool behavior; toolbox discovers, lazily imports the owner bundle when available, and activates the owner tools without reimplementing design behavior.",
    keywords: ["design", "designmd", "css", "tokens", "penpot", "openpencil", "oat", "palette"],
    lazyModules: [
      {
        specifier: "@tryinget/pi-designmd-foundry/toolbox-bundle",
        label: "published package-owned toolbox bundle",
      },
      {
        specifier: new URL("../../pi-designmd-foundry/src/toolboxBundle.ts", import.meta.url).href,
        label: "monorepo sibling package-owned toolbox bundle",
      },
    ],
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
      "pi-society-orchestrator owns orchestration behavior; toolbox discovers, lazily imports the owner bundle when available, and activates the owner tools without reimplementing orchestration behavior.",
    keywords: ["society", "orchestrator", "workflow", "loop", "evidence", "cognitive dispatch"],
    lazyModules: [
      {
        specifier: "pi-society-orchestrator/toolbox-bundle",
        label: "published package-owned toolbox bundle",
      },
      {
        specifier: new URL("../../pi-society-orchestrator/src/toolboxBundle.ts", import.meta.url)
          .href,
        label: "monorepo sibling package-owned toolbox bundle",
      },
    ],
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
          "autoresearch_self_hosting_supervision",
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
      "pi-autoresearch owns bounded experiment runtime behavior; toolbox discovers, lazily imports the owner bundle when available, and activates the owner tools without reimplementing experiment behavior.",
    keywords: ["autoresearch", "experiment", "benchmark", "campaign", "self-hosting", "llamacpp"],
    lazyModules: [
      {
        specifier: "@tryinget/pi-autoresearch/toolbox-bundle",
        label: "published package-owned toolbox bundle",
      },
      {
        specifier: new URL("../../pi-autoresearch/src/toolboxBundle.ts", import.meta.url).href,
        label: "monorepo sibling package-owned toolbox bundle",
      },
    ],
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
    id: "peer-spawn",
    title: "Visible peer-spawn tools",
    description:
      "pi-little-helpers sidequest tools for launching visible fork, scout, and candidate peer sessions. The intercom messaging primitive remains always-active through pi-peer-messaging.",
    ownerPackage: "packages/pi-little-helpers",
    ownerSemantics:
      "pi-little-helpers owns visible peer launch behavior; pi-peer-messaging owns the always-active intercom communication primitive; toolbox only lazily imports and activates the sidequest peer-spawn tools.",
    keywords: ["peer", "sidequest", "parallelquest", "candidate", "scout", "spawn"],
    lazyModules: [
      {
        specifier: new URL("../../pi-little-helpers/src/toolboxBundle.ts", import.meta.url).href,
        label: "monorepo sibling package-owned toolbox bundle",
      },
      {
        specifier: "@tryinget/pi-little-helpers/toolbox-bundle",
        label: "published package-owned toolbox bundle",
      },
    ],
    profiles: [
      {
        id: "default",
        description: "Visible sidequest/scout/candidate peer-spawn tools.",
        tools: ["fork_peer_spawn", "scout_peer_spawn", "candidate_peer_spawn"],
        risk: "orchestrator-gated",
        defaultTtlTurns: 2,
        requiresExplicitUserIntent: true,
      },
    ],
  },
  {
    id: "session-introspection",
    title: "Always-active session introspection tools",
    description: "Foundational self-inspection and subagent dispatch surfaces.",
    ownerPackage: "packages/pi-autonomous-session-control",
    ownerSemantics:
      "pi-autonomous-session-control owns self/subagent behavior; self and dispatch_subagent remain always-active foundational tools when their owner package is registered.",
    keywords: ["self", "subagent", "introspection", "progress", "loop"],
    profiles: [
      {
        id: "default",
        description: "Foundational self-inspection and subagent dispatch tools.",
        tools: ["self", "dispatch_subagent"],
        risk: "safe",
        defaultTtlTurns: 6,
        requiresExplicitUserIntent: false,
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
      enum: ["search", "activate", "deactivate", "status", "doctor", "plan", "explain"],
      description: "Toolbox operation to perform. Defaults to status.",
    },
    query: { type: "string", description: "Search text for action=search." },
    bundle: {
      type: "string",
      description:
        "Catalog bundle id such as vault, designmd, ontology, autoresearch, or peer-spawn.",
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

function riskRequiresAcknowledgement(risk: ToolboxRisk): boolean {
  return ["mutating", "external-mutation", "orchestrator-gated"].includes(risk);
}

function getToolCatalogMatches(tool: string): ToolCatalogMatch[] {
  const matches: ToolCatalogMatch[] = [];
  for (const bundle of CATALOG) {
    for (const profile of bundle.profiles) {
      if (profile.tools.includes(tool)) {
        matches.push({ bundle, profile });
      }
    }
  }
  return matches;
}

function sortRisks(risks: Iterable<ToolboxRisk>): ToolboxRisk[] {
  const order: Record<ToolboxRisk, number> = {
    safe: 0,
    read: 1,
    diagnostic: 2,
    mutating: 3,
    "orchestrator-gated": 4,
    "external-mutation": 5,
  };
  return [...new Set(risks)].sort((left, right) => order[left] - order[right]);
}

function planActivation(params: ToolboxParams): ActivationPlan {
  const explicitTools = params.tools?.map((tool) => tool.trim()).filter(Boolean) ?? [];
  if (explicitTools.length > 0) {
    const requestedTools = [...new Set(explicitTools)];
    const risks = sortRisks(
      requestedTools.flatMap((tool) => {
        if (ALWAYS_ACTIVE_TOOLS.includes(tool)) return ["safe" as const];
        const matches = getToolCatalogMatches(tool);
        return matches.length > 0
          ? matches.map((match) => match.profile.risk)
          : ["external-mutation" as const];
      }),
    );
    return {
      source: "explicit-tools",
      requestedTools,
      risks,
      requiresAcknowledgement: risks.some(riskRequiresAcknowledgement),
      errors: [],
    };
  }

  const bundle = findBundle(params.bundle);
  if (!bundle) {
    return {
      source: "bundle-profile",
      requestedTools: [],
      risks: [],
      requiresAcknowledgement: false,
      errors: params.bundle
        ? [`Unknown toolbox bundle: ${params.bundle}`]
        : ["Provide either tools or bundle."],
    };
  }

  const profile = findProfile(bundle, params.profile);
  if (!profile) {
    return {
      bundle,
      source: "bundle-profile",
      requestedTools: [],
      risks: [],
      requiresAcknowledgement: false,
      errors: [`Unknown profile ${params.profile} for bundle ${bundle.id}.`],
    };
  }

  return {
    bundle,
    profile,
    source: "bundle-profile",
    requestedTools: [...new Set(profile.tools)],
    risks: [profile.risk],
    requiresAcknowledgement: activationRiskRequiresAcknowledgement(profile),
    errors: [],
  };
}

function createToolboxState(): ToolboxState {
  return {
    turn: 0,
    leases: new Map(),
    loadedBundles: new Set(),
    lazyImportRecords: [],
  };
}

function getKnownToolNames(pi: ExtensionAPI): Set<string> {
  return new Set(pi.getAllTools().map((tool) => tool.name));
}

function boundedTtlTurns(
  requested: number | undefined,
  profile: ToolboxProfile | undefined,
): number {
  const fallback = profile?.defaultTtlTurns ?? DEFAULT_TTL_TURNS;
  const candidate = Number.isFinite(requested) ? Math.floor(requested as number) : fallback;
  return Math.max(1, Math.min(MAX_TTL_TURNS, candidate));
}

function applyMinimalStartupProfile(pi: ExtensionAPI): string[] {
  const registered = getKnownToolNames(pi);
  const minimal = ALWAYS_ACTIVE_TOOLS.filter((tool) => registered.has(tool));
  pi.setActiveTools(minimal);
  return minimal;
}

function recordLeases(
  state: ToolboxState,
  tools: string[],
  params: ToolboxParams,
  resolved: { bundle?: ToolboxBundle; profile?: ToolboxProfile },
): ActivationLease[] {
  const pinned = params.pin === true;
  const ttl = boundedTtlTurns(params.ttlTurns, resolved.profile);
  const leases = tools
    .filter((tool) => !ALWAYS_ACTIVE_TOOLS.includes(tool))
    .map(
      (tool): ActivationLease => ({
        tool,
        bundle: resolved.bundle?.id,
        profile: resolved.profile?.id,
        pinned,
        expiresAtTurn: pinned ? undefined : state.turn + ttl,
        riskJustification: params.riskJustification?.trim() || undefined,
      }),
    );

  for (const lease of leases) {
    const existing = state.leases.get(lease.tool);
    if (existing?.pinned) continue;
    if (lease.pinned || (lease.expiresAtTurn ?? 0) >= (existing?.expiresAtTurn ?? 0)) {
      state.leases.set(lease.tool, lease);
    }
  }

  return leases;
}

function expireLeases(pi: ExtensionAPI, state: ToolboxState): string[] {
  state.turn += 1;
  const expired = [...state.leases.values()].filter(
    (lease) => !lease.pinned && (lease.expiresAtTurn ?? Number.POSITIVE_INFINITY) <= state.turn,
  );
  if (expired.length === 0) return [];

  for (const lease of expired) {
    state.leases.delete(lease.tool);
  }

  const expiredTools = new Set(expired.map((lease) => lease.tool));
  const nextActive = pi
    .getActiveTools()
    .filter((tool) => !expiredTools.has(tool) || ALWAYS_ACTIVE_TOOLS.includes(tool));
  pi.setActiveTools(nextActive);
  return [...expiredTools];
}

function describeLeases(state: ToolboxState): string[] {
  return [...state.leases.values()].map((lease) => {
    const lifetime = lease.pinned
      ? "pinned"
      : `expires in ${Math.max(0, (lease.expiresAtTurn ?? state.turn) - state.turn)} turn(s)`;
    const source = [lease.bundle, lease.profile].filter(Boolean).join("/") || "explicit-tools";
    const riskNote = lease.riskJustification ? `; risk=${lease.riskJustification}` : "";
    return `${lease.tool} (${source}; ${lifetime}${riskNote})`;
  });
}

function buildCatalogToolBundleIndex(): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const bundle of CATALOG) {
    for (const profile of bundle.profiles) {
      for (const tool of profile.tools) {
        const bundleIds = index.get(tool) ?? new Set<string>();
        bundleIds.add(bundle.id);
        index.set(tool, bundleIds);
      }
    }
  }
  return index;
}

function findEagerRegistrationDrift(pi: ExtensionAPI, state: ToolboxState): string[] {
  const active = new Set(pi.getActiveTools());
  const registered = getKnownToolNames(pi);
  const leased = new Set(state.leases.keys());
  const acceptedLazyTools = new Set(
    state.lazyImportRecords
      .filter((record) => record.ok)
      .flatMap((record) => record.registeredTools),
  );
  const catalogToolBundles = buildCatalogToolBundleIndex();
  const drift = new Set<string>();

  for (const [tool, bundleIds] of catalogToolBundles) {
    if (!registered.has(tool) || active.has(tool) || leased.has(tool)) {
      continue;
    }
    if ([...bundleIds].some((bundleId) => ALLOWED_EAGER_REGISTERED_BUNDLE_IDS.has(bundleId))) {
      continue;
    }
    if (acceptedLazyTools.has(tool)) {
      continue;
    }
    drift.add(tool);
  }

  return [...drift].sort();
}

function getCatalogToolNames(): Set<string> {
  return new Set(CATALOG.flatMap((bundle) => bundle.profiles.flatMap((profile) => profile.tools)));
}

function findUnleasedActiveCatalogTools(pi: ExtensionAPI, state: ToolboxState): string[] {
  const catalogTools = getCatalogToolNames();
  return pi
    .getActiveTools()
    .filter(
      (tool) =>
        catalogTools.has(tool) && !ALWAYS_ACTIVE_TOOLS.includes(tool) && !state.leases.has(tool),
    )
    .sort();
}

function findPartialLazyImportRecords(state: ToolboxState): string[] {
  return state.lazyImportRecords
    .filter((record) => !record.ok && record.registeredTools.length > 0)
    .map(
      (record) =>
        `${record.bundle}/${record.profile}: ${record.registeredTools.join(", ")} (${record.message})`,
    );
}

function groupToolsByBundle(tools: string[]): string[] {
  const index = buildCatalogToolBundleIndex();
  const grouped = new Map<string, string[]>();

  for (const tool of tools) {
    const bundleIds = index.get(tool) ?? new Set<string>(["unknown"]);
    for (const bundleId of bundleIds) {
      const bundleTools = grouped.get(bundleId) ?? [];
      bundleTools.push(tool);
      grouped.set(bundleId, bundleTools);
    }
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bundleId, bundleTools]) => `${bundleId}: ${bundleTools.sort().join(", ")}`);
}

function buildDoctorReport(pi: ExtensionAPI, state: ToolboxState) {
  const active = pi.getActiveTools();
  const registeredTools = pi.getAllTools().map((tool) => tool.name);
  const registered = new Set(registeredTools);
  const activeSet = new Set(active);
  const activeLeases = describeLeases(state);
  const missingAlwaysActiveRegistrations = ALWAYS_ACTIVE_TOOLS.filter(
    (tool) => !registered.has(tool),
  );
  const inactiveAlwaysActiveTools = ALWAYS_ACTIVE_TOOLS.filter(
    (tool) => registered.has(tool) && !activeSet.has(tool),
  );
  const eagerRegistrationDrift = findEagerRegistrationDrift(pi, state);
  const unleasedActiveCatalogTools = findUnleasedActiveCatalogTools(pi, state);
  const partialLazyImports = findPartialLazyImportRecords(state);
  const duplicateOrSettingsSuspects = groupToolsByBundle(eagerRegistrationDrift).map((group) => {
    const bundleId = group.split(":", 1)[0] ?? "unknown";
    const bundle = CATALOG.find((candidate) => candidate.id === bundleId);
    const owner = bundle?.ownerPackage ?? "unknown owner package";
    return `${group} — check ${owner} settings for eager extensions or duplicate package/worktree entries`;
  });
  const problems: string[] = [];
  const recommendations: string[] = [];

  if (missingAlwaysActiveRegistrations.length > 0) {
    problems.push(
      `missing registered baseline tools: ${missingAlwaysActiveRegistrations.join(", ")}`,
    );
    recommendations.push(
      "Load the owner packages for missing foundational/cognitive tools before relying on the lean startup profile.",
    );
  }
  if (inactiveAlwaysActiveTools.length > 0) {
    problems.push(`inactive baseline tools: ${inactiveAlwaysActiveTools.join(", ")}`);
    recommendations.push(
      "Run /reload or allow toolbox session_start to re-apply the always-active baseline.",
    );
  }
  if (eagerRegistrationDrift.length > 0) {
    problems.push(`lazy-bundle tools registered eagerly: ${eagerRegistrationDrift.join(", ")}`);
    recommendations.push(
      "Keep the owning package installed but disable its heavy extension entry in Pi settings; activate tools through toolbox when needed.",
    );
  }
  if (unleasedActiveCatalogTools.length > 0) {
    problems.push(`catalog tools active without a lease: ${unleasedActiveCatalogTools.join(", ")}`);
    recommendations.push(
      "Deactivate unneeded catalog tools or reactivate them through toolbox so TTL/pin state is explicit.",
    );
  }
  if (partialLazyImports.length > 0) {
    problems.push(`partial lazy imports left registered tools: ${partialLazyImports.join("; ")}`);
    recommendations.push(
      "Reload Pi before trusting registered-tool posture, then activate the owner bundle/profile again if needed.",
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Lean startup profile is healthy; activate lazy bundles only when the task needs them.",
    );
  }

  return {
    ok: problems.length === 0,
    activeTools: active,
    registeredTools,
    activeLeases,
    missingAlwaysActiveRegistrations,
    inactiveAlwaysActiveTools,
    eagerRegistrationDrift,
    unleasedActiveCatalogTools,
    partialLazyImports,
    duplicateOrSettingsSuspects,
    recommendations,
    problems,
  };
}

function formatActivationPlan(plan: ActivationPlan, pi: ExtensionAPI): string {
  const knownToolNames = getKnownToolNames(pi);
  const registeredTools = plan.requestedTools.filter((tool) => knownToolNames.has(tool));
  const missingTools = plan.requestedTools.filter((tool) => !knownToolNames.has(tool));
  const lazyModules = plan.bundle?.lazyModules?.map((module) => module.specifier) ?? [];

  return [
    "toolbox activation plan",
    `- source: ${plan.source}`,
    `- target: ${plan.bundle?.id ?? "explicit-tools"}/${plan.profile?.id ?? "requested"}`,
    `- requested tools (${plan.requestedTools.length}): ${plan.requestedTools.join(", ") || "none"}`,
    `- registered now (${registeredTools.length}): ${registeredTools.join(", ") || "none"}`,
    `- missing now (${missingTools.length}): ${missingTools.join(", ") || "none"}`,
    `- risks: ${plan.risks.join(", ") || "none"}`,
    `- acknowledgement required: ${plan.requiresAcknowledgement ? "yes" : "no"}`,
    `- lazy modules (${lazyModules.length}): ${lazyModules.join(", ") || "none"}`,
    `- mutates active tools: no`,
    `- imports owner modules: no`,
  ].join("\n");
}

function formatDoctor(report: ReturnType<typeof buildDoctorReport>): string {
  return [
    "toolbox doctor",
    `- verdict: ${report.ok ? "pass" : "fail"}`,
    `- active tools (${report.activeTools.length}): ${report.activeTools.join(", ") || "none"}`,
    `- registered tools (${report.registeredTools.length}): ${report.registeredTools.join(", ") || "none"}`,
    `- foundational baseline: ${
      report.missingAlwaysActiveRegistrations.length === 0 &&
      report.inactiveAlwaysActiveTools.length === 0
        ? "ok"
        : "needs attention"
    }`,
    `- missing baseline registrations (${report.missingAlwaysActiveRegistrations.length}): ${report.missingAlwaysActiveRegistrations.join(", ") || "none"}`,
    `- inactive baseline tools (${report.inactiveAlwaysActiveTools.length}): ${report.inactiveAlwaysActiveTools.join(", ") || "none"}`,
    `- active leases (${report.activeLeases.length}): ${report.activeLeases.join("; ") || "none"}`,
    `- eager registration drift (${report.eagerRegistrationDrift.length}): ${report.eagerRegistrationDrift.join(", ") || "none"}`,
    `- unleased active catalog tools (${report.unleasedActiveCatalogTools.length}): ${report.unleasedActiveCatalogTools.join(", ") || "none"}`,
    `- partial lazy imports (${report.partialLazyImports.length}): ${report.partialLazyImports.join("; ") || "none"}`,
    `- duplicate/settings suspects (${report.duplicateOrSettingsSuspects.length}): ${report.duplicateOrSettingsSuspects.join("; ") || "none"}`,
    `- recommendations: ${report.recommendations.join(" ")}`,
  ].join("\n");
}

function getLazyRegistrationFunction(
  moduleValue: unknown,
):
  | ((pi: ExtensionAPI, context: { profile: string; requestedTools: string[] }) => unknown)
  | undefined {
  if (!moduleValue || typeof moduleValue !== "object") return undefined;
  const record = moduleValue as { default?: unknown; registerToolboxBundle?: unknown };
  if (typeof record.registerToolboxBundle === "function") return record.registerToolboxBundle;
  if (typeof record.default === "function") return record.default;
  return undefined;
}

async function tryLazyImportBundle(
  pi: ExtensionAPI,
  state: ToolboxState,
  bundle: ToolboxBundle | undefined,
  profile: ToolboxProfile | undefined,
  requestedTools: string[],
): Promise<{ attempted: boolean; records: LazyImportRecord[] }> {
  if (!bundle?.lazyModules?.length) return { attempted: false, records: [] };

  const profileId = profile?.id ?? "default";
  const moduleKeys = bundle.lazyModules.map(
    (lazyModule) => `${bundle.id}:${profileId}:${lazyModule.specifier}`,
  );
  if (
    requestedTools.every((tool) => getKnownToolNames(pi).has(tool)) &&
    moduleKeys.every((key) => state.loadedBundles.has(key))
  ) {
    return { attempted: false, records: [] };
  }

  const records: LazyImportRecord[] = [];
  for (const lazyModule of bundle.lazyModules) {
    const moduleKey = `${bundle.id}:${profileId}:${lazyModule.specifier}`;
    if (state.loadedBundles.has(moduleKey)) continue;
    try {
      const moduleValue = await import(lazyModule.specifier);
      const register = getLazyRegistrationFunction(moduleValue);
      if (register) {
        await register(pi, { profile: profileId, requestedTools });
      }
      const nowKnown = getKnownToolNames(pi);
      const registeredRequestedTools = requestedTools.filter((tool) => nowKnown.has(tool));
      const complete = requestedTools.every((tool) => nowKnown.has(tool));
      const record = {
        bundle: bundle.id,
        specifier: lazyModule.specifier,
        profile: profileId,
        ok: complete,
        registeredTools: registeredRequestedTools,
        message: complete
          ? `registered requested tools: ${registeredRequestedTools.join(", ")}`
          : registeredRequestedTools.length > 0
            ? `partial registration: ${registeredRequestedTools.join(", ")}`
            : `imported ${lazyModule.label} but none of the requested tools registered`,
      };
      records.push(record);
      state.lazyImportRecords.push(record);
      if (complete) {
        state.loadedBundles.add(moduleKey);
        break;
      }
    } catch (error) {
      const record = {
        bundle: bundle.id,
        specifier: lazyModule.specifier,
        profile: profileId,
        ok: false,
        registeredTools: [],
        message: error instanceof Error ? error.message : String(error),
      };
      records.push(record);
      state.lazyImportRecords.push(record);
    }
  }

  return { attempted: true, records };
}

function formatStatus(pi: ExtensionAPI, state: ToolboxState): string {
  const active = pi.getActiveTools();
  const all = pi.getAllTools();
  const registeredNames = new Set(all.map((tool) => tool.name));
  const latentCatalogTools = [
    ...new Set(CATALOG.flatMap((bundle) => bundle.profiles.flatMap((profile) => profile.tools))),
  ];
  const registeredCatalogTools = latentCatalogTools.filter((tool) => registeredNames.has(tool));
  const unavailableCatalogTools = latentCatalogTools.filter((tool) => !registeredNames.has(tool));
  const lazyReadyBundles = CATALOG.filter((bundle) => bundle.lazyModules?.length).map(
    (bundle) => bundle.id,
  );
  const activeLeases = describeLeases(state);
  const doctorReport = buildDoctorReport(pi, state);
  const eagerRegistrationDrift = doctorReport.eagerRegistrationDrift;
  const recentLazyImports = state.lazyImportRecords.slice(-5);

  return [
    "toolbox status",
    `- active tools (${active.length}): ${active.join(", ") || "none"}`,
    `- registered tools (${all.length}): ${all.map((tool) => tool.name).join(", ") || "none"}`,
    `- catalog bundles (${CATALOG.length}): ${CATALOG.map((bundle) => bundle.id).join(", ")}`,
    `- lazy-import-ready bundles (${lazyReadyBundles.length}): ${lazyReadyBundles.join(", ") || "none"}`,
    `- registered catalog tools (${registeredCatalogTools.length}): ${registeredCatalogTools.join(", ") || "none"}`,
    `- not currently registered (${unavailableCatalogTools.length}): ${unavailableCatalogTools.join(", ") || "none"}`,
    `- active leases (${activeLeases.length}): ${activeLeases.join("; ") || "none"}`,
    `- baseline health: ${
      doctorReport.missingAlwaysActiveRegistrations.length === 0 &&
      doctorReport.inactiveAlwaysActiveTools.length === 0
        ? "ok"
        : "needs attention"
    }`,
    `- eager registration drift (${eagerRegistrationDrift.length}): ${eagerRegistrationDrift.join(", ") || "none"}`,
    `- unleased active catalog tools (${doctorReport.unleasedActiveCatalogTools.length}): ${doctorReport.unleasedActiveCatalogTools.join(", ") || "none"}`,
    `- partial lazy imports (${doctorReport.partialLazyImports.length}): ${doctorReport.partialLazyImports.join("; ") || "none"}`,
    `- recent lazy imports (${recentLazyImports.length}): ${
      recentLazyImports
        .map((record) => `${record.bundle}:${record.ok ? "ok" : "failed"}`)
        .join(", ") || "none"
    }`,
    "- startup profile: minimal active set is enforced on session_start when these tools are registered.",
  ].join("\n");
}

export default function toolboxDiscoveryExtension(pi: ExtensionAPI) {
  const state = createToolboxState();

  pi.on("session_start", () => {
    state.leases.clear();
    state.loadedBundles.clear();
    state.lazyImportRecords = [];
    applyMinimalStartupProfile(pi);
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
      "Discover, explain, activate, deactivate, or inspect pi-extension tool bundles while keeping heavyweight package tools off by default.",
    promptSnippet:
      "Discover and activate pi-extension capability bundles on demand; keep self, interview, dispatch_subagent, intercom, and Prompt Vault read tools active by default.",
    promptGuidelines: [
      "Use toolbox to discover domain-specific Pi tools before assuming a heavyweight custom tool is active.",
      "Do not activate mutating, external-mutation, or orchestrator-gated profiles without explicit user intent.",
    ],
    parameters: TOOLBOX_PARAMETERS,
    async execute(_toolCallId, rawParams) {
      const params = rawParams as ToolboxParams;
      const action = params.action ?? "status";

      if (action === "status") {
        return textResult(formatStatus(pi, state), {
          activeTools: pi.getActiveTools(),
          bundles: CATALOG.map((bundle) => bundle.id),
          leases: describeLeases(state),
          eagerRegistrationDrift: findEagerRegistrationDrift(pi, state),
          unleasedActiveCatalogTools: findUnleasedActiveCatalogTools(pi, state),
          partialLazyImports: findPartialLazyImportRecords(state),
        });
      }

      if (action === "doctor") {
        const report = buildDoctorReport(pi, state);
        return textResult(formatDoctor(report), report);
      }

      if (action === "plan") {
        const plan = planActivation(params);
        if (plan.errors.length > 0) {
          return textResult(`Cannot plan activation: ${plan.errors.join("; ")}`, {
            ok: false,
            errors: plan.errors,
          });
        }
        return textResult(formatActivationPlan(plan, pi), { ok: true, plan });
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
        const plan = planActivation(params);
        if (plan.errors.length > 0) {
          return textResult(`Cannot activate tools: ${plan.errors.join("; ")}`, {
            ok: false,
            errors: plan.errors,
          });
        }

        const riskJustification = params.riskJustification?.trim() ?? "";
        if (plan.requiresAcknowledgement && (!params.riskAcknowledged || !riskJustification)) {
          return textResult(
            `Refusing to activate ${plan.bundle?.id ?? "explicit-tools"}/${plan.profile?.id ?? "requested"} (${plan.risks.join(", ")}) without riskAcknowledged=true, riskJustification, and explicit user intent.`,
            { ok: false, risks: plan.risks, source: plan.source },
          );
        }

        const activeBeforeLazyImport = pi.getActiveTools();
        const lazyImport = await tryLazyImportBundle(
          pi,
          state,
          plan.bundle,
          plan.profile,
          plan.requestedTools,
        );
        const knownToolNames = getKnownToolNames(pi);
        const availableTools = plan.requestedTools.filter((tool) => knownToolNames.has(tool));
        const missingTools = plan.requestedTools.filter((tool) => !knownToolNames.has(tool));
        const restoredPreImportActive = activeBeforeLazyImport.filter((tool) =>
          knownToolNames.has(tool),
        );
        if (missingTools.length > 0) {
          pi.setActiveTools(restoredPreImportActive);
          return textResult(
            [
              `Cannot activate ${plan.bundle?.id ?? "explicit-tools"}/${plan.profile?.id ?? "requested"}: missing registered tools after lazy import: ${missingTools.join(", ")}`,
              lazyImport.attempted
                ? `Lazy import attempts: ${
                    lazyImport.records
                      .map(
                        (record) =>
                          `${record.ok ? "ok" : "failed"} ${record.specifier}: ${record.message}`,
                      )
                      .join("; ") || "none"
                  }`
                : plan.source === "explicit-tools"
                  ? "Explicit tool activation does not lazy-import bundles; activate by bundle/profile for latent tools."
                  : "No lazy import module is declared for this bundle.",
              "Restored active tools to the pre-import baseline.",
            ].join("\n"),
            {
              ok: false,
              missing: missingTools,
              lazyImport,
              activeTools: restoredPreImportActive,
              source: plan.source,
              risks: plan.risks,
            },
          );
        }

        const nextActive = [...new Set([...restoredPreImportActive, ...availableTools])];
        pi.setActiveTools(nextActive);
        const leases = recordLeases(state, availableTools, params, plan);
        const ttl = boundedTtlTurns(params.ttlTurns, plan.profile);

        const text = [
          `Activated tools: ${availableTools.join(", ") || "none"}`,
          lazyImport.attempted
            ? `Lazy import attempts: ${
                lazyImport.records
                  .map(
                    (record) =>
                      `${record.ok ? "ok" : "failed"} ${record.specifier}: ${record.message}`,
                  )
                  .join("; ") || "none"
              }`
            : undefined,
          plan.profile
            ? `Profile: ${plan.bundle?.id}/${plan.profile.id}; risk=${plan.profile.risk}; ttlTurns=${ttl}; pin=${params.pin === true}`
            : `Source: explicit-tools; risks=${plan.risks.join(", ") || "none"}; ttlTurns=${ttl}; pin=${params.pin === true}`,
        ]
          .filter(Boolean)
          .join("\n");

        return textResult(text, {
          ok: true,
          activated: availableTools,
          missing: missingTools,
          activeTools: nextActive,
          bundle: plan.bundle?.id,
          profile: plan.profile?.id,
          source: plan.source,
          risks: plan.risks,
          leases,
          lazyImport,
        });
      }

      if (action === "deactivate") {
        const plan = planActivation(params);
        if (plan.errors.length > 0) {
          return textResult(`Cannot deactivate tools: ${plan.errors.join("; ")}`, {
            ok: false,
            errors: plan.errors,
          });
        }
        const remove = new Set(plan.requestedTools);
        for (const tool of remove) {
          state.leases.delete(tool);
        }
        const nextActive = pi
          .getActiveTools()
          .filter((tool) => !remove.has(tool) || ALWAYS_ACTIVE_TOOLS.includes(tool));
        pi.setActiveTools(nextActive);
        const protectedTools = plan.requestedTools.filter((tool) =>
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
