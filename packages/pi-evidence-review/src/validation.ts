import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";

export const RESOURCE_CAPS = {
  encodedBytes: 1_048_576,
  maximumDepth: 32,
  maximumArrayItems: 256,
  maximumStringCodePoints: 8_192,
  maximumIdentifierCodePoints: 128,
  maximumCommandCodePoints: 2_048,
  maximumPathCodePoints: 2_048,
  maximumTotalItems: 4_096,
  maximumTotalStringCodePoints: 262_144,
} as const;

export type EvidenceReview = Record<string, unknown> & {
  schema: "semantic-code-intelligence.evidence_review.v1";
  evidenceArtifacts: Array<{ id: string }>;
  limitations: Array<{
    id: string;
    sourceArtifact: string;
    affectsClaims: string[];
    affectsDecisionPoints: string[];
  }>;
  claims: Array<{
    id: string;
    supportedBy: string[];
    limitedBy: string[];
    authorityBoundaries: string[];
    operatorDecisionPoints: string[];
  }>;
  authorityBoundaries: Array<{ id: string }>;
  operatorDecisionPoints: Array<{
    id: string;
    supportingClaims: string[];
    limitingClaims: string[];
  }>;
  handoffReadiness: {
    gates: Array<{ id: string }>;
  };
};

export class ReviewRejection extends Error {
  constructor(public readonly code: string) {
    super("Evidence review rejected");
    this.name = "ReviewRejection";
  }
}

const schemaPath = fileURLToPath(
  new URL("../schemas/evidence-review-v1.schema.json", import.meta.url),
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;

export function assertResourceCapsMatchSchema(schemaValue: Record<string, unknown>): void {
  const schemaCaps = schemaValue["x-sci-resourceCaps"];
  if (!schemaCaps || typeof schemaCaps !== "object" || Array.isArray(schemaCaps)) {
    throw new Error("Vendored evidence review schema is missing x-sci-resourceCaps");
  }
  const expected = Object.entries(RESOURCE_CAPS);
  const actual = Object.entries(schemaCaps as Record<string, unknown>);
  if (
    actual.length !== expected.length ||
    expected.some(([key, value]) => (schemaCaps as Record<string, unknown>)[key] !== value)
  ) {
    throw new Error("Runtime evidence review resource caps do not match the vendored schema");
  }
}

assertResourceCapsMatchSchema(schema);
const ajv = new Ajv({ allErrors: true, strict: true, validateFormats: false });
ajv.addKeyword({ keyword: "x-sci-resourceCaps", schemaType: "object", valid: true });
const validateSchema: ValidateFunction = ajv.compile(schema);

function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function enforceResourceCaps(value: unknown): void {
  let totalItems = 0;
  let totalStringCodePoints = 0;
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    if (current.depth > RESOURCE_CAPS.maximumDepth) {
      throw new ReviewRejection("maximum_depth");
    }
    if (typeof current.value === "string") {
      totalStringCodePoints += codePointLength(current.value);
    } else if (Array.isArray(current.value)) {
      if (current.value.length > RESOURCE_CAPS.maximumArrayItems) {
        throw new ReviewRejection("array_items");
      }
      totalItems += current.value.length;
      for (const child of current.value) stack.push({ value: child, depth: current.depth + 1 });
    } else if (current.value !== null && typeof current.value === "object") {
      const entries = Object.entries(current.value);
      totalItems += entries.length;
      for (const [key, child] of entries) {
        totalStringCodePoints += codePointLength(key);
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
    if (totalItems > RESOURCE_CAPS.maximumTotalItems) {
      throw new ReviewRejection("aggregate_items");
    }
    if (totalStringCodePoints > RESOURCE_CAPS.maximumTotalStringCodePoints) {
      throw new ReviewRejection("aggregate_strings");
    }
  }
}

function requireUniqueIds(items: Array<{ id: string }>, kind: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new ReviewRejection(`duplicate_${kind}_id`);
    ids.add(item.id);
  }
  return ids;
}

function requireReferences(values: string[], targets: Set<string>, kind: string): void {
  for (const value of values) {
    if (!targets.has(value)) throw new ReviewRejection(`dangling_${kind}_reference`);
  }
}

export function enforceReferenceIntegrity(review: EvidenceReview): void {
  const artifacts = requireUniqueIds(review.evidenceArtifacts, "artifact");
  const limitations = requireUniqueIds(review.limitations, "limitation");
  const claims = requireUniqueIds(review.claims, "claim");
  const authorities = requireUniqueIds(review.authorityBoundaries, "authority");
  const decisions = requireUniqueIds(review.operatorDecisionPoints, "decision");
  requireUniqueIds(review.handoffReadiness.gates, "handoff_gate");

  for (const limitation of review.limitations) {
    requireReferences([limitation.sourceArtifact], artifacts, "limitation_artifact");
    requireReferences(limitation.affectsClaims, claims, "limitation_claim");
    requireReferences(limitation.affectsDecisionPoints, decisions, "limitation_decision");
  }
  for (const claim of review.claims) {
    requireReferences(claim.supportedBy, artifacts, "claim_artifact");
    requireReferences(claim.limitedBy, limitations, "claim_limitation");
    requireReferences(claim.authorityBoundaries, authorities, "claim_authority");
    requireReferences(claim.operatorDecisionPoints, decisions, "claim_decision");
  }
  for (const decision of review.operatorDecisionPoints) {
    requireReferences(decision.supportingClaims, claims, "decision_supporting_claim");
    requireReferences(decision.limitingClaims, claims, "decision_limiting_claim");
  }
}

export function validateEvidenceReview(value: unknown): EvidenceReview {
  enforceResourceCaps(value);
  if (!validateSchema(value)) throw new ReviewRejection("schema");
  const review = value as EvidenceReview;
  enforceReferenceIntegrity(review);
  return review;
}

export function schemaErrorsForTest(value: unknown): ErrorObject[] {
  validateSchema(value);
  return validateSchema.errors ? [...validateSchema.errors] : [];
}
