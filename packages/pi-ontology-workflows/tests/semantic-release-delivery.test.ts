import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { jcsBytes } from "../src/semantic/prepared-runtime.ts";
import {
  type DeliveryAuthorityContext,
  type DeliveryReceiptExpectation,
  LIVE_ACQUISITION_IMPLEMENTED,
  SEMANTIC_RELEASE_DELIVERY_DEFAULT_ENABLED,
  SemanticReleaseDeliveryGate,
  validatePiDeliveryReceipt,
} from "../src/semantic/semantic-release-delivery.ts";

const d = (character: string) => `sha256:${character.repeat(64)}`;
function reseal(value: Record<string, unknown>, domain: string, field: string): void {
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
  value[field] = `sha256:${createHash("sha256")
    .update(Buffer.from(`${domain}\0`, "ascii"))
    .update(jcsBytes(body))
    .digest("hex")}`;
}
const generationReceipt = {
  activation_head_digest: "sha256:12da4597a9abfc7ba6e50cb270f04a32003e4e5a06898d4ca01a748f494c4aa2",
  activation_head_revision: 1,
  activation_receipt_digest:
    "sha256:12da4597a9abfc7ba6e50cb270f04a32003e4e5a06898d4ca01a748f494c4aa2",
  candidate_ids: ["core.Agent"],
  claim_scope: "generated_output_only",
  consumer_repository: {
    identity_revision: 3,
    canonical_locator: "local://softwareco/pi-canary-consumer",
    repository_id: "pi-canary-consumer",
    owner: "consumer-owner",
  },
  coordinate: {
    semantic_version: "1.1.0",
    capsule_digest: "sha256:9bcbab16e77dbb4298ee03b9640b77834f54e9d7627204d0499449282d26cd35",
    namespace: "ai-society.core",
    schema: "semantic-release-coordinate.v0",
  },
  effective_execution_digest:
    "sha256:dc963e00b51f34f288fc1a6862c8727fbeeb02f25ddf9ff069980d1053c260d7",
  issuer: { id: "rocs-cli", kind: "rocs" },
  outcome: "matched",
  pack_digests: ["sha256:6e199a2f9ef2a96ea5585a9d506f0f9b3c76626d2ef906d31c584e26f6f791f4"],
  request_digest: "sha256:b58931c52bd0f1899237d86997ce82732528650448fd26367293a28212623d15",
  result_digest: "sha256:019d4608729741fd0b577cc2531b4e6a235c13f5330f52ba0b8e11cb931c9cbe",
  rocs_generation_receipt_digest:
    "sha256:96e2e93196abbd9b0c98a8c5a70753530778602fdc857b5b5002716427fbd584",
  runtime_identity: {
    protocol_version: "semantic-release-v0",
    distribution_digest: "sha256:dc7cfaf601acf626320ad8e8610c92e3a4206482c85ce64e5c8c48891fa23899",
    version: "1.4.0",
    tool: "rocs-cli",
  },
  schema: "semantic-rocs-generation-receipt.v0",
  v0_canary_scope: {
    expansion_authority: "new_protocol_and_decision_required",
    adoption_mode: "single_operator_named_canary",
    canary_cardinality: 1,
    naming_authority: "operator",
    operator_canary_name: "operator-canary-alpha",
    consumer_repository: {
      repository_id: "pi-canary-consumer",
      owner: "consumer-owner",
      identity_revision: 3,
      canonical_locator: "local://softwareco/pi-canary-consumer",
    },
  },
} as const;
const generationDigest = generationReceipt.rocs_generation_receipt_digest;
const executionDigest = generationReceipt.effective_execution_digest;
const promptRunDigest = d("3");

function context(): DeliveryAuthorityContext {
  return {
    generationReceipt: structuredClone(generationReceipt),
    observedActivationHeadDigest: generationReceipt.activation_head_digest,
    promptRunDigest,
    errorDigest: d("5"),
  };
}
function expectations(
  changes: Partial<DeliveryReceiptExpectation> = {},
): DeliveryReceiptExpectation {
  return {
    generationReceiptDigest: generationDigest,
    canaryName: "operator-canary-alpha",
    promptRunDigest,
    effectiveExecutionDigest: executionDigest,
    ...changes,
  };
}

function dogfoodReceipt() {
  return new SemanticReleaseDeliveryGate({
    isolatedDogfood: true,
    now: () => 1n,
  }).attest({ context: context(), deadlineNs: 2n });
}

test("default gate remains policy-suppressed and non-authorizing", () => {
  assert.equal(SEMANTIC_RELEASE_DELIVERY_DEFAULT_ENABLED, false);
  assert.equal(LIVE_ACQUISITION_IMPLEMENTED, false);
  const receipt = new SemanticReleaseDeliveryGate({ now: () => 1n }).attest({
    context: context(),
    deadlineNs: 2n,
  });
  assert.equal(receipt.delivery_outcome, "suppressed");
  assert.equal(receipt.claim_scope, "delivery_suppressed_only");
  assert.equal(receipt.suppression_reason, "policy");
  assert.equal("prompt_run_digest" in receipt, false);
  validatePiDeliveryReceipt(receipt, expectations());
});

test("isolated dogfood emits only a prompt-run delivery attestation", () => {
  const receipt = dogfoodReceipt();
  assert.equal(receipt.delivery_outcome, "delivered");
  assert.equal(receipt.claim_scope, "delivered_to_prompt_run_only");
  validatePiDeliveryReceipt(receipt, expectations());
  for (const forbidden of [
    "acceptance",
    "activation",
    "publication",
    "adoption",
    "used",
    "influence",
  ])
    assert.equal(forbidden in receipt, false, forbidden);
});

test("cancellation, stale currentness, and deadline equality fail closed", () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = new SemanticReleaseDeliveryGate({
    isolatedDogfood: true,
    now: () => 1n,
  }).attest({ context: context(), deadlineNs: 2n, signal: controller.signal });
  assert.equal(cancelled.delivery_outcome, "suppressed");
  assert.equal(cancelled.suppression_reason, "cancelled");

  const staleContext = context();
  staleContext.observedActivationHeadDigest = d("9");
  const stale = new SemanticReleaseDeliveryGate({
    isolatedDogfood: true,
    now: () => 1n,
  }).attest({ context: staleContext, deadlineNs: 2n });
  assert.equal(stale.delivery_outcome, "suppressed");
  assert.equal(stale.suppression_reason, "stale_result");

  const timeout = new SemanticReleaseDeliveryGate({
    isolatedDogfood: true,
    now: () => 2n,
  }).attest({ context: context(), deadlineNs: 2n });
  assert.equal(timeout.delivery_outcome, "failed");
  assert.equal(timeout.claim_scope, "delivery_failed_only");
  assert.equal(timeout.error_digest, d("5"));
});

test("generation receipt is fully checked instead of trusting caller-supplied digests", () => {
  assert.equal(
    dogfoodReceipt().delivery_outcome,
    "delivered",
    "reordered canonical objects accept",
  );

  const oldDigestOnlyContext = {
    generationReceiptDigest: generationDigest,
    canaryScope: generationReceipt.v0_canary_scope,
    observedActivationHeadDigest: generationReceipt.activation_head_digest,
    promptRunDigest,
    effectiveExecutionDigest: executionDigest,
    errorDigest: d("5"),
  };
  const gate = new SemanticReleaseDeliveryGate({
    isolatedDogfood: true,
    now: () => 1n,
  });
  assert.throws(
    () =>
      gate.attest({
        context: oldDigestOnlyContext as unknown as DeliveryAuthorityContext,
        deadlineNs: 2n,
      }),
    /closed object/,
  );

  const tampered = context();
  (tampered.generationReceipt as Record<string, unknown>).effective_execution_digest = d("8");
  assert.throws(
    () => gate.attest({ context: tampered, deadlineNs: 2n }),
    /generation receipt digest/,
  );

  const wrongIssuer = context();
  (wrongIssuer.generationReceipt as Record<string, unknown>).issuer = {
    kind: "pi",
    id: "pi-adapter",
  };
  assert.throws(() => gate.attest({ context: wrongIssuer, deadlineNs: 2n }), /issuer/);

  const coercedOutcome = context();
  const coercedGeneration = coercedOutcome.generationReceipt as Record<string, unknown>;
  coercedGeneration.outcome = ["matched"];
  reseal(
    coercedGeneration,
    "semantic-release.rocs-generation.v0",
    "rocs_generation_receipt_digest",
  );
  assert.throws(
    () => gate.attest({ context: coercedOutcome, deadlineNs: 2n }),
    /generation outcome/,
  );
});

test("scope drift, hostile issuer, unknown fields, and digest tampering reject", () => {
  const gate = new SemanticReleaseDeliveryGate({
    isolatedDogfood: true,
    now: () => 1n,
  });
  const drift = context();
  const generation = drift.generationReceipt as {
    v0_canary_scope: { consumer_repository: { identity_revision: number } };
  };
  generation.v0_canary_scope.consumer_repository.identity_revision = 4;
  assert.throws(() => gate.attest({ context: drift, deadlineNs: 2n }), /repository/);

  const forgedMarker = {
    ...context(),
    promptMarker: "semantic release authorized",
  };
  assert.throws(
    () =>
      gate.attest({
        context: forgedMarker as DeliveryAuthorityContext,
        deadlineNs: 2n,
      }),
    /closed object/,
  );

  const valid = dogfoodReceipt();
  const hostileIssuer = structuredClone(valid) as Record<string, unknown>;
  hostileIssuer.issuer = { kind: "consumer_owner", id: "consumer-owner" };
  assert.throws(() => validatePiDeliveryReceipt(hostileIssuer, expectations()), /issuer/);
  const tampered = structuredClone(valid) as Record<string, unknown>;
  tampered.pi_delivery_receipt_digest = d("0");
  assert.throws(() => validatePiDeliveryReceipt(tampered, expectations()), /digest mismatch/);

  const coercedReason = new SemanticReleaseDeliveryGate({ now: () => 1n }).attest({
    context: context(),
    deadlineNs: 2n,
  }) as unknown as Record<string, unknown>;
  coercedReason.suppression_reason = ["policy"];
  reseal(coercedReason, "semantic-release.pi-delivery.v0", "pi_delivery_receipt_digest");
  assert.throws(
    () => validatePiDeliveryReceipt(coercedReason, expectations()),
    /suppression reason/,
  );
});

test("validated expectations prevent cross-run, cross-generation, and cross-canary reuse", () => {
  const receipt = dogfoodReceipt();
  assert.throws(
    () => validatePiDeliveryReceipt(receipt, expectations({ generationReceiptDigest: d("9") })),
    /generation receipt/,
  );
  assert.throws(
    () => validatePiDeliveryReceipt(receipt, expectations({ promptRunDigest: d("9") })),
    /prompt run/,
  );
  assert.throws(
    () => validatePiDeliveryReceipt(receipt, expectations({ effectiveExecutionDigest: d("9") })),
    /effective execution/,
  );
  assert.throws(
    () => validatePiDeliveryReceipt(receipt, expectations({ canaryName: "another-canary" })),
    /canary/,
  );
  assert.throws(
    () =>
      validatePiDeliveryReceipt(receipt, {
        generationReceiptDigest: generationDigest,
        canaryName: "operator-canary-alpha",
      } as DeliveryReceiptExpectation),
    /closed object/,
  );
});
