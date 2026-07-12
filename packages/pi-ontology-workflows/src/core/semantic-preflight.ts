import type {
  DiscoveryCandidate,
  DiscoveryInvocation,
  DiscoveryResult,
} from "../semantic/protocol.ts";

export type SemanticApplicability = "applicable" | "not_applicable" | "unknown";
export type SemanticRetrieval =
  | "no_candidates"
  | "unique_candidate"
  | "multiple_candidates"
  | "ambiguous_equivalence"
  | "low_confidence"
  | "absent";
export type SemanticOutcome =
  | "matched"
  | "ambiguous"
  | "no_match"
  | "not_applicable"
  | "unavailable";

export interface StructuralCandidate {
  ont_id: string;
  kind: "concept" | "relation";
  layer: string;
  score: number;
  evidence: string[];
}

export interface SemanticPreflightEnvelope {
  semantic_coordinate_kind: "development_snapshot";
  corpus_snapshot_digest: string | null;
  tool_identity_digest: string | null;
  effective_execution_digest: string | null;
  result_digest: string | null;
  outcome: SemanticOutcome;
  invocation: DiscoveryInvocation;
  applicability: SemanticApplicability;
  retrieval: SemanticRetrieval;
  candidates: StructuralCandidate[];
}

export function applicabilityForPrompt(prompt: string): SemanticApplicability {
  return Buffer.byteLength(prompt, "utf8") === 0 ? "not_applicable" : "unknown";
}

export function projectDiscovery(
  invocation: DiscoveryInvocation,
  applicability: SemanticApplicability,
  result?: DiscoveryResult,
): SemanticPreflightEnvelope {
  const retrieval = result?.retrieval as SemanticRetrieval | undefined;
  const dimensions = validateDimensions(invocation, applicability, retrieval ?? "absent", result);
  const outcome = projectOutcome(
    dimensions.invocation,
    dimensions.applicability,
    dimensions.retrieval,
  );
  return {
    semantic_coordinate_kind: "development_snapshot",
    corpus_snapshot_digest: result?.corpus_snapshot_digest ?? null,
    tool_identity_digest: toolDigest(result),
    effective_execution_digest: result?.effective_execution_digest ?? null,
    result_digest: result?.result_digest ?? null,
    outcome,
    invocation: dimensions.invocation,
    applicability: dimensions.applicability,
    retrieval: dimensions.retrieval,
    candidates: outcome === "unavailable" ? [] : (result?.candidates ?? []).map(projectCandidate),
  };
}

export function unavailableEnvelope(): SemanticPreflightEnvelope {
  return projectDiscovery("unavailable", "unknown");
}

function validateDimensions(
  invocation: DiscoveryInvocation,
  applicability: SemanticApplicability,
  retrieval: SemanticRetrieval,
  result: DiscoveryResult | undefined,
): Pick<SemanticPreflightEnvelope, "invocation" | "applicability" | "retrieval"> {
  const bypass = applicability === "not_applicable";
  const valid = bypass
    ? invocation === "ok" && retrieval === "absent" && result === undefined
    : invocation === "ok"
      ? retrieval !== "absent" && result !== undefined
      : retrieval === "absent" && result === undefined;
  if (!valid) return { invocation: "incompatible", applicability: "unknown", retrieval: "absent" };
  return { invocation, applicability, retrieval };
}

function projectOutcome(
  invocation: DiscoveryInvocation,
  applicability: SemanticApplicability,
  retrieval: SemanticRetrieval,
): SemanticOutcome {
  if (applicability === "not_applicable") return "not_applicable";
  if (invocation !== "ok") return "unavailable";
  if (retrieval === "no_candidates") return "no_match";
  if (retrieval === "ambiguous_equivalence" || retrieval === "low_confidence") return "ambiguous";
  if (retrieval === "unique_candidate" || retrieval === "multiple_candidates") return "matched";
  return "unavailable";
}

function projectCandidate(candidate: DiscoveryCandidate): StructuralCandidate {
  return {
    ont_id: candidate.ont_id,
    kind: candidate.kind,
    layer: candidate.layer,
    score: candidate.score,
    evidence: candidate.evidence.map((item) => `${item.field}.${item.rule}`),
  };
}

function toolDigest(result: DiscoveryResult | undefined): string | null {
  const value = result?.tool_identity.digest;
  return typeof value === "string" ? value : null;
}
