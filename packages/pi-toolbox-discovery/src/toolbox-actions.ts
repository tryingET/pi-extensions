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

    const activeBeforeActivation = pi.getActiveTools();
    const knownToolNames = getKnownToolNames(pi);
    const availableTools = plan.requestedTools.filter((tool) => knownToolNames.has(tool));
    const missingTools = plan.requestedTools.filter((tool) => !knownToolNames.has(tool));
    const currentActiveTools = activeBeforeActivation.filter((tool) => knownToolNames.has(tool));
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

    const nextActive = [...new Set([...currentActiveTools, ...availableTools])];
    const activeBeforeSet = new Set(currentActiveTools);
    const activatedNewTools = availableTools.filter((tool) => !activeBeforeSet.has(tool));
    pi.setActiveTools(nextActive);
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
      activatedNewTools,
      missing: missingTools,
      activeTools: nextActive,
      continuation,
      bundle: plan.bundle?.id,
      profile: plan.profile?.id,
      source: plan.source,
      risks: plan.risks,
      leases,
      schemaVisibility: {
        activeSetUpdated: true,
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
    for (const tool of remove) {
      state.leases.delete(tool);
    }
    const nextActive = pi
      .getActiveTools()
      .filter((tool) => !remove.has(tool) || ALWAYS_ACTIVE_TOOLS.includes(tool));
    pi.setActiveTools(nextActive);
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
      { ok: true, activeTools: nextActive, protectedTools },
    );
  }

  return textResult(`Unknown toolbox action: ${action}`, { ok: false });
}
