/**
 * Diagnostic-review resolver for self/meta queries.
 *
 * This surface is mirror-only: it can describe diagnostic and self-evolution
 * candidates, but it must not write agent_vent, AK/evidence, KES, ontology,
 * visible-loop, measured-campaign, issue, incident, or telemetry state.
 */

import { normalizeInput, normalizeString, normalizeStringArray } from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";

function buildDiagnosticCandidate(
  query: SelfQuery | undefined,
  state: SelfState,
): Record<string, unknown> {
  const context = normalizeInput(query?.context);
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
    suggestedOwnerSurface: "agent_vent",
    boundary:
      "candidate-only local diagnostic suggestion; self does not record agent_vent entries or create AK/evidence/incident state",
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
    copyableCommands: [
      'toolbox({ action: "activate", bundle: "agent_vent" })',
      agentVentPreviewCommand,
      agentVentRecordCommand,
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
  const sourceArtifact = normalizeString(context.sourceArtifact) || normalizeString(context.source);
  const promotionStatus = normalizeString(context.promotionStatus) || "candidate_only_not_promoted";

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
    nonAuthorizations: normalizeStringArray(context.nonAuthorizations) ?? [
      "no AK task/evidence/decision writes from self",
      "no agent_vent record without explicit operator/tool action",
      "no ontology/KES/Prompt Vault mutation from self",
      "no visible-loop launch or measured campaign execution from self",
      "no action-state mutation from diagnostic/self-evolution queries",
    ],
    sourceArtifact,
    promotionStatus,
    trace: {
      observe: friction,
      orient: `owner=${owner}; autonomyLevel=${autonomyLevel}; metric=${metric}`,
      decide: "surface a typed candidate and route implementation/evidence to the owning surface",
      act: "mirror-only suggestion unless an explicit action directive is provided",
      check: nextSafeTest,
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

  return {
    understood: true,
    intent: "meta",
    answer: `Diagnostic review: self can notice local operator/tooling friction and propose candidate payloads, but it remains mirror-only.

Boundary:
- self owns moment-level reflection: what just happened and what affordance was missing.
- toolbox owns capability activation when a separate tool is needed.
- agent_vent owns durable local recurrence memory if the operator explicitly records the diagnostic.
- owner docs, visible-loop, autoresearch, AK/evidence, KES, Prompt Vault, and ontology remain separate owner surfaces.

Suggested diagnostic candidate (${String(diagnosticCandidate.kind)}): ${String(diagnosticCandidate.summary)}.
Suggested self-evolution candidate (${String(evolutionCandidate.kind)}): friction=${String(evolutionCandidate.friction)}; owner=${String(evolutionCandidate.owner)}; metric=${String(evolutionCandidate.metric)}; nextSafeTest=${String(evolutionCandidate.nextSafeTest)}.

No authority changed: no vent record, AK task, evidence, issue, incident, KES note, ontology entry, visible-loop launch, measured campaign, or external telemetry was created.`,
    data: {
      diagnosticCandidate,
      evolutionCandidate,
      allowedNextSurfaces: [
        "toolbox activation",
        "agent_vent preview by explicit operator/tool call",
        "agent_vent record by explicit operator/tool call after preview/review",
        "visible-loop only after owner/metric/falsifier/non-authorizations are explicit",
        "owner docs/task/evidence/learning surfaces only through their owners",
      ],
      disallowedSelfActions: [
        "self must not write agent_vent records internally",
        "self must not create AK tasks/evidence/incidents for diagnostics",
        "self must not treat diagnostic candidates as canonical recurrence truth",
        "self must not launch visible-loop or measured campaigns from diagnostic review",
        "self must not treat session JSONL or compaction summaries as durable promotion by themselves",
      ],
    },
    suggestions: [
      'toolbox({ action: "activate", bundle: "agent_vent" })',
      "agent_vent preview before record for the suggested payload",
      "capability discovery",
    ],
  };
}
