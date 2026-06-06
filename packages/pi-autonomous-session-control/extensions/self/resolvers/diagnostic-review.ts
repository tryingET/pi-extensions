/**
 * Diagnostic-review resolver for self/meta queries.
 *
 * This surface is mirror-only: it can describe diagnostic and self-evolution
 * candidates, but it must not write agent_vent, AK/evidence, KES, ontology,
 * visible-loop, measured-campaign, issue, incident, or telemetry state.
 */

import { normalizeInput, normalizeString, normalizeStringArray } from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";
import { buildReflectionGuard } from "./reflection-guard.ts";

function collectConstraintText(query: SelfQuery | undefined): string[] {
  const context = normalizeInput(query?.context);
  const text: string[] = [];
  const add = (value: unknown): void => {
    const normalized = normalizeString(value);
    if (normalized) text.push(normalized);
  };
  const addArray = (value: unknown): void => {
    const normalized = normalizeStringArray(value);
    if (normalized) text.push(...normalized);
  };

  add(query?.query);
  add(context.constraints);
  add(context.constraint);
  add(context.nonAuthorizations);
  add(context.non_authorizations);
  add(context.nonAuthorisations);
  add(context.disallowedSurfaces);
  add(context.disallowed_self_actions);
  add(context.disallowedSelfActions);
  add(context.forbiddenSurfaces);
  addArray(context.constraints);
  addArray(context.nonAuthorizations);
  addArray(context.non_authorizations);
  addArray(context.nonAuthorisations);
  addArray(context.disallowedSurfaces);
  addArray(context.disallowed_self_actions);
  addArray(context.disallowedSelfActions);
  addArray(context.forbiddenSurfaces);

  return text;
}

function disallowsAgentVentSuggestion(query: SelfQuery | undefined): boolean {
  const text = collectConstraintText(query).join("\n").toLowerCase();
  if (!/agent[_ -]?vent/.test(text)) return false;

  return (
    /\b(no|avoid|omit|exclude|disallow|forbid)\s+agent[_ -]?vent\b/.test(text) ||
    /\b(do not|don't|dont|must not|not authorized to|not authorised to)\b[^\n.]{0,80}\bagent[_ -]?vent\b/.test(
      text,
    ) ||
    /\bagent[_ -]?vent\b[^\n.]{0,80}\b(disallowed|forbidden|not authorized|not authorised|out of scope|off limits)\b/.test(
      text,
    )
  );
}

function buildDiagnosticCandidate(
  query: SelfQuery | undefined,
  state: SelfState,
): Record<string, unknown> {
  const context = normalizeInput(query?.context);
  const agentVentDisallowed = disallowsAgentVentSuggestion(query);
  const latestError = [...state.operations.errors].sort(
    (a, b) => (b.lastSeen ?? b.timestamp) - (a.lastSeen ?? a.timestamp),
  )[0];
  const latestFailedCommand = [...state.operations.commands]
    .filter((command) => !command.success)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  const contextSummary =
    normalizeString(context.summary) ||
    normalizeString(context.diagnosticSummary) ||
    normalizeString(context.correction) ||
    normalizeString(context.current_question) ||
    normalizeString(context.objective) ||
    normalizeString(context.task) ||
    normalizeString(context.focus) ||
    normalizeString(context.packageFocus) ||
    normalizeString(context.observed_behavior);
  const summary =
    contextSummary ||
    (latestError
      ? `recent ${latestError.toolName} friction: ${latestError.signature}`
      : undefined) ||
    (latestFailedCommand
      ? `recent failed command friction: ${latestFailedCommand.command}`
      : undefined) ||
    "self did not have a crisp affordance for the operator's diagnostic or improvement query";
  const category =
    normalizeString(context.category) ||
    (contextSummary
      ? "context_alignment"
      : latestError || latestFailedCommand
        ? "tool_failure"
        : "missing_affordance");
  const tool =
    normalizeString(context.tool) || (contextSummary ? "self" : latestError?.toolName) || "self";
  const packageName =
    normalizeString(context.packageName) ||
    normalizeString(context.package) ||
    "pi-autonomous-session-control";
  const agentVentPreviewCommand = `agent_vent({ action: "preview", category: ${JSON.stringify(category)}, tool: ${JSON.stringify(tool)}, packageName: ${JSON.stringify(packageName)}, summary: ${JSON.stringify(summary)} })`;
  const agentVentRecordCommand = `agent_vent({ action: "record", category: ${JSON.stringify(category)}, tool: ${JSON.stringify(tool)}, packageName: ${JSON.stringify(packageName)}, summary: ${JSON.stringify(summary)} })`;

  return {
    kind: "self.diagnostic_candidate.v1",
    summary,
    category,
    tool,
    package: packageName,
    sourceQuery: query?.query ?? "diagnostic review requested",
    suggestedOwnerSurface: agentVentDisallowed ? "self_diagnostic_review_only" : "agent_vent",
    agentVentSuggestionAllowed: !agentVentDisallowed,
    boundary: agentVentDisallowed
      ? "candidate-only local diagnostic suggestion; current constraints disallow agent_vent suggestions, and self does not create AK/evidence/incident state"
      : "candidate-only local diagnostic suggestion; self does not record agent_vent entries or create AK/evidence/incident state",
    mirrorEvidence: {
      latestError: latestError
        ? {
            toolName: latestError.toolName,
            signature: latestError.signature,
            count: latestError.count,
            activeCount: latestError.activeCount,
          }
        : undefined,
      latestFailedCommand: latestFailedCommand
        ? {
            command: latestFailedCommand.command,
            timestamp: latestFailedCommand.timestamp,
          }
        : undefined,
    },
    copyableCommands: agentVentDisallowed
      ? ["self feedback summary", "capability discovery"]
      : [
          'toolbox({ action: "activate", bundle: "agent_vent" })',
          agentVentPreviewCommand,
          agentVentRecordCommand,
        ],
  };
}

type InsightPromotionStatus =
  | "session_only_unpromoted"
  | "promoted"
  | "explicitly_deferred"
  | "unknown";

const DEFAULT_EVOLUTION_NON_AUTHORIZATIONS = [
  "no AK task/evidence/decision writes from self",
  "no agent_vent record without explicit operator/tool action",
  "no ontology/KES/Prompt Vault mutation from self",
  "no visible-loop launch or measured campaign execution from self",
  "no action-state mutation from diagnostic/self-evolution queries",
] as const;

function normalizeInsightPromotionStatus(value: unknown): InsightPromotionStatus {
  const normalized = normalizeString(value)?.toLowerCase();
  if (!normalized) return "session_only_unpromoted";

  if (normalized === "promoted") return "promoted";
  if (normalized === "explicitly_deferred") return "explicitly_deferred";
  if (
    normalized === "session_only_unpromoted" ||
    normalized === "candidate_only_not_promoted" ||
    normalized === "not_promoted" ||
    normalized === "unpromoted"
  ) {
    return "session_only_unpromoted";
  }

  return "unknown";
}

function combineNonAuthorizations(context: Record<string, unknown>): string[] {
  const callerNonAuthorizations = normalizeStringArray(context.nonAuthorizations) ?? [];
  const merged = [...callerNonAuthorizations];

  for (const defaultNonAuthorization of DEFAULT_EVOLUTION_NON_AUTHORIZATIONS) {
    if (!merged.includes(defaultNonAuthorization)) {
      merged.push(defaultNonAuthorization);
    }
  }

  return merged;
}

function buildInsightPromotionCue(
  context: Record<string, unknown>,
  owner: string,
): Record<string, unknown> {
  const sourceArtifact =
    normalizeString(context.sourceArtifact) ||
    normalizeString(context.source) ||
    normalizeString(context.sessionArtifact) ||
    "current Pi session mirror";
  const explicitPromotionOwner =
    normalizeString(context.promotionOwner) ||
    normalizeString(context.sourceOwner) ||
    normalizeString(context.owner) ||
    normalizeString(context.packageName) ||
    normalizeString(context.package);
  const explicitPromotionTarget = normalizeString(context.promotionTarget);
  const promotionOwner = explicitPromotionOwner || owner;
  const promotionTarget = explicitPromotionTarget || `${promotionOwner} owner surface`;
  const status = normalizeInsightPromotionStatus(
    normalizeString(context.promotionStatus) || normalizeString(context.insightPromotionStatus),
  );
  const deferReason =
    normalizeString(context.promotionDeferReason) || normalizeString(context.deferReason);
  const hasExplicitDeferralDestination = Boolean(explicitPromotionOwner || explicitPromotionTarget);
  const hasResolvedDeferral =
    status === "explicitly_deferred" && Boolean(deferReason) && hasExplicitDeferralDestination;
  const requiredBeforeCompletion = !(status === "promoted" || hasResolvedDeferral);

  const risk = (() => {
    switch (status) {
      case "promoted":
        return "low if the named owner surface really contains the durable summary";
      case "explicitly_deferred":
        return hasResolvedDeferral
          ? "accepted only because the defer reason and owner/target are explicit in closeout"
          : "defer claim incomplete: explicit deferral needs an owner/target and reason before completion";
      case "unknown":
        return "unknown promotion status risk: treat as unpromoted until the owner surface verifies it";
      case "session_only_unpromoted":
        return "lost rationale risk: session-only analysis can disappear before the owner surface sees it";
    }
  })();
  const nextAction = (() => {
    switch (status) {
      case "promoted":
        return "verify the named owner surface before claiming completion";
      case "explicitly_deferred":
        return hasResolvedDeferral
          ? `state the defer reason and owner/target before completion (${deferReason})`
          : "add an explicit defer reason plus owner/target, or promote the durable portion before completion";
      case "unknown":
        return "normalize the promotion status to promoted, explicitly_deferred with reason, or session_only_unpromoted before completion";
      case "session_only_unpromoted":
        return "promote the durable portion to the owning surface or explicitly defer with owner/target and reason before completion";
    }
  })();

  return {
    kind: "self.insight_promotion_cue.v1",
    sourceArtifact,
    status,
    owner: promotionOwner,
    target: promotionTarget,
    requiredBeforeCompletion,
    risk,
    nextAction,
    boundary:
      "mirror-only promotion cue; ASC/self does not write owner docs, AK/evidence, KES, ontology, Prompt Vault, agent_vent, visible-loop, issues, incidents, or telemetry",
    nonAuthorizations: [
      "no owner-surface write from insight promotion cue",
      "no claim that session JSONL, subagent output, or compaction text is durable promotion by itself",
      "no AK/evidence/KES/ontology/Prompt Vault/agent_vent/visible-loop mutation from this cue",
    ],
  };
}

function buildEvolutionCandidate(
  query: SelfQuery | undefined,
  diagnosticCandidate: Record<string, unknown>,
): Record<string, unknown> {
  const context = normalizeInput(query?.context);
  const friction =
    normalizeString(context.friction) ||
    normalizeString(diagnosticCandidate.summary) ||
    "self-evolution friction was observed, but the specific friction was not named";
  const owner =
    normalizeString(context.owner) ||
    normalizeString(context.packageName) ||
    normalizeString(context.package) ||
    "pi-autonomous-session-control";
  const metric =
    normalizeString(context.metric) ||
    "fewer wrong-owner or unsafe self suggestions; diagnostic query does not mutate action state";
  const falsifier =
    normalizeString(context.falsifier) ||
    "the proposed fix is wrong if the same query still routes to an unsafe owner, lacks a metric, or mutates state without an explicit action directive";
  const nextSafeTest =
    normalizeString(context.nextSafeTest) ||
    "add or run a focused regression that proves the diagnostic query remains mirror-only, then run the package check";
  const autonomyLevel = normalizeString(context.autonomyLevel) || "suggest";
  const insightPromotionCue = buildInsightPromotionCue(context, owner);
  const reflectionGuard = buildReflectionGuard(query, context);
  const sourceArtifact = String(insightPromotionCue.sourceArtifact ?? "current Pi session mirror");
  const promotionStatus = String(insightPromotionCue.status ?? "session_only_unpromoted");

  return {
    kind: "self.evolution_candidate.v1",
    friction,
    hypothesis:
      normalizeString(context.hypothesis) ||
      "self lacked an explicit typed promotion/evolution contract, so valuable session-only analysis could be narrowed into the next implementation slice and lose strategic rationale",
    falsifier,
    metric,
    owner,
    autonomyLevel,
    nextSafeTest,
    nonAuthorizations: combineNonAuthorizations(context),
    sourceArtifact,
    promotionStatus,
    insightPromotionCue,
    reflectionGuard,
    trace: {
      observe: friction,
      orient: `owner=${owner}; autonomyLevel=${autonomyLevel}; metric=${metric}`,
      decide: "surface a typed candidate and route implementation/evidence to the owning surface",
      act: "mirror-only suggestion unless an explicit action directive is provided",
      check:
        reflectionGuard.requiresExternalCheck === true
          ? String(reflectionGuard.nextAction)
          : nextSafeTest,
    },
    criticLenses: {
      ownerBoundary: "does the suggested next step belong to self/ASC or another owner surface?",
      evidenceSufficiency: "is there file, test, command, or session evidence beyond vibes?",
      operatorFriction: "does this reduce avoidable operator correction loops?",
      validation: "what focused regression or dogfood falsifies the change?",
      routing:
        "should this become agent_vent recurrence, visible-loop work, autoresearch campaign, or owner docs?",
    },
    decisionBudget: {
      expectedCost:
        normalizeString(context.expectedCost) ||
        "small focused implementation or docs-routing slice",
      uncertainty:
        normalizeString(context.uncertainty) ||
        "medium until regression/live dogfood confirms routing",
      reversible: context.reversible !== false,
      goodEnoughStop:
        normalizeString(context.goodEnoughStop) ||
        "stop after the focused regression and package check pass, then require owner review for broader durable mutation",
    },
  };
}

export function resolveDiagnosticReviewQuery(
  query: SelfQuery | undefined,
  state: SelfState,
): SelfResponse {
  const diagnosticCandidate = buildDiagnosticCandidate(query, state);
  const evolutionCandidate = buildEvolutionCandidate(query, diagnosticCandidate);
  const agentVentSuggestionAllowed = diagnosticCandidate.agentVentSuggestionAllowed !== false;
  const ownerBoundaryLine = agentVentSuggestionAllowed
    ? "- agent_vent owns durable local recurrence memory if the operator explicitly records the diagnostic."
    : "- current constraints disallow agent_vent suggestions; self omits agent_vent activation, preview, and record commands.";
  const allowedNextSurfaces = agentVentSuggestionAllowed
    ? [
        "toolbox activation",
        "agent_vent preview by explicit operator/tool call",
        "agent_vent record by explicit operator/tool call after preview/review",
        "visible-loop only after owner/metric/falsifier/non-authorizations are explicit",
        "owner docs/task/evidence/learning surfaces only through their owners",
      ]
    : [
        "self feedback summary",
        "capability discovery",
        "visible-loop only after owner/metric/falsifier/non-authorizations are explicit",
        "owner docs/task/evidence/learning surfaces only through their owners",
      ];
  const suggestions = agentVentSuggestionAllowed
    ? [
        'toolbox({ action: "activate", bundle: "agent_vent" })',
        "agent_vent preview before record for the suggested payload",
        "capability discovery",
      ]
    : ["self feedback summary", "capability discovery"];
  const reflectionGuard = evolutionCandidate.reflectionGuard as Record<string, unknown> | undefined;
  const externalCheckEvidence = reflectionGuard?.externalCheckEvidence as
    | Record<string, unknown>
    | undefined;
  const provenance = externalCheckEvidence?.provenance;
  const provenanceCount = Array.isArray(provenance) ? provenance.length : 0;

  return {
    understood: true,
    intent: "meta",
    answer: `Diagnostic review: self can notice local operator/tooling friction and propose candidate payloads, but it remains mirror-only.

Boundary:
- self owns moment-level reflection: what just happened and what affordance was missing.
- toolbox owns capability activation when a separate tool is needed.
${ownerBoundaryLine}
- owner docs, visible-loop, autoresearch, AK/evidence, KES, Prompt Vault, and ontology remain separate owner surfaces.

Suggested diagnostic candidate (${String(diagnosticCandidate.kind)}): ${String(diagnosticCandidate.summary)}; ownerSurface=${String(diagnosticCandidate.suggestedOwnerSurface)}; agentVentSuggestionAllowed=${String(diagnosticCandidate.agentVentSuggestionAllowed)}.
Suggested self-evolution candidate (${String(evolutionCandidate.kind)}): friction=${String(evolutionCandidate.friction)}; owner=${String(evolutionCandidate.owner)}; metric=${String(evolutionCandidate.metric)}; nextSafeTest=${String(evolutionCandidate.nextSafeTest)}.
Insight promotion cue (${String((evolutionCandidate.insightPromotionCue as Record<string, unknown> | undefined)?.kind)}): source=${String((evolutionCandidate.insightPromotionCue as Record<string, unknown> | undefined)?.sourceArtifact)}; status=${String((evolutionCandidate.insightPromotionCue as Record<string, unknown> | undefined)?.status)}; target=${String((evolutionCandidate.insightPromotionCue as Record<string, unknown> | undefined)?.target)}; requiredBeforeCompletion=${String((evolutionCandidate.insightPromotionCue as Record<string, unknown> | undefined)?.requiredBeforeCompletion)}.
Reflection guard (${String(reflectionGuard?.kind)}): status=${String(reflectionGuard?.status)}; externalCheckStatus=${String(reflectionGuard?.externalCheckStatus)}; requiresExternalCheck=${String(reflectionGuard?.requiresExternalCheck)}; positiveCheckSignal=${String(externalCheckEvidence?.positiveSignal ?? "none")}; provenanceCount=${String(provenanceCount)}; missingProvenance=${String(externalCheckEvidence?.missingProvenance)}; nextAction=${String(reflectionGuard?.nextAction)}.

No authority changed: no vent record, AK task, evidence, issue, incident, KES note, ontology entry, visible-loop launch, measured campaign, owner-surface promotion, or external telemetry was created.`,
    data: {
      diagnosticCandidate,
      evolutionCandidate,
      allowedNextSurfaces,
      disallowedSelfActions: [
        "self must not write agent_vent records internally",
        "self must not create AK tasks/evidence/incidents for diagnostics",
        "self must not treat diagnostic candidates as canonical recurrence truth",
        "self must not launch visible-loop or measured campaigns from diagnostic review",
        "self must not treat session JSONL or compaction summaries as durable promotion by themselves",
      ],
    },
    suggestions,
  };
}
