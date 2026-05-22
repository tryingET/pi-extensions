import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CATALOG } from "./toolbox-catalog.ts";
import {
  ACTIVATION_CONTINUATION_MESSAGE,
  type ActivationLease,
  type ActivationPlan,
  ALWAYS_ACTIVE_TOOLS,
  CACHE_IMPACT_CONTRACT,
  DEFAULT_TTL_TURNS,
  MAX_TTL_TURNS,
  type ToolboxBundle,
  type ToolboxParams,
  type ToolboxProfile,
  type ToolboxRisk,
  type ToolboxState,
  type ToolCatalogMatch,
} from "./toolbox-contract.ts";

const normalizeText = (value: string | undefined): string => (value ?? "").trim().toLowerCase();

export function findBundle(bundleId: string | undefined): ToolboxBundle | undefined {
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

export function searchCatalog(query: string | undefined): ToolboxBundle[] {
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

export function formatBundle(bundle: ToolboxBundle): string {
  const profiles = bundle.profiles
    .map((profile) => `${profile.id}(${profile.risk}: ${profile.tools.join(", ")})`)
    .join("; ");
  return `- ${bundle.id}: ${bundle.title} — ${bundle.description}\n  owner: ${bundle.ownerPackage}\n  profiles: ${profiles}`;
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

export function planActivation(params: ToolboxParams): ActivationPlan {
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

export function createToolboxState(): ToolboxState {
  return {
    turn: 0,
    leases: new Map(),
  };
}

export function getKnownToolNames(pi: ExtensionAPI): Set<string> {
  return new Set(pi.getAllTools().map((tool) => tool.name));
}

export function boundedTtlTurns(
  requested: number | undefined,
  profile: ToolboxProfile | undefined,
): number {
  const fallback = profile?.defaultTtlTurns ?? DEFAULT_TTL_TURNS;
  const candidate = Number.isFinite(requested) ? Math.floor(requested as number) : fallback;
  return Math.max(1, Math.min(MAX_TTL_TURNS, candidate));
}

export function applyStandardStartupProfile(pi: ExtensionAPI): string[] {
  const registered = getKnownToolNames(pi);
  const standard = ALWAYS_ACTIVE_TOOLS.filter((tool) => registered.has(tool));
  pi.setActiveTools(standard);
  return standard;
}

export function recordLeases(
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

export function expireLeases(pi: ExtensionAPI, state: ToolboxState): string[] {
  state.turn += 1;
  const expired = [...state.leases.values()].filter(
    (lease) => !lease.pinned && (lease.expiresAtTurn ?? Number.POSITIVE_INFINITY) < state.turn,
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

export function describeLeases(state: ToolboxState): string[] {
  return [...state.leases.values()].map((lease) => {
    const remainingTurns = Math.max(0, (lease.expiresAtTurn ?? state.turn) - state.turn);
    const lifetime = lease.pinned
      ? "pinned"
      : remainingTurns === 0
        ? "expires after current turn"
        : `expires in ${remainingTurns} turn(s)`;
    const source = [lease.bundle, lease.profile].filter(Boolean).join("/") || "explicit-tools";
    const riskNote = lease.riskJustification ? `; risk=${lease.riskJustification}` : "";
    return `${lease.tool} (${source}; ${lifetime}${riskNote})`;
  });
}

export async function queueActivationContinuation(
  pi: ExtensionAPI,
  params: ToolboxParams,
  activatedNewTools: string[],
  plan: ActivationPlan,
): Promise<{ queued: boolean; reason?: string }> {
  if (activatedNewTools.length === 0) {
    return { queued: false, reason: "active-set-unchanged" };
  }
  if (params.autoContinue === false) {
    return { queued: false, reason: "disabled-by-request" };
  }

  const sender = pi as ExtensionAPI & {
    sendMessage?: (
      message: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => Promise<void> | void;
  };
  if (typeof sender.sendMessage !== "function") {
    return { queued: false, reason: "pi-send-message-unavailable" };
  }

  try {
    await sender.sendMessage(
      {
        customType: "toolbox-activation-continuation",
        content: ACTIVATION_CONTINUATION_MESSAGE,
        display: true,
        details: {
          activatedTools: activatedNewTools,
          bundle: plan.bundle?.id,
          profile: plan.profile?.id,
          source: plan.source,
          cacheImpact: CACHE_IMPACT_CONTRACT,
        },
      },
      { triggerTurn: true, deliverAs: "steer" },
    );
    return { queued: true };
  } catch (error) {
    return {
      queued: false,
      reason:
        error instanceof Error ? `send-message-failed: ${error.message}` : "send-message-failed",
    };
  }
}

export function formatActivationPlan(plan: ActivationPlan, pi: ExtensionAPI): string {
  const knownToolNames = getKnownToolNames(pi);
  const registeredTools = plan.requestedTools.filter((tool) => knownToolNames.has(tool));
  const missingTools = plan.requestedTools.filter((tool) => !knownToolNames.has(tool));
  return [
    "toolbox activation plan",
    `- source: ${plan.source}`,
    `- target: ${plan.bundle?.id ?? "explicit-tools"}/${plan.profile?.id ?? "requested"}`,
    `- requested tools (${plan.requestedTools.length}): ${plan.requestedTools.join(", ") || "none"}`,
    `- registered now (${registeredTools.length}): ${registeredTools.join(", ") || "none"}`,
    `- missing now (${missingTools.length}): ${missingTools.join(", ") || "none"}`,
    `- risks: ${plan.risks.join(", ") || "none"}`,
    `- acknowledgement required: ${plan.requiresAcknowledgement ? "yes" : "no"}`,
    "- owner module imports: none; toolbox will not import/register owner tools",
    "- activation effect: active-tool set only; registered tools become prompt/provider visible on the next provider request after activation",
    "- limitation: already-issued provider requests and external client schema snapshots cannot be changed retroactively",
  ].join("\n");
}
