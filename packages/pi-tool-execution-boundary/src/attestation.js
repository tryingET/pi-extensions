import { timingSafeEqual } from "node:crypto";
import { domainSeparatedDigest } from "./canonical-cbor.js";
import { BoundaryError } from "./errors.js";
import { deepFreeze } from "./util.js";

const HEX_256 = /^[a-f0-9]{64}$/u;

function requireDigest(value, label) {
  if (typeof value !== "string" || !HEX_256.test(value)) {
    throw new BoundaryError("INVALID_DIGEST", `${label} must be a lowercase SHA-256 hex digest`);
  }
  return value;
}

function equalDigest(left, right) {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function attestationSemanticBody(value) {
  return {
    1: value.leaseId,
    2: value.backendId,
    3: value.backendVersion,
    4: value.effectivePolicyDigest,
    5: value.semanticPlanDigest,
    6: value.renderedPlanDigest,
    7: value.tcbGenerationDigest,
    8: value.bootTranscriptDigest,
    9: value.canaryEvidenceDigest,
    10: value.hostConfinementDigest,
    11: value.verifiedAtUnixMs,
    12: value.productionProfile,
  };
}

export function normalizeAttestation(value) {
  if (!value || typeof value !== "object") {
    throw new BoundaryError("INVALID_ATTESTATION", "Attestation must be an object");
  }
  if (value.productionProfile !== true || value.status !== "verified") {
    throw new BoundaryError(
      "BACKEND_NOT_ATTESTED",
      "Only a verified production attestation may activate a lease",
    );
  }
  const normalized = {
    schema: "pi-tool-boundary-attestation/v1",
    status: "verified",
    productionProfile: true,
    leaseId: String(value.leaseId),
    backendId: String(value.backendId),
    backendVersion: String(value.backendVersion),
    effectivePolicyDigest: requireDigest(value.effectivePolicyDigest, "effectivePolicyDigest"),
    semanticPlanDigest: requireDigest(value.semanticPlanDigest, "semanticPlanDigest"),
    renderedPlanDigest: requireDigest(value.renderedPlanDigest, "renderedPlanDigest"),
    tcbGenerationDigest: requireDigest(value.tcbGenerationDigest, "tcbGenerationDigest"),
    bootTranscriptDigest: requireDigest(value.bootTranscriptDigest, "bootTranscriptDigest"),
    canaryEvidenceDigest: requireDigest(value.canaryEvidenceDigest, "canaryEvidenceDigest"),
    hostConfinementDigest: requireDigest(value.hostConfinementDigest, "hostConfinementDigest"),
    verifiedAtUnixMs: Number(value.verifiedAtUnixMs),
  };
  if (!Number.isSafeInteger(normalized.verifiedAtUnixMs) || normalized.verifiedAtUnixMs <= 0) {
    throw new BoundaryError("INVALID_ATTESTATION_TIME", "verifiedAtUnixMs must be a positive integer");
  }
  normalized.attestationDigest = domainSeparatedDigest(
    "pi-tool-boundary/attestation/v1",
    attestationSemanticBody(normalized),
  );
  if (value.attestationDigest && !equalDigest(value.attestationDigest, normalized.attestationDigest)) {
    throw new BoundaryError("ATTESTATION_DIGEST_MISMATCH", "Attestation digest does not match its body");
  }
  return deepFreeze(normalized);
}

export function verifyLeaseBinding(attestationInput, expected) {
  const attestation = normalizeAttestation(attestationInput);
  const checks = [
    ["leaseId", attestation.leaseId, expected.leaseId],
    ["effectivePolicyDigest", attestation.effectivePolicyDigest, expected.effectivePolicyDigest],
    ["semanticPlanDigest", attestation.semanticPlanDigest, expected.semanticPlanDigest],
    ["tcbGenerationDigest", attestation.tcbGenerationDigest, expected.tcbGenerationDigest],
  ];
  for (const [field, actual, wanted] of checks) {
    if (wanted === undefined) continue;
    const matches = field.endsWith("Digest") ? equalDigest(actual, wanted) : actual === wanted;
    if (!matches) {
      throw new BoundaryError(
        "ATTESTATION_BINDING_MISMATCH",
        `Attestation ${field} does not match the requested lease`,
        { field, actual, expected: wanted },
      );
    }
  }
  return attestation;
}
