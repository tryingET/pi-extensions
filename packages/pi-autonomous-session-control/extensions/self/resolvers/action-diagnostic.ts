/**
 * Diagnostic action helpers for ASC/self.
 *
 * These actions only prepare mirror-only continuation messages or editor
 * prefills. Durable diagnostic capture remains owned by agent_vent.
 */

import { normalizeInput, normalizeString } from "../edge-contract-kernel.ts";
import type { SelfQuery, SelfResponse } from "../types.ts";
import { extractQuotedContent } from "./helpers.ts";

export function handleContinueDiagnosticReview(query: SelfQuery): SelfResponse {
  const candidate = buildDiagnosticCandidate(query);
  const text = buildDiagnosticContinuationMessage(candidate);

  return {
    understood: true,
    intent: "action",
    answer: `Diagnostic-review continuation suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: {
      text,
      diagnosticCandidate: candidate,
      sendUserMessage: true,
      prefill: false,
      dispatchMode: "agent_diagnostic_continuation",
      boundary:
        "Low-risk mirror-only continuation; durable agent_vent recording remains operator-reviewed.",
    },
  };
}

export function handlePrefillDiagnosticRecord(query: SelfQuery): SelfResponse {
  const candidate = buildDiagnosticCandidate(query);
  const text = buildAgentVentPreviewCommand(candidate);

  return buildPrefillResponse(text, {
    diagnosticCandidate: candidate,
    sendUserMessage: false,
    dispatchMode: "operator_review_required",
    reason:
      "Durable local diagnostic recording writes agent_vent state, so self prefills an agent_vent preview first for operator review and anti-junk checking.",
  });
}

function buildDiagnosticCandidate(query: SelfQuery): Record<string, string> {
  const context = normalizeInput(query.context);
  const summary =
    normalizeString(context.summary) ||
    normalizeString(context.diagnosticSummary) ||
    extractQuotedContent(query.query) ||
    "self/operator diagnostic affordance needs review";
  const category = normalizeString(context.category) || "missing_affordance";
  const tool = normalizeString(context.tool) || "self";
  const packageName = normalizeString(context.package) || "pi-autonomous-session-control";

  return {
    kind: "self.diagnostic_candidate.v1",
    summary,
    category,
    tool,
    package: packageName,
    sourceQuery: query.query,
    suggestedOwnerSurface: "agent_vent",
    boundary:
      "candidate-only local diagnostic suggestion; self does not record agent_vent entries or create AK/evidence/incident state",
  };
}

function buildDiagnosticContinuationMessage(candidate: Record<string, string>): string {
  return [
    "Continue the self diagnostic review as a mirror-only local improvement step.",
    `Candidate: ${candidate.summary}`,
    `Facet: category=${candidate.category}, tool=${candidate.tool}, package=${candidate.package}`,
    "Allowed: inspect the candidate, improve self/tooling behavior, or ask the operator before durable capture.",
    "Not allowed: do not write agent_vent records, AK tasks/evidence, issues, incidents, or telemetry unless explicitly requested through the owning surface.",
  ].join("\n");
}

function buildAgentVentPreviewCommand(candidate: Record<string, string>): string {
  return `agent_vent({ action: "preview", category: ${JSON.stringify(candidate.category)}, tool: ${JSON.stringify(candidate.tool)}, package: ${JSON.stringify(candidate.package)}, summary: ${JSON.stringify(candidate.summary)} })`;
}

function buildPrefillResponse(text: string, extraData: Record<string, unknown> = {}): SelfResponse {
  return {
    understood: true,
    intent: "action",
    answer: `Editor prefill suggested: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`,
    data: { text, prefill: true, ...extraData },
  };
}
