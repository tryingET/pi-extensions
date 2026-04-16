import path from "node:path";
import type { FilesPort } from "../ports/files-port.ts";
import type { RocsPort } from "../ports/rocs-port.ts";
import type { WorkspacePort } from "../ports/workspace-port.ts";
import type { OntologyScope, OntologySearchHit, WorkspaceContext } from "./contracts.ts";
import { inspectOntology } from "./inspect.ts";

export const ONTOLOGY_PROPOSAL_CANDIDATE_KINDS = ["concept", "relation"] as const;
export type OntologyProposalCandidateKind = (typeof ONTOLOGY_PROPOSAL_CANDIDATE_KINDS)[number];

export const ONTOLOGY_PROPOSAL_SCOPE_HINTS = ["repo", "company", "core"] as const;
export type OntologyProposalScopeHint = (typeof ONTOLOGY_PROPOSAL_SCOPE_HINTS)[number];

export const ONTOLOGY_PROPOSAL_DUPLICATE_RISKS = ["low", "medium", "high"] as const;
export type OntologyProposalDuplicateRisk = (typeof ONTOLOGY_PROPOSAL_DUPLICATE_RISKS)[number];

export const ONTOLOGY_PROPOSAL_VERDICTS = [
  "new_concept_candidate",
  "new_relation_candidate",
  "likely_duplicate",
  "better_as_description",
  "better_as_system4d",
  "insufficient_evidence",
] as const;
export type OntologyProposalVerdict = (typeof ONTOLOGY_PROPOSAL_VERDICTS)[number];

export interface OntologyProposalCandidate {
  candidateKind: OntologyProposalCandidateKind;
  scopeHint?: OntologyProposalScopeHint;
  title?: string;
  labels?: string[];
  synonyms?: string[];
  description: string;
  domain?: string;
  range?: string;
  rationale?: string;
  evidenceRefs?: string[];
}

export interface OntologyProposalAssessment {
  ok: boolean;
  recommendedScope: OntologyProposalScopeHint;
  recommendedTargetId?: string;
  nearestExisting: Array<{
    ontId: string;
    score: number;
    reason: string;
  }>;
  duplicateRisk: OntologyProposalDuplicateRisk;
  verdict: OntologyProposalVerdict;
  reasoning: string;
  ontologyChangePlan?: {
    mode: "plan";
    artifactKind: OntologyProposalCandidateKind;
    operation: "create" | "upsert";
    scope: OntologyProposalScopeHint;
    targetId: string;
    payload: Record<string, unknown>;
  };
}

export interface OntologyProposalRuntime {
  assess(
    candidate: OntologyProposalCandidate,
    runtime: { cwd: string },
  ): Promise<OntologyProposalAssessment>;
}

interface ProposalDeps {
  files: FilesPort;
  rocs: RocsPort;
  workspace: WorkspacePort;
}

interface NormalizedCandidate {
  candidateKind: OntologyProposalCandidateKind;
  scopeHint?: OntologyProposalScopeHint;
  title?: string;
  labels: string[];
  synonyms: string[];
  description: string;
  domain?: string;
  range?: string;
  rationale?: string;
  evidenceRefs: string[];
  primaryQuery: string;
}

interface InternalMatch {
  ontId: string;
  score: number;
  reason: string;
  hit: OntologySearchHit;
}

interface SearchCollectionResult {
  matches: InternalMatch[];
  searchedScopes: OntologyProposalScopeHint[];
  failedScopes: Array<{ scope: OntologyProposalScopeHint; message: string }>;
}

export function createOntologyProposalRuntime(deps: ProposalDeps): OntologyProposalRuntime {
  return {
    async assess(candidate, runtime) {
      return assessOntologyProposal(candidate, runtime, deps);
    },
  };
}

export async function assessOntologyProposal(
  candidate: OntologyProposalCandidate,
  runtime: { cwd: string },
  deps: ProposalDeps,
): Promise<OntologyProposalAssessment> {
  const normalized = normalizeCandidate(candidate);
  const detected = await deps.workspace.detect(runtime.cwd);
  const recommendedScope = recommendScope(normalized, detected);
  const search = await collectNearestExisting(normalized, runtime, deps, recommendedScope);
  const duplicateRisk = inferDuplicateRisk(normalized, search.matches);
  const verdict = classifyVerdict(normalized, duplicateRisk, search.matches);
  const recommendedTargetId =
    verdict === "new_concept_candidate" || verdict === "new_relation_candidate"
      ? buildRecommendedTargetId(normalized, recommendedScope, detected)
      : undefined;
  const ontologyChangePlan = recommendedTargetId
    ? buildOntologyChangePlan(normalized, recommendedScope, recommendedTargetId, duplicateRisk)
    : undefined;

  return {
    ok: verdict === "new_concept_candidate" || verdict === "new_relation_candidate",
    recommendedScope,
    recommendedTargetId,
    nearestExisting: search.matches.map((match) => ({
      ontId: match.ontId,
      score: match.score,
      reason: match.reason,
    })),
    duplicateRisk,
    verdict,
    reasoning: buildReasoning(normalized, recommendedScope, duplicateRisk, verdict, search),
    ontologyChangePlan,
  };
}

function normalizeCandidate(input: OntologyProposalCandidate): NormalizedCandidate {
  const title = trimOptional(input.title);
  const labels = uniqueStrings(input.labels ?? []);
  const synonyms = uniqueStrings(input.synonyms ?? []);
  const description = requireNonEmpty(input.description, "ontology proposal requires description");
  const domain = trimOptional(input.domain);
  const range = trimOptional(input.range);
  const rationale = trimOptional(input.rationale);
  const evidenceRefs = uniqueStrings(input.evidenceRefs ?? []);
  const primaryQuery =
    title ?? labels[0] ?? synonyms[0] ?? description.split(/[.!?]/, 1)[0]?.trim() ?? description;

  return {
    candidateKind: input.candidateKind,
    scopeHint: input.scopeHint,
    title,
    labels,
    synonyms,
    description,
    domain,
    range,
    rationale,
    evidenceRefs,
    primaryQuery,
  };
}

function recommendScope(
  candidate: NormalizedCandidate,
  detected: WorkspaceContext,
): OntologyProposalScopeHint {
  if (candidate.scopeHint) return candidate.scopeHint;

  const relationScope = inferScopeFromRelationEndpoints(candidate);
  if (relationScope) return relationScope;

  if (detected.currentRepoKind === "company") return "company";
  if (detected.currentRepoKind === "core") return "core";
  return "repo";
}

function inferScopeFromRelationEndpoints(
  candidate: NormalizedCandidate,
): OntologyProposalScopeHint | undefined {
  if (candidate.candidateKind !== "relation") return undefined;
  if (!candidate.domain || !candidate.range) return undefined;

  const domainScope = inferScopeFromOntologyId(candidate.domain);
  const rangeScope = inferScopeFromOntologyId(candidate.range);
  if (domainScope && rangeScope && domainScope === rangeScope) return domainScope;
  return undefined;
}

function inferScopeFromOntologyId(value: string): OntologyProposalScopeHint | undefined {
  const trimmed = value.trim();
  if (trimmed.startsWith("core.")) return "core";
  if (trimmed.startsWith("co.")) return "company";
  return undefined;
}

async function collectNearestExisting(
  candidate: NormalizedCandidate,
  runtime: { cwd: string },
  deps: ProposalDeps,
  recommendedScope: OntologyProposalScopeHint,
): Promise<SearchCollectionResult> {
  const matches = new Map<string, InternalMatch>();
  const searchedScopes: OntologyProposalScopeHint[] = [];
  const failedScopes: Array<{ scope: OntologyProposalScopeHint; message: string }> = [];

  for (const scope of buildSearchScopes(recommendedScope)) {
    try {
      const result = await inspectOntology(
        {
          kind: "search",
          scope: scope as OntologyScope,
          query: candidate.primaryQuery,
        },
        runtime,
        deps,
      );
      searchedScopes.push(scope);
      for (const hit of result.search?.hits ?? []) {
        const current = matches.get(hit.ontId);
        const next: InternalMatch = {
          ontId: hit.ontId,
          score: hit.score,
          reason: describeMatchReason(candidate, hit, scope),
          hit,
        };
        if (!current || next.score > current.score) {
          matches.set(hit.ontId, next);
        }
      }
    } catch (error) {
      failedScopes.push({
        scope,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    matches: [...matches.values()]
      .sort((a, b) => b.score - a.score || a.ontId.localeCompare(b.ontId))
      .slice(0, 5),
    searchedScopes,
    failedScopes,
  };
}

function buildSearchScopes(
  recommendedScope: OntologyProposalScopeHint,
): OntologyProposalScopeHint[] {
  if (recommendedScope === "core") return ["core"];
  if (recommendedScope === "company") return ["company", "core"];
  return ["repo", "company", "core"];
}

function describeMatchReason(
  candidate: NormalizedCandidate,
  hit: OntologySearchHit,
  scope: OntologyProposalScopeHint,
): string {
  const names = new Set(
    [candidate.title, ...candidate.labels, ...candidate.synonyms]
      .filter((value): value is string => Boolean(value))
      .map(normalizeForComparison),
  );
  const hitLeaf = normalizeForComparison(hit.ontId.split(".").at(-1) ?? hit.ontId);
  const hitTitle = normalizeForComparison(hit.title);
  const exactLabel = hit.labels.some((label) => names.has(normalizeForComparison(label)));
  if (names.has(hitTitle) || names.has(hitLeaf) || exactLabel) {
    return `exact name overlap in ${scope} search (layer=${hit.layer})`;
  }
  if (hit.score >= 80) {
    return `strong lexical overlap in ${scope} search (layer=${hit.layer})`;
  }
  return `nearby ${hit.kind} in ${scope} search (layer=${hit.layer})`;
}

function inferDuplicateRisk(
  candidate: NormalizedCandidate,
  matches: InternalMatch[],
): OntologyProposalDuplicateRisk {
  const top = matches[0];
  if (!top) return "low";
  if (isExactCandidateMatch(candidate, top.hit) || top.score >= 95) return "high";
  if (top.score >= 70) return "medium";
  return "low";
}

function isExactCandidateMatch(candidate: NormalizedCandidate, hit: OntologySearchHit): boolean {
  const names = [candidate.title, ...candidate.labels, ...candidate.synonyms]
    .filter((value): value is string => Boolean(value))
    .map(normalizeForComparison);
  if (names.length === 0) return false;

  const candidates = new Set(names);
  if (candidates.has(normalizeForComparison(hit.title))) return true;
  if (candidates.has(normalizeForComparison(hit.ontId.split(".").at(-1) ?? hit.ontId))) return true;
  return hit.labels.some((label) => candidates.has(normalizeForComparison(label)));
}

function classifyVerdict(
  candidate: NormalizedCandidate,
  duplicateRisk: OntologyProposalDuplicateRisk,
  matches: InternalMatch[],
): OntologyProposalVerdict {
  if (duplicateRisk === "high" && matches.length > 0) return "likely_duplicate";
  if (!hasEnoughEvidence(candidate)) return "insufficient_evidence";
  if (looksLikeSystem4d(candidate)) return "better_as_system4d";
  if (looksLikeDescription(candidate)) return "better_as_description";
  return candidate.candidateKind === "relation"
    ? "new_relation_candidate"
    : "new_concept_candidate";
}

function hasEnoughEvidence(candidate: NormalizedCandidate): boolean {
  const hasName = Boolean(candidate.title || candidate.labels[0] || candidate.synonyms[0]);
  if (!hasName) return false;
  if (countWords(candidate.description) < 4) return false;
  if (candidate.candidateKind === "relation") {
    return Boolean(candidate.domain && candidate.range);
  }
  return true;
}

function looksLikeSystem4d(candidate: NormalizedCandidate): boolean {
  const text = `${candidate.title ?? ""} ${candidate.description} ${candidate.rationale ?? ""}`
    .toLowerCase()
    .trim();
  const cues = [
    "out of scope",
    "in scope",
    "tradeoff",
    "trade-off",
    "driver",
    "drivers",
    "outcome",
    "outcomes",
    "anti goal",
    "anti-goal",
    "assumption",
    "assumptions",
    "lifecycle",
  ];
  const matches = cues.filter((cue) => text.includes(cue)).length;
  return matches >= 2;
}

function looksLikeDescription(candidate: NormalizedCandidate): boolean {
  const name = candidate.title ?? candidate.labels[0] ?? candidate.synonyms[0] ?? "";
  const generic = new Set([
    "note",
    "notes",
    "detail",
    "details",
    "overview",
    "documentation",
    "doc",
    "guide",
    "status",
    "plan",
  ]);
  return generic.has(toSnakeCase(name));
}

function buildRecommendedTargetId(
  candidate: NormalizedCandidate,
  scope: OntologyProposalScopeHint,
  detected: WorkspaceContext,
): string {
  const stemSource =
    candidate.title ?? candidate.labels[0] ?? candidate.synonyms[0] ?? candidate.primaryQuery;

  if (candidate.candidateKind === "relation") {
    return toSnakeCase(stemSource);
  }

  const namespace = buildNamespace(scope, detected);
  const leaf = toPascalCase(stemSource);
  return namespace ? `${namespace}.${leaf}` : leaf;
}

function buildNamespace(scope: OntologyProposalScopeHint, detected: WorkspaceContext): string {
  if (scope === "core") return "core";
  if (scope === "company") {
    const company = sanitizeNamespaceSegment(detected.currentCompany);
    if (!company) return "co.company";
    return company.endsWith("co") && company.length > 2
      ? `co.${company.slice(0, -2)}`
      : `co.${company}`;
  }

  const repoBase = path.basename(detected.currentRepoPath);
  return repoBase
    .split(/[^a-zA-Z0-9]+/)
    .map((part) => sanitizeNamespaceSegment(part))
    .filter(Boolean)
    .join(".");
}

function buildOntologyChangePlan(
  candidate: NormalizedCandidate,
  scope: OntologyProposalScopeHint,
  targetId: string,
  duplicateRisk: OntologyProposalDuplicateRisk,
): OntologyProposalAssessment["ontologyChangePlan"] {
  return {
    mode: "plan",
    artifactKind: candidate.candidateKind,
    operation: duplicateRisk === "medium" ? "upsert" : "create",
    scope,
    targetId,
    payload: omitUndefined({
      title: candidate.title,
      labels: candidate.labels.length > 0 ? candidate.labels : undefined,
      synonyms: candidate.synonyms.length > 0 ? candidate.synonyms : undefined,
      description: candidate.description,
      domain: candidate.domain,
      range: candidate.range,
      rationale: candidate.rationale,
      notes: candidate.evidenceRefs.length > 0 ? candidate.evidenceRefs : undefined,
    }),
  };
}

function buildReasoning(
  candidate: NormalizedCandidate,
  recommendedScope: OntologyProposalScopeHint,
  duplicateRisk: OntologyProposalDuplicateRisk,
  verdict: OntologyProposalVerdict,
  search: SearchCollectionResult,
): string {
  const parts: string[] = [];
  parts.push(
    candidate.scopeHint
      ? `Used provided scopeHint=${recommendedScope}.`
      : `Recommended ${recommendedScope} scope by conservative default.`,
  );

  if (candidate.candidateKind === "relation" && (!candidate.domain || !candidate.range)) {
    parts.push("Relation candidates need both domain and range before they are actionable.");
  }

  if (search.searchedScopes.length > 0) {
    parts.push(`Searched ${search.searchedScopes.join(", ")} for "${candidate.primaryQuery}".`);
  }
  if (search.matches[0]) {
    parts.push(
      `Nearest existing is ${search.matches[0].ontId} (score=${search.matches[0].score}, ${search.matches[0].reason}). Duplicate risk is ${duplicateRisk}.`,
    );
  } else {
    parts.push(`No close existing ontology entry was found for "${candidate.primaryQuery}".`);
  }
  if (search.failedScopes.length > 0) {
    parts.push(
      `Skipped ${search.failedScopes
        .map((entry) => `${entry.scope} (${entry.message})`)
        .join(", ")}.`,
    );
  }

  switch (verdict) {
    case "likely_duplicate":
      parts.push(
        "This looks close enough to existing ontology that review should start from merge/rename, not new ontology creation.",
      );
      break;
    case "better_as_description":
      parts.push("This reads more like descriptive/project prose than a stable ontology term.");
      break;
    case "better_as_system4d":
      parts.push(
        "The wording is dominated by System4D-style posture/lifecycle language rather than a reusable ontology noun or relation.",
      );
      break;
    case "insufficient_evidence":
      parts.push(
        "The proposal needs a clearer stable name or stronger semantic shape before planning an ontology change.",
      );
      break;
    case "new_relation_candidate":
      parts.push("This is shaped enough to move into a plan-only relation proposal.");
      break;
    case "new_concept_candidate":
      parts.push("This is shaped enough to move into a plan-only concept proposal.");
      break;
  }

  return parts.join(" ");
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireNonEmpty(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizeForComparison(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("");
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
    .join("_");
}

function sanitizeNamespaceSegment(value: string | undefined): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "") ?? ""
  );
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
