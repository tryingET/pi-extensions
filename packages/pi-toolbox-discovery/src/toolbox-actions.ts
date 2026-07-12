// ---
// summary: executes toolbox discovery, planning, activation, deactivation, doctor, and recommendation actions.
// read_when:
//   - changing toolbox tool responses, risk gates, or active-set mutations.
// ---
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CATALOG } from "./toolbox-catalog.ts";
import {
  ACTIVATION_VISIBILITY_CONTRACT,
  ALWAYS_ACTIVE_TOOLS,
  CACHE_IMPACT_CONTRACT,
  MISSING_REGISTRATION_CONTRACT,
  type ToolboxParams,
  type ToolboxState,
} from "./toolbox-contract.ts";
import {
  buildDoctorReport,
  findMissingCatalogRegistrations,
  findUnleasedActiveCatalogTools,
  formatDoctor,
  formatStatus,
} from "./toolbox-reports.ts";
import {
  boundedTtlTurns,
  describeLeases,
  findBundle,
  formatActivationPlan,
  formatBundle,
  getKnownToolNames,
  mutateActiveToolsVerified,
  planActivation,
  queueActivationContinuation,
  recordLeases,
  searchCatalog,
} from "./toolbox-runtime.ts";

function textResult(text: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text }], details };
}

export async function executeToolboxAction(
  pi: ExtensionAPI,
  state: ToolboxState,
  rawParams: unknown,
) {
  const params = rawParams as ToolboxParams;
  const action = params.action ?? "status";

  if (action === "status") {
    return textResult(formatStatus(pi, state), {
      activeTools: pi.getActiveTools(),
      bundles: CATALOG.map((bundle) => bundle.id),
      leases: describeLeases(state),
      missingCatalogRegistrations: findMissingCatalogRegistrations(pi),
      unleasedActiveCatalogTools: findUnleasedActiveCatalogTools(pi, state),
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

  if (action === "recommend") {
    const recommendations = recommendToolboxProfiles(pi, params.query);
    if (recommendations.length === 0) {
      return textResult(
        'No toolbox recommendation matched. Try toolbox({ action: "search", query: "<capability>" }) or inspect toolbox({ action: "doctor" }).',
        { ok: true, recommendations: [] },
      );
    }
    return textResult(formatRecommendations(recommendations), {
      ok: true,
      recommendations: recommendations.map((item) => ({
        bundle: item.bundle.id,
        profile: item.profile.id,
        risk: item.profile.risk,
        score: item.score,
        registered: item.registeredTools,
        missing: item.missingTools,
        active: item.activeTools,
        activation: item.activation,
      })),
      mutatesActiveSet: false,
    });
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
        `Refusing to activate ${plan.bundle?.id ?? "explicit-tools"}/${plan.profile?.id ?? "requested"} (${plan.risks.join(", ")}) without riskAcknowledged=true and riskJustification. These caller-supplied fields are an advisory risk declaration, not proof of operator consent.`,
        {
          ok: false,
          risks: plan.risks,
          source: plan.source,
          acknowledgementSemantics: "caller-declaration-not-operator-consent",
        },
      );
    }

    let knownToolNames: Set<string>;
    try {
      knownToolNames = getKnownToolNames(pi);
    } catch {
      return textResult(
        "Cannot activate tools because Pi registered-tool truth could not be read; no active-set or lease change was attempted. Run toolbox doctor or /reload before retrying.",
        { ok: false, failureClass: "registered_tool_snapshot_failed" },
      );
    }
    const availableTools = plan.requestedTools.filter((tool) => knownToolNames.has(tool));
    const missingTools = plan.requestedTools.filter((tool) => !knownToolNames.has(tool));
    let currentActiveTools: string[];
    try {
      currentActiveTools = pi.getActiveTools();
    } catch {
      return textResult(
        "Cannot activate tools because Pi active-set truth could not be read; no activation or lease change was attempted. Run toolbox doctor or /reload before retrying.",
        { ok: false, failureClass: "active_set_snapshot_failed" },
      );
    }
    if (missingTools.length > 0) {
      return textResult(
        [
          `Cannot activate ${plan.bundle?.id ?? "explicit-tools"}/${plan.profile?.id ?? "requested"}: tools are not registered in this Pi session: ${missingTools.join(", ")}`,
          "Toolbox can only manage the active set of tools already registered in this Pi runtime.",
          MISSING_REGISTRATION_CONTRACT,
        ].join("\n"),
        {
          ok: false,
          missing: missingTools,
          activeTools: currentActiveTools,
          source: plan.source,
          risks: plan.risks,
        },
      );
    }

    const baseline = ALWAYS_ACTIVE_TOOLS.filter((tool) => knownToolNames.has(tool));
    const mutation = mutateActiveToolsVerified(pi, (before) => [
      ...before,
      ...baseline,
      ...availableTools,
    ]);
    if (!mutation.ok) {
      const activeTools = mutation.rollbackAttempted
        ? mutation.rollbackObserved
        : mutation.observed;
      return textResult(
        [
          `Cannot activate ${plan.bundle?.id ?? "explicit-tools"}/${plan.profile?.id ?? "requested"}: Pi did not verify the complete requested active set.`,
          `Failure class: ${mutation.failureClass}; rollback attempted=${mutation.rollbackAttempted}; rollback succeeded=${mutation.rollbackSucceeded}.`,
          mutation.rollbackSucceeded
            ? "The pre-activation active set is intact; no leases were recorded and no continuation was queued."
            : "Active-set state is degraded or unknown; run toolbox doctor and /reload before relying on tool visibility.",
        ].join("\n"),
        {
          ok: false,
          failureClass: mutation.failureClass,
          activeTools,
          mutation,
          leasesChanged: false,
          continuation: { queued: false, reason: "activation-not-verified" },
        },
      );
    }

    const activeBeforeSet = new Set(mutation.before);
    const requestedNewTools = availableTools.filter((tool) => !activeBeforeSet.has(tool));
    const activatedNewTools = mutation.observed.filter((tool) => !activeBeforeSet.has(tool));
    const nextActive = mutation.observed;
    const leases = recordLeases(state, availableTools, params, plan);
    const ttl = boundedTtlTurns(params.ttlTurns, plan.profile);
    const continuation = await queueActivationContinuation(pi, params, activatedNewTools, plan);

    const text = [
      `Activated tools: ${availableTools.join(", ") || "none"}`,
      plan.profile
        ? `Profile: ${plan.bundle?.id}/${plan.profile.id}; risk=${plan.profile.risk}; ttlTurns=${ttl}; pin=${params.pin === true}`
        : `Source: explicit-tools; risks=${plan.risks.join(", ") || "none"}; ttlTurns=${ttl}; pin=${params.pin === true}`,
      ACTIVATION_VISIBILITY_CONTRACT,
      continuation.queued
        ? "Continuation: queued a same-task provider turn so the model can see the refreshed active-tool schema."
        : `Continuation: not queued (${continuation.reason ?? "unknown"}).`,
      CACHE_IMPACT_CONTRACT,
    ]
      .filter(Boolean)
      .join("\n");

    return textResult(text, {
      ok: true,
      activated: availableTools,
      requestedNewTools,
      activatedNewTools,
      missing: missingTools,
      activeTools: nextActive,
      continuation,
      bundle: plan.bundle?.id,
      profile: plan.profile?.id,
      source: plan.source,
      risks: plan.risks,
      acknowledgementSemantics: plan.requiresAcknowledgement
        ? "caller-declaration-not-operator-consent"
        : "not-required",
      leases,
      activeSetMutation: mutation,
      schemaVisibility: {
        activeSetUpdated: true,
        activeSetVerified: true,
        nextProviderRequest: true,
        retroactiveCurrentProviderRequest: false,
        externalClientSchemaSnapshotRefresh: "reload-or-new-session-if-client-does-not-refresh",
      },
      cacheImpact: {
        firstRequestForNewToolCombinationMayMissCache: true,
        stableToolCombinationCanReuseCacheAfterward: true,
        avoidFrequentToolSetOscillation: true,
      },
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
    let registered: Set<string>;
    try {
      registered = getKnownToolNames(pi);
    } catch {
      return textResult(
        "Cannot deactivate tools because Pi registered-tool truth could not be read; no active-set or lease change was attempted. Run toolbox doctor or /reload before retrying.",
        { ok: false, failureClass: "registered_tool_snapshot_failed" },
      );
    }
    const baseline = ALWAYS_ACTIVE_TOOLS.filter((tool) => registered.has(tool));
    const mutation = mutateActiveToolsVerified(pi, (before) => [
      ...before.filter((tool) => !remove.has(tool) || ALWAYS_ACTIVE_TOOLS.includes(tool)),
      ...baseline,
    ]);
    if (!mutation.ok) {
      const activeTools = mutation.rollbackAttempted
        ? mutation.rollbackObserved
        : mutation.observed;
      return textResult(
        [
          "Cannot deactivate tools because Pi did not verify the complete requested active set.",
          `Failure class: ${mutation.failureClass}; rollback attempted=${mutation.rollbackAttempted}; rollback succeeded=${mutation.rollbackSucceeded}.`,
          mutation.rollbackSucceeded
            ? "The pre-deactivation active set and leases are intact."
            : "Active-set state is degraded or unknown; run toolbox doctor and /reload before relying on lease or visibility state.",
        ].join("\n"),
        {
          ok: false,
          failureClass: mutation.failureClass,
          activeTools,
          mutation,
          leasesChanged: false,
        },
      );
    }
    for (const tool of remove) {
      state.leases.delete(tool);
    }
    const nextActive = mutation.observed;
    const protectedTools = plan.requestedTools.filter((tool) => ALWAYS_ACTIVE_TOOLS.includes(tool));
    return textResult(
      [
        `Deactivated requested tools except protected always-active tools. Active tools: ${nextActive.join(", ") || "none"}`,
        protectedTools.length > 0
          ? `Protected always-active tools retained: ${protectedTools.join(", ")}`
          : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      { ok: true, activeTools: nextActive, protectedTools, activeSetMutation: mutation },
    );
  }

  return textResult(`Unknown toolbox action: ${action}`, { ok: false });
}

interface ToolboxRecommendation {
  bundle: (typeof CATALOG)[number];
  profile: (typeof CATALOG)[number]["profiles"][number];
  score: number;
  reason: string;
  registeredTools: string[];
  missingTools: string[];
  activeTools: string[];
  activation: string;
}

function recommendToolboxProfiles(
  pi: ExtensionAPI,
  query: string | undefined,
): ToolboxRecommendation[] {
  const normalizedQuery = normalizeRecommendationText(query);
  const terms = normalizedQuery
    .split(/\s+/u)
    .filter((term) => term.length >= 3 && !RECOMMENDATION_STOPWORDS.has(term));
  const registered = getKnownToolNames(pi);
  const active = new Set(pi.getActiveTools());

  return CATALOG.flatMap((bundle) =>
    bundle.profiles.map((profile) => {
      const haystack = normalizeRecommendationText(
        [
          bundle.id,
          bundle.title,
          bundle.description,
          bundle.ownerPackage,
          bundle.ownerSemantics,
          ...bundle.keywords,
          profile.id,
          profile.description,
          profile.risk,
          ...profile.tools,
        ].join(" "),
      );
      const queryScore = normalizedQuery
        ? terms.reduce((score, term) => score + (haystack.includes(term) ? 2 : 0), 0) +
          (terms.length > 0 && haystack.includes(normalizedQuery) ? 4 : 0)
        : 1;
      const queryMatched = !normalizedQuery || queryScore > 0;
      const registeredTools = profile.tools.filter((tool) => registered.has(tool));
      const missingTools = profile.tools.filter((tool) => !registered.has(tool));
      const activeTools = registeredTools.filter((tool) => active.has(tool));
      const availabilityScore = registeredTools.length > 0 ? 2 : -2;
      const safetyScore = profile.requiresExplicitUserIntent ? -1 : 1;
      const score = queryMatched ? queryScore + availabilityScore + safetyScore : 0;
      return {
        bundle,
        profile,
        score,
        reason: buildRecommendationReason(normalizedQuery, registeredTools, missingTools),
        registeredTools,
        missingTools,
        activeTools,
        activation: buildActivationSuggestion(
          bundle.id,
          profile.id,
          profile.requiresExplicitUserIntent,
        ),
      };
    }),
  )
    .filter((item) => item.score > 0)
    .sort(
      (left, right) => right.score - left.score || left.bundle.id.localeCompare(right.bundle.id),
    )
    .slice(0, 5);
}

function formatRecommendations(recommendations: ToolboxRecommendation[]): string {
  return [
    "Toolbox recommendations (read-only; active tool set unchanged):",
    ...recommendations.map((item, index) =>
      [
        `${index + 1}. ${item.bundle.id}/${item.profile.id} (${item.profile.risk}) — ${item.bundle.title}`,
        `   why: ${item.reason}`,
        `   registered: ${item.registeredTools.join(", ") || "none"}`,
        item.missingTools.length > 0 ? `   missing: ${item.missingTools.join(", ")}` : undefined,
        `   next: ${item.activation}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "Activation remains explicit; mutating, external-mutation, and orchestrator-gated profiles require a caller-supplied riskAcknowledged/riskJustification declaration. That declaration is advisory and does not prove operator consent.",
  ].join("\n");
}

function buildRecommendationReason(
  normalizedQuery: string,
  registeredTools: string[],
  missingTools: string[],
): string {
  const queryNote = normalizedQuery
    ? `matches task text '${normalizedQuery}'`
    : "general catalog default";
  const availability =
    registeredTools.length > 0
      ? `${registeredTools.length} requested tool(s) registered in this Pi runtime`
      : "owner tools are not registered in this Pi runtime";
  const missing =
    missingTools.length > 0 ? `; ${missingTools.length} missing until owner package reload` : "";
  return `${queryNote}; ${availability}${missing}`;
}

function buildActivationSuggestion(
  bundleId: string,
  profileId: string,
  requiresAcknowledgement: boolean,
): string {
  const base = `toolbox({ action: "activate", bundle: "${bundleId}", profile: "${profileId}"`;
  return requiresAcknowledgement
    ? `${base}, riskAcknowledged: true, riskJustification: "<caller-stated risk rationale>" })`
    : `${base} })`;
}

const RECOMMENDATION_STOPWORDS = new Set([
  "what",
  "which",
  "should",
  "would",
  "could",
  "tool",
  "tools",
  "bundle",
  "bundles",
  "use",
  "using",
  "need",
  "needs",
  "needed",
  "please",
  "help",
  "with",
  "for",
  "the",
  "and",
  "that",
  "this",
]);

function normalizeRecommendationText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[_-]+/gu, " ").replace(/\s+/gu, " ");
}
