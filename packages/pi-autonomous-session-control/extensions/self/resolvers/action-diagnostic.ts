/**
 * Explicit diagnostic action helpers.
 *
 * These actions reuse the canonical diagnostic candidate builder and never send
 * an imperative recursive-continuation message. Durable capture stays preview-only
 * and owner-reviewed through agent_vent.
 */

import type { SelfQuery, SelfResponse, SelfState } from "../types.ts";
import { buildDiagnosticCandidate, resolveDiagnosticReviewQuery } from "./diagnostic-review.ts";

export function handleContinueDiagnosticReview(query: SelfQuery, state: SelfState): SelfResponse {
  const review = resolveDiagnosticReviewQuery(query, state);
  const data = review.data as
    | {
        diagnosticCandidate?: Record<string, unknown>;
        evolutionCandidate?: Record<string, unknown>;
      }
    | undefined;
  const candidate = data?.evolutionCandidate;
  const reflectionGuard = candidate?.reflectionGuard as Record<string, unknown> | undefined;
  const requiresExternalCheck = reflectionGuard?.requiresExternalCheck === true;

  return {
    understood: true,
    intent: "action",
    answer: requiresExternalCheck
      ? `Diagnostic continuation blocked by self.reflection_guard.v1 for candidate ${String(candidate?.candidateId ?? "unknown")}. ${String(reflectionGuard?.nextAction ?? "Run a concrete external check before continuing.")}`
      : `Diagnostic review produced candidate ${String(candidate?.candidateId ?? "unknown")} without sending a hidden continuation. Review its evidence and use an explicit candidate-bound visible-loop or autoresearch route only if executionReady=true.`,
    data: {
      diagnosticCandidate: data?.diagnosticCandidate,
      evolutionCandidate: candidate,
      sendUserMessage: false,
      prefill: false,
      dispatchMode: requiresExternalCheck
        ? "external_check_required"
        : "diagnostic_candidate_review_required",
      boundary:
        "mirror-only explicit diagnostic action; no recursive follow-up, agent_vent write, loop launch, campaign launch, or durable authority mutation occurred",
    },
  };
}

export function handlePrefillDiagnosticRecord(query: SelfQuery, state: SelfState): SelfResponse {
  const candidate = buildDiagnosticCandidate(query, state);
  const text = buildAgentVentPreviewCommand(candidate);

  return buildPrefillResponse(text, {
    diagnosticCandidate: candidate,
    sendUserMessage: false,
    dispatchMode: "operator_review_required",
    reason:
      "Durable local diagnostic recording writes agent_vent state, so self prefills an agent_vent preview first for operator review and anti-junk checking.",
  });
}

function buildAgentVentPreviewCommand(candidate: Record<string, unknown>): string {
  return `agent_vent({ action: "preview", category: ${JSON.stringify(candidate.category)}, tool: ${JSON.stringify(candidate.tool)}, packageName: ${JSON.stringify(candidate.package)}, summary: ${JSON.stringify(candidate.summary)} })`;
}

function buildPrefillResponse(text: string, extraData: Record<string, unknown> = {}): SelfResponse {
  return {
    understood: true,
    intent: "action",
    answer: `Editor prefill suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: { text, prefill: true, ...extraData },
  };
}
