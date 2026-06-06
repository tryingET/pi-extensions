/**
 * Candidate-only ontology memory resolver helpers for crystallization.
 *
 * These remain ASC/self local mirrors. They do not mutate ROCS/ontology owner
 * surfaces; promotion must happen through the owning ontology workflow.
 */

import {
  createEdgeMonotonicId,
  normalizeEnum,
  normalizeInput,
  normalizeNumber,
  normalizeString,
  normalizeStringArray,
} from "../edge-contract-kernel.ts";
import type { OntologyCandidateMemory, SelfQuery, SelfResponse, SelfState } from "../types.ts";
import { extractQuotedContent } from "./helpers.ts";

const ONTOLOGY_CANDIDATE_KINDS = ["concept", "relation"] as const;
const ONTOLOGY_SCOPE_HINTS = ["repo", "company", "core", "unknown"] as const;
const ONTOLOGY_CANDIDATE_SOURCES = ["crystallized", "inferred", "session"] as const;
const DUPLICATE_RISKS = ["low", "medium", "high"] as const;

export function handleRememberOntologyCandidate(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const titleHint =
    normalizeString(normalizedContext.titleHint) ||
    extractQuotedContent(query.query) ||
    extractDirectiveTail(query.query, ["ontology candidate:", "ontology gap:", "semantic gap:"]);
  const description = normalizeString(normalizedContext.description) || titleHint;

  if (!description) {
    return {
      understood: true,
      intent: "crystallization",
      answer:
        "What ontology candidate should I remember? Provide description in context.description or a quoted title.",
      suggestions: [
        'remember ontology candidate: "Benchmark harness"',
        "remember ontology candidate with context.description and context.candidateKind",
      ],
    };
  }

  const labelHints =
    normalizeStringArray(normalizedContext.labelHints) ?? (titleHint ? [titleHint] : []);
  const evidence = normalizeEvidence(normalizedContext.evidence, normalizedContext);
  const metadataContext = normalizeInput(normalizedContext.metadata);
  const candidateKind = inferCandidateKind(query.query, normalizedContext);
  const proposedScopeHint = inferScopeHint(query.query, normalizedContext);
  const confidence = normalizeNumber(normalizedContext.confidence, { min: 0, max: 1 }) ?? 0.6;
  const source = normalizeEnum(normalizedContext.source, ONTOLOGY_CANDIDATE_SOURCES) ?? "session";
  const candidateId = createEdgeMonotonicId("ontcand");
  const now = Date.now();

  const candidate: OntologyCandidateMemory = {
    id: candidateId,
    type: "ontology_candidate",
    candidateKind,
    proposedScopeHint,
    titleHint,
    labelHints,
    description,
    evidence,
    confidence,
    createdAt: now,
    lastAccessedAt: now,
    accessCount: 0,
    source,
    metadata: {
      proposedIdHint:
        normalizeString(metadataContext.proposedIdHint) ||
        normalizeString(normalizedContext.proposedIdHint),
      duplicateRisk:
        normalizeEnum(metadataContext.duplicateRisk, DUPLICATE_RISKS) ||
        normalizeEnum(normalizedContext.duplicateRisk, DUPLICATE_RISKS),
      rejectionReason:
        normalizeString(metadataContext.rejectionReason) ||
        normalizeString(normalizedContext.rejectionReason),
      promotedTo:
        normalizeString(metadataContext.promotedTo) ||
        normalizeString(normalizedContext.promotedTo),
    },
  };

  state.learnings.ontologyCandidates.set(candidateId, candidate);

  return {
    understood: true,
    intent: "crystallization",
    answer: `Ontology candidate crystallized: "${(titleHint ?? description).slice(0, 100)}${(titleHint ?? description).length > 100 ? "..." : ""}" (${candidateKind}, scope hint: ${proposedScopeHint})`,
    data: {
      candidateId,
      candidateKind,
      proposedScopeHint,
      confidence,
    },
  };
}

export function handleRecallOntologyCandidates(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const candidateKind = normalizeEnum(normalizedContext.candidateKind, ONTOLOGY_CANDIDATE_KINDS);
  const proposedScopeHint = normalizeEnum(
    normalizedContext.proposedScopeHint,
    ONTOLOGY_SCOPE_HINTS,
  );
  const includeRejected = normalizedContext.includeRejected !== false;

  let candidates = Array.from(state.learnings.ontologyCandidates.values());
  if (candidateKind) {
    candidates = candidates.filter((candidate) => candidate.candidateKind === candidateKind);
  }
  if (proposedScopeHint) {
    candidates = candidates.filter(
      (candidate) => candidate.proposedScopeHint === proposedScopeHint,
    );
  }
  if (!includeRejected) {
    candidates = candidates.filter((candidate) => !candidate.metadata.rejectionReason);
  }

  candidates.sort((a, b) => {
    const aRejected = Boolean(a.metadata.rejectionReason);
    const bRejected = Boolean(b.metadata.rejectionReason);
    if (aRejected !== bRejected) {
      return aRejected ? 1 : -1;
    }
    if (b.lastAccessedAt !== a.lastAccessedAt) {
      return b.lastAccessedAt - a.lastAccessedAt;
    }
    return b.confidence - a.confidence;
  });

  for (const candidate of candidates.slice(0, 5)) {
    candidate.lastAccessedAt = Date.now();
    candidate.accessCount++;
  }

  return {
    understood: true,
    intent: "crystallization",
    answer:
      candidates.length > 0
        ? `${candidates.length} ontology candidate(s) crystallized: ${candidates
            .slice(0, 5)
            .map((candidate) => formatOntologyCandidateSummary(candidate))
            .join("; ")}`
        : "No ontology candidates crystallized yet.",
    data: { candidates: candidates.slice(0, 10), count: candidates.length },
  };
}

export function handleForgetOntologyCandidate(query: SelfQuery, state: SelfState): SelfResponse {
  const candidate = resolveOntologyCandidateReference(query, state);

  if (!candidate) {
    return {
      understood: true,
      intent: "crystallization",
      answer:
        "Which ontology candidate would you like to forget? Provide context.candidateId or context.titleHint.",
    };
  }

  state.learnings.ontologyCandidates.delete(candidate.id);

  return {
    understood: true,
    intent: "crystallization",
    answer: `Ontology candidate forgotten: ${formatOntologyCandidateSummary(candidate)}.`,
    data: { candidateId: candidate.id },
  };
}

export function handleRejectOntologyCandidate(query: SelfQuery, state: SelfState): SelfResponse {
  const normalizedContext = normalizeInput(query.context);
  const candidate = resolveOntologyCandidateReference(query, state);

  if (!candidate) {
    return {
      understood: true,
      intent: "crystallization",
      answer:
        "Which ontology candidate should I mark as rejected? Provide context.candidateId or context.titleHint.",
    };
  }

  const rejectionReason =
    normalizeString(normalizedContext.rejectionReason) ||
    normalizeString(normalizeInput(normalizedContext.metadata).rejectionReason) ||
    extractDirectiveTail(query.query, ["rejected:", "reject because", "because"]);

  if (!rejectionReason) {
    return {
      understood: true,
      intent: "crystallization",
      answer:
        "Why is this ontology candidate rejected? Provide context.rejectionReason or explain it after 'because'.",
    };
  }

  candidate.metadata.rejectionReason = rejectionReason;
  candidate.lastAccessedAt = Date.now();
  candidate.accessCount++;

  return {
    understood: true,
    intent: "crystallization",
    answer: `Ontology candidate rejected: ${formatOntologyCandidateSummary(candidate)}. Reason: ${rejectionReason}`,
    data: { candidateId: candidate.id, rejectionReason },
  };
}

export function isOntologyCandidateQuery(lower: string): boolean {
  return (
    lower.includes("ontology candidate") ||
    lower.includes("ontology candidates") ||
    lower.includes("ontology gap") ||
    lower.includes("semantic gap") ||
    (lower.includes("candidate") && (lower.includes("reject") || lower.includes("rejected")))
  );
}

function inferCandidateKind(
  queryText: string,
  normalizedContext: Record<string, unknown>,
): OntologyCandidateMemory["candidateKind"] {
  const explicit = normalizeEnum(normalizedContext.candidateKind, ONTOLOGY_CANDIDATE_KINDS);
  if (explicit) return explicit;
  return queryText.toLowerCase().includes("relation") ? "relation" : "concept";
}

function inferScopeHint(
  queryText: string,
  normalizedContext: Record<string, unknown>,
): OntologyCandidateMemory["proposedScopeHint"] {
  const explicit = normalizeEnum(normalizedContext.proposedScopeHint, ONTOLOGY_SCOPE_HINTS);
  if (explicit) return explicit;

  const lower = queryText.toLowerCase();
  if (lower.includes("company")) return "company";
  if (lower.includes("core")) return "core";
  if (lower.includes("repo")) return "repo";
  return "unknown";
}

function normalizeEvidence(
  rawEvidence: unknown,
  fallbackContext: Record<string, unknown>,
): OntologyCandidateMemory["evidence"] {
  const evidence = normalizeInput(rawEvidence);

  return {
    files: normalizeStringArray(evidence.files) ?? normalizeStringArray(fallbackContext.files),
    commands:
      normalizeStringArray(evidence.commands) ?? normalizeStringArray(fallbackContext.commands),
    diaryRefs:
      normalizeStringArray(evidence.diaryRefs) ?? normalizeStringArray(fallbackContext.diaryRefs),
    sessionIds:
      normalizeStringArray(evidence.sessionIds) ?? normalizeStringArray(fallbackContext.sessionIds),
    repeatedPhrases:
      normalizeStringArray(evidence.repeatedPhrases) ??
      normalizeStringArray(fallbackContext.repeatedPhrases),
  };
}

function resolveOntologyCandidateReference(
  query: SelfQuery,
  state: SelfState,
): OntologyCandidateMemory | undefined {
  const normalizedContext = normalizeInput(query.context);
  const candidateId = normalizeString(normalizedContext.candidateId);
  if (candidateId) {
    return state.learnings.ontologyCandidates.get(candidateId);
  }

  const titleHint =
    normalizeString(normalizedContext.titleHint) || extractQuotedContent(query.query);
  if (titleHint) {
    const normalizedTitle = titleHint.toLowerCase();
    return Array.from(state.learnings.ontologyCandidates.values()).find((candidate) => {
      if (candidate.titleHint?.toLowerCase() === normalizedTitle) {
        return true;
      }
      return candidate.labelHints.some((label) => label.toLowerCase() === normalizedTitle);
    });
  }

  if (state.learnings.ontologyCandidates.size === 1) {
    return Array.from(state.learnings.ontologyCandidates.values())[0];
  }

  return undefined;
}

function formatOntologyCandidateSummary(candidate: OntologyCandidateMemory): string {
  const title = candidate.titleHint ?? candidate.labelHints[0] ?? candidate.description;
  const state = candidate.metadata.rejectionReason ? "rejected" : "candidate";
  return `"${title.slice(0, 50)}${title.length > 50 ? "..." : ""}" (${candidate.candidateKind}, ${candidate.proposedScopeHint}, ${state})`;
}

function extractDirectiveTail(query: string, markers: string[]): string | undefined {
  const lower = query.toLowerCase();
  for (const marker of markers) {
    const index = lower.indexOf(marker.toLowerCase());
    if (index < 0) continue;
    const remainder = query
      .slice(index + marker.length)
      .replace(/^[:\-\s]+/, "")
      .trim();
    if (remainder.length > 0) {
      return remainder;
    }
  }
  return undefined;
}
