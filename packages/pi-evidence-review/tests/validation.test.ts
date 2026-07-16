import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  assertResourceCapsMatchSchema,
  enforceResourceCaps,
  RESOURCE_CAPS,
  ReviewRejection,
  validateEvidenceReview,
} from "../src/validation.ts";

const fixtures = join(import.meta.dirname, "fixtures");
const valid = JSON.parse(readFileSync(join(fixtures, "valid.json"), "utf8")) as Record<
  string,
  unknown
>;

function clone(): Record<string, unknown> {
  return structuredClone(valid);
}

function first(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const item = (value[key] as Array<Record<string, unknown>>)[0];
  assert.ok(item);
  return item;
}

function rejected(value: unknown, code?: string): void {
  assert.throws(
    () => validateEvidenceReview(value),
    (error: unknown) => error instanceof ReviewRejection && (!code || error.code === code),
  );
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("runtime resource caps exactly match the vendored schema extension", () => {
  const schema = JSON.parse(
    readFileSync(
      join(import.meta.dirname, "..", "schemas", "evidence-review-v1.schema.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  assert.doesNotThrow(() => assertResourceCapsMatchSchema(schema));
  const drifted = structuredClone(schema);
  (drifted["x-sci-resourceCaps"] as Record<string, unknown>).maximumDepth = 33;
  assert.throws(() => assertResourceCapsMatchSchema(drifted), /do not match/);
});

test("vendored schema and fixtures retain exact reviewed bytes", () => {
  const expected = new Map([
    [
      join(import.meta.dirname, "..", "schemas", "evidence-review-v1.schema.json"),
      "f964b852b0bb82593402c8390308da0d12366313c9029ce83b348d65af9ef958",
    ],
    [
      join(fixtures, "valid.json"),
      "01189f79426e3fce466e188cda95cf7bac3fafd4f66af060e04c529876fcf0e9",
    ],
    [
      join(fixtures, "adversarial.json"),
      "f06c9b59216e0772e51b44036557792fb771cfb5e3fe8799101bbccfa444a078",
    ],
    [
      join(fixtures, "current-producer-sample.json"),
      "acf53f703645f7c3edc3a245199db1f6d182e7f96fe2fb309be1090a96544e9d",
    ],
  ]);
  for (const [path, hash] of expected) assert.equal(sha256(path), hash);
});

test("vendored goldens and current producer sample validate while adversarial fixture is atomic", () => {
  assert.equal(
    validateEvidenceReview(clone()).schema,
    "semantic-code-intelligence.evidence_review.v1",
  );
  const current = JSON.parse(readFileSync(join(fixtures, "current-producer-sample.json"), "utf8"));
  assert.equal(
    validateEvidenceReview(current).schema,
    "semantic-code-intelligence.evidence_review.v1",
  );
  const adversarial = JSON.parse(readFileSync(join(fixtures, "adversarial.json"), "utf8"));
  rejected(adversarial, "schema");
});

test("schema rejects unsupported discriminator, unknown fields, and hostile controls", () => {
  for (const mutation of [
    (value: Record<string, unknown>) => {
      value.schema = "semantic-code-intelligence.evidence_review.v2";
    },
    (value: Record<string, unknown>) => {
      value.unknown = true;
    },
    (value: Record<string, unknown>) => {
      (value.outcome as Record<string, unknown>).status = "bad\u001b[31m";
    },
    (value: Record<string, unknown>) => {
      (value.outcome as Record<string, unknown>).status = "spoof\u202e";
    },
  ]) {
    const value = clone();
    mutation(value);
    rejected(value, "schema");
  }
});

test("all semantic reference families reject dangling references", () => {
  const cases: Array<(value: Record<string, unknown>) => void> = [
    (value) => {
      first(value, "limitations").sourceArtifact = "missing";
    },
    (value) => {
      first(value, "limitations").affectsClaims = ["missing"];
    },
    (value) => {
      first(value, "limitations").affectsDecisionPoints = ["missing"];
    },
    (value) => {
      first(value, "claims").supportedBy = ["missing"];
    },
    (value) => {
      first(value, "claims").limitedBy = ["missing"];
    },
    (value) => {
      first(value, "claims").authorityBoundaries = ["missing"];
    },
    (value) => {
      first(value, "claims").operatorDecisionPoints = ["missing"];
    },
    (value) => {
      first(value, "operatorDecisionPoints").supportingClaims = ["missing"];
    },
    (value) => {
      first(value, "operatorDecisionPoints").limitingClaims = ["missing"];
    },
  ];
  for (const mutate of cases) {
    const value = clone();
    mutate(value);
    rejected(value);
  }
});

test("handoff readiness gate IDs reject identical and conflicting duplicates", () => {
  for (const conflicting of [false, true]) {
    const value = clone();
    const readiness = value.handoffReadiness as Record<string, unknown>;
    const gates = readiness.gates as Array<Record<string, unknown>>;
    const duplicate = structuredClone(gates[0]);
    assert.ok(duplicate);
    if (conflicting) duplicate.status = duplicate.status === "present" ? "missing" : "present";
    gates.push(duplicate);
    rejected(value, "duplicate_handoff_gate_id");
  }
});

test("IDs are unique within every ID-bearing collection", () => {
  for (const key of [
    "evidenceArtifacts",
    "limitations",
    "claims",
    "authorityBoundaries",
    "operatorDecisionPoints",
  ]) {
    const value = clone();
    const items = value[key] as Array<Record<string, unknown>>;
    const initial = items[0];
    assert.ok(initial);
    items.push(structuredClone(initial));
    rejected(value);
  }
});

test("aggregate member, string, array, and depth caps are enforced", () => {
  assert.throws(
    () => enforceResourceCaps({ values: Array(RESOURCE_CAPS.maximumArrayItems + 1).fill(null) }),
    /Evidence review rejected/,
  );
  const members: Record<string, null> = {};
  for (let index = 0; index <= RESOURCE_CAPS.maximumTotalItems; index += 1) {
    members[`k${index}`] = null;
  }
  assert.throws(() => enforceResourceCaps(members), /Evidence review rejected/);
  assert.throws(
    () => enforceResourceCaps("x".repeat(RESOURCE_CAPS.maximumTotalStringCodePoints + 1)),
    /Evidence review rejected/,
  );
  let nested: unknown = null;
  for (let depth = 0; depth <= RESOURCE_CAPS.maximumDepth; depth += 1) nested = [nested];
  assert.throws(() => enforceResourceCaps(nested), /Evidence review rejected/);
});
