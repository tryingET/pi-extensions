import { createHash } from "node:crypto";
import { jcsBytes } from "./prepared-runtime.ts";

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const NAMESPACE = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/;
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const GENERATION_DOMAIN = "semantic-release.rocs-generation.v0";
const RECEIPT_DOMAIN = "semantic-release.pi-delivery.v0";

export const SEMANTIC_RELEASE_DELIVERY_DEFAULT_ENABLED = false as const;
export const LIVE_ACQUISITION_IMPLEMENTED = false as const;

const CONSUMER_REPOSITORY = Object.freeze({
  owner: "consumer-owner",
  repository_id: "pi-canary-consumer",
  canonical_locator: "local://softwareco/pi-canary-consumer",
  identity_revision: 3,
} as const);
const ROCS_ISSUER = Object.freeze({ kind: "rocs", id: "rocs-cli" } as const);
const PI_ISSUER = Object.freeze({ kind: "pi", id: "pi-adapter" } as const);

const GENERATION_KEYS = [
  "schema",
  "issuer",
  "claim_scope",
  "activation_receipt_digest",
  "activation_head_revision",
  "activation_head_digest",
  "consumer_repository",
  "v0_canary_scope",
  "coordinate",
  "runtime_identity",
  "request_digest",
  "result_digest",
  "effective_execution_digest",
  "candidate_ids",
  "pack_digests",
  "outcome",
  "rocs_generation_receipt_digest",
] as const;

type Obj = Record<string, unknown>;
export type SuppressionReason = "cancelled" | "stale_result" | "policy";
export interface V0CanaryScope {
  consumer_repository: typeof CONSUMER_REPOSITORY;
  operator_canary_name: string;
  naming_authority: "operator";
  canary_cardinality: 1;
  adoption_mode: "single_operator_named_canary";
  expansion_authority: "new_protocol_and_decision_required";
}
export interface DeliveryAuthorityContext {
  /** A complete, recursively checked semantic-rocs-generation-receipt.v0 value. */
  generationReceipt: unknown;
  /** Current activation head read independently of the generation receipt. */
  observedActivationHeadDigest: string;
  promptRunDigest: string;
  errorDigest: string;
}
interface ResolvedDeliveryContext {
  generationReceiptDigest: string;
  canaryScope: V0CanaryScope;
  activationHeadDigest: string;
  observedActivationHeadDigest: string;
  promptRunDigest: string;
  effectiveExecutionDigest: string;
  errorDigest: string;
}
export interface DeliveryReceiptExpectation {
  generationReceiptDigest: string;
  canaryName: string;
  promptRunDigest: string;
  effectiveExecutionDigest: string;
}
export type PiDeliveryReceipt =
  | {
      schema: "semantic-pi-delivery-receipt.v0";
      issuer: typeof PI_ISSUER;
      claim_scope: "delivered_to_prompt_run_only";
      rocs_generation_receipt_digest: string;
      consumer_repository: typeof CONSUMER_REPOSITORY;
      v0_canary_scope: V0CanaryScope;
      delivery_outcome: "delivered";
      prompt_run_digest: string;
      delivered_effective_execution_digest: string;
      pi_delivery_receipt_digest: string;
    }
  | {
      schema: "semantic-pi-delivery-receipt.v0";
      issuer: typeof PI_ISSUER;
      claim_scope: "delivery_suppressed_only";
      rocs_generation_receipt_digest: string;
      consumer_repository: typeof CONSUMER_REPOSITORY;
      v0_canary_scope: V0CanaryScope;
      delivery_outcome: "suppressed";
      suppression_reason: SuppressionReason;
      pi_delivery_receipt_digest: string;
    }
  | {
      schema: "semantic-pi-delivery-receipt.v0";
      issuer: typeof PI_ISSUER;
      claim_scope: "delivery_failed_only";
      rocs_generation_receipt_digest: string;
      consumer_repository: typeof CONSUMER_REPOSITORY;
      v0_canary_scope: V0CanaryScope;
      delivery_outcome: "failed";
      error_digest: string;
      pi_delivery_receipt_digest: string;
    };

export interface DeliveryAttempt {
  context: DeliveryAuthorityContext;
  signal?: AbortSignal;
  deadlineNs: bigint;
}

export class SemanticReleaseDeliveryError extends Error {}

export class SemanticReleaseDeliveryGate {
  readonly #isolatedDogfood: boolean;
  readonly #now: () => bigint;

  constructor(options?: { isolatedDogfood?: boolean; now?: () => bigint }) {
    this.#isolatedDogfood = options?.isolatedDogfood === true;
    this.#now = options?.now ?? process.hrtime.bigint;
  }

  attest(attempt: DeliveryAttempt): PiDeliveryReceipt {
    const context = validateContext(attempt.context);
    if (typeof attempt.deadlineNs !== "bigint" || attempt.deadlineNs < 0n) bad("invalid deadline");
    if (attempt.signal?.aborted) return suppressed(context, "cancelled");
    if (this.#now() >= attempt.deadlineNs) return failed(context);
    if (context.activationHeadDigest !== context.observedActivationHeadDigest)
      return suppressed(context, "stale_result");
    if (!this.#isolatedDogfood) return suppressed(context, "policy");
    return delivered(context);
  }
}

export function validatePiDeliveryReceipt(
  value: unknown,
  expectedValue: DeliveryReceiptExpectation,
): PiDeliveryReceipt {
  const expected = validateExpectation(expectedValue);
  const o = object(value, "Pi delivery receipt");
  const common = [
    "schema",
    "issuer",
    "claim_scope",
    "rocs_generation_receipt_digest",
    "consumer_repository",
    "v0_canary_scope",
    "delivery_outcome",
    "pi_delivery_receipt_digest",
  ];
  if (o.delivery_outcome === "delivered")
    exact(o, [...common, "prompt_run_digest", "delivered_effective_execution_digest"]);
  else if (o.delivery_outcome === "suppressed") exact(o, [...common, "suppression_reason"]);
  else if (o.delivery_outcome === "failed") exact(o, [...common, "error_digest"]);
  else bad("unsupported delivery outcome");
  eq(o.schema, "semantic-pi-delivery-receipt.v0");
  if (!same(o.issuer, PI_ISSUER)) bad("issuer mismatch");
  if (!same(o.consumer_repository, CONSUMER_REPOSITORY)) bad("consumer scope mismatch");
  const scope = validateScope(o.v0_canary_scope);
  digest(o.rocs_generation_receipt_digest);
  digest(o.pi_delivery_receipt_digest);
  if (o.rocs_generation_receipt_digest !== expected.generationReceiptDigest)
    bad("generation receipt mismatch");
  if (scope.operator_canary_name !== expected.canaryName) bad("canary mismatch");
  if (o.delivery_outcome === "delivered") {
    eq(o.claim_scope, "delivered_to_prompt_run_only");
    digest(o.prompt_run_digest);
    digest(o.delivered_effective_execution_digest);
    if (o.prompt_run_digest !== expected.promptRunDigest) bad("prompt run mismatch");
    if (o.delivered_effective_execution_digest !== expected.effectiveExecutionDigest)
      bad("effective execution mismatch");
  } else if (o.delivery_outcome === "suppressed") {
    eq(o.claim_scope, "delivery_suppressed_only");
    if (
      typeof o.suppression_reason !== "string" ||
      !new Set(["cancelled", "stale_result", "policy"]).has(o.suppression_reason)
    )
      bad("suppression reason mismatch");
  } else {
    eq(o.claim_scope, "delivery_failed_only");
    digest(o.error_digest);
  }
  const expectedDigest = domainDigest(RECEIPT_DOMAIN, omit(o, "pi_delivery_receipt_digest"));
  if (o.pi_delivery_receipt_digest !== expectedDigest) bad("delivery receipt digest mismatch");
  return o as unknown as PiDeliveryReceipt;
}

function delivered(context: ResolvedDeliveryContext): PiDeliveryReceipt {
  return seal(
    {
      ...base(context),
      claim_scope: "delivered_to_prompt_run_only",
      delivery_outcome: "delivered",
      prompt_run_digest: context.promptRunDigest,
      delivered_effective_execution_digest: context.effectiveExecutionDigest,
    },
    context,
  );
}
function suppressed(
  context: ResolvedDeliveryContext,
  reason: SuppressionReason,
): PiDeliveryReceipt {
  return seal(
    {
      ...base(context),
      claim_scope: "delivery_suppressed_only",
      delivery_outcome: "suppressed",
      suppression_reason: reason,
    },
    context,
  );
}
function failed(context: ResolvedDeliveryContext): PiDeliveryReceipt {
  return seal(
    {
      ...base(context),
      claim_scope: "delivery_failed_only",
      delivery_outcome: "failed",
      error_digest: context.errorDigest,
    },
    context,
  );
}
function base(context: ResolvedDeliveryContext): Obj {
  return {
    schema: "semantic-pi-delivery-receipt.v0",
    issuer: PI_ISSUER,
    rocs_generation_receipt_digest: context.generationReceiptDigest,
    consumer_repository: CONSUMER_REPOSITORY,
    v0_canary_scope: context.canaryScope,
  };
}
function seal(body: Obj, context: ResolvedDeliveryContext): PiDeliveryReceipt {
  const receipt = {
    ...body,
    pi_delivery_receipt_digest: domainDigest(RECEIPT_DOMAIN, body),
  };
  return validatePiDeliveryReceipt(receipt, expectation(context));
}
function expectation(context: ResolvedDeliveryContext): DeliveryReceiptExpectation {
  return {
    generationReceiptDigest: context.generationReceiptDigest,
    canaryName: context.canaryScope.operator_canary_name,
    promptRunDigest: context.promptRunDigest,
    effectiveExecutionDigest: context.effectiveExecutionDigest,
  };
}

function validateContext(context: DeliveryAuthorityContext): ResolvedDeliveryContext {
  const o = object(context, "delivery authority context");
  exact(o, ["generationReceipt", "observedActivationHeadDigest", "promptRunDigest", "errorDigest"]);
  const generation = validateGenerationReceipt(o.generationReceipt);
  digest(o.observedActivationHeadDigest);
  digest(o.promptRunDigest);
  digest(o.errorDigest);
  return {
    generationReceiptDigest: generation.rocsGenerationReceiptDigest,
    canaryScope: generation.canaryScope,
    activationHeadDigest: generation.activationHeadDigest,
    observedActivationHeadDigest: o.observedActivationHeadDigest,
    promptRunDigest: o.promptRunDigest,
    effectiveExecutionDigest: generation.effectiveExecutionDigest,
    errorDigest: o.errorDigest,
  };
}

function validateGenerationReceipt(value: unknown): {
  rocsGenerationReceiptDigest: string;
  canaryScope: V0CanaryScope;
  activationHeadDigest: string;
  effectiveExecutionDigest: string;
} {
  const o = object(value, "ROCS generation receipt");
  exact(o, [...GENERATION_KEYS]);
  eq(o.schema, "semantic-rocs-generation-receipt.v0");
  if (!same(o.issuer, ROCS_ISSUER)) bad("ROCS generation issuer mismatch");
  eq(o.claim_scope, "generated_output_only");
  for (const key of [
    "activation_receipt_digest",
    "activation_head_digest",
    "request_digest",
    "result_digest",
    "effective_execution_digest",
    "rocs_generation_receipt_digest",
  ])
    digest(o[key]);
  safeInteger(o.activation_head_revision, "activation head revision");
  if (o.activation_receipt_digest !== o.activation_head_digest)
    bad("generation activation head mismatch");
  if (!same(o.consumer_repository, CONSUMER_REPOSITORY)) bad("generation consumer scope mismatch");
  const scope = validateScope(o.v0_canary_scope);
  validateCoordinate(o.coordinate);
  validateRuntimeIdentity(o.runtime_identity);
  identifiers(o.candidate_ids, "candidate ids");
  digests(o.pack_digests, "pack digests");
  if (
    typeof o.outcome !== "string" ||
    !new Set(["matched", "ambiguous", "no_match", "not_applicable", "unavailable"]).has(o.outcome)
  )
    bad("generation outcome mismatch");
  const expectedDigest = domainDigest(GENERATION_DOMAIN, omit(o, "rocs_generation_receipt_digest"));
  if (o.rocs_generation_receipt_digest !== expectedDigest)
    bad("ROCS generation receipt digest mismatch");
  // Reassert direct properties for TypeScript's control-flow narrowing after indexed validation.
  digest(o.activation_head_digest);
  digest(o.effective_execution_digest);
  return {
    rocsGenerationReceiptDigest: o.rocs_generation_receipt_digest,
    canaryScope: normalizedScope(scope.operator_canary_name),
    activationHeadDigest: o.activation_head_digest,
    effectiveExecutionDigest: o.effective_execution_digest,
  };
}

function validateExpectation(value: DeliveryReceiptExpectation): DeliveryReceiptExpectation {
  const o = object(value, "delivery receipt expectation");
  exact(o, [
    "generationReceiptDigest",
    "canaryName",
    "promptRunDigest",
    "effectiveExecutionDigest",
  ]);
  digest(o.generationReceiptDigest);
  identifier(o.canaryName, "canary name");
  digest(o.promptRunDigest);
  digest(o.effectiveExecutionDigest);
  return o as unknown as DeliveryReceiptExpectation;
}
function validateScope(value: unknown): V0CanaryScope {
  const o = object(value, "v0 canary scope");
  exact(o, [
    "consumer_repository",
    "operator_canary_name",
    "naming_authority",
    "canary_cardinality",
    "adoption_mode",
    "expansion_authority",
  ]);
  if (!same(o.consumer_repository, CONSUMER_REPOSITORY)) bad("canary repository mismatch");
  identifier(o.operator_canary_name, "canary name");
  eq(o.naming_authority, "operator");
  eq(o.canary_cardinality, 1);
  eq(o.adoption_mode, "single_operator_named_canary");
  eq(o.expansion_authority, "new_protocol_and_decision_required");
  return o as unknown as V0CanaryScope;
}
function normalizedScope(canaryName: string): V0CanaryScope {
  return {
    consumer_repository: CONSUMER_REPOSITORY,
    operator_canary_name: canaryName,
    naming_authority: "operator",
    canary_cardinality: 1,
    adoption_mode: "single_operator_named_canary",
    expansion_authority: "new_protocol_and_decision_required",
  };
}
function validateCoordinate(value: unknown): void {
  const o = object(value, "semantic release coordinate");
  exact(o, ["schema", "namespace", "semantic_version", "capsule_digest"]);
  eq(o.schema, "semantic-release-coordinate.v0");
  if (typeof o.namespace !== "string" || o.namespace.length > 128 || !NAMESPACE.test(o.namespace))
    bad("invalid namespace");
  if (
    typeof o.semantic_version !== "string" ||
    o.semantic_version.length > 256 ||
    !SEMVER.test(o.semantic_version)
  )
    bad("invalid semantic version");
  digest(o.capsule_digest);
}
function validateRuntimeIdentity(value: unknown): void {
  const o = object(value, "runtime identity");
  exact(o, ["tool", "version", "distribution_digest", "protocol_version"]);
  identifier(o.tool, "runtime tool");
  if (typeof o.version !== "string" || o.version.length > 256 || !SEMVER.test(o.version))
    bad("invalid runtime version");
  digest(o.distribution_digest);
  eq(o.protocol_version, "semantic-release-v0");
}
function identifiers(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length > 256) bad(`invalid ${label}`);
  for (const item of value) identifier(item, label);
}
function digests(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length > 256) bad(`invalid ${label}`);
  for (const item of value) digest(item);
}
function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) bad(`invalid ${label}`);
}
function safeInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) bad(`invalid ${label}`);
}
function domainDigest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(Buffer.from(`${domain}\0`, "ascii"))
    .update(jcsBytes(value))
    .digest("hex")}`;
}
function digest(value: unknown): asserts value is string {
  if (typeof value !== "string" || !DIGEST.test(value)) bad("invalid digest");
}
function object(value: unknown, label: string): Obj {
  if (value === null || typeof value !== "object" || Array.isArray(value)) bad(`invalid ${label}`);
  return value as Obj;
}
function exact(value: Obj, keys: readonly string[]): void {
  if (!same(Object.keys(value).sort(), [...keys].sort())) bad("closed object mismatch");
}
function omit(value: Obj, key: string): Obj {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}
function eq(actual: unknown, expected: unknown): void {
  if (actual !== expected) bad("constant mismatch");
}
function same(left: unknown, right: unknown): boolean {
  try {
    return jcsBytes(left).equals(jcsBytes(right));
  } catch {
    return false;
  }
}
function bad(message: string): never {
  throw new SemanticReleaseDeliveryError(message);
}
