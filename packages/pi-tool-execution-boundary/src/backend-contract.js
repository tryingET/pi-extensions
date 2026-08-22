import { BoundaryError } from "./errors.js";
import { requireConformingBackend } from "./plan.js";
import { normalizeAttestation } from "./attestation.js";
import { deepFreeze } from "./util.js";

export function createProductionBackendIdentity({ plan, capabilities, attestation }) {
  const capabilityProof = requireConformingBackend(plan, capabilities);
  const verifiedAttestation = normalizeAttestation(attestation);
  if (verifiedAttestation.semanticPlanDigest !== plan.semanticPlanDigest) {
    throw new BoundaryError(
      "ATTESTATION_PLAN_MISMATCH",
      "Attestation is not bound to the semantic plan",
    );
  }
  if (verifiedAttestation.backendId !== capabilityProof.backendId) {
    throw new BoundaryError(
      "ATTESTATION_BACKEND_MISMATCH",
      "Attestation backend does not match the capability proof",
    );
  }
  return deepFreeze({
    schema: "pi-tool-boundary-production-backend/v1",
    kind: "microvm",
    backendId: verifiedAttestation.backendId,
    backendVersion: verifiedAttestation.backendVersion,
    semanticPlanDigest: plan.semanticPlanDigest,
    attestationDigest: verifiedAttestation.attestationDigest,
    tcbGenerationDigest: verifiedAttestation.tcbGenerationDigest,
    capabilityProof,
  });
}

export function assertNoRuntimeTestDouble(value) {
  if (
    value?.kind !== "microvm" ||
    value?.schema !== "pi-tool-boundary-production-backend/v1" ||
    typeof value?.attestationDigest !== "string"
  ) {
    throw new BoundaryError(
      "PRODUCTION_BACKEND_REQUIRED",
      "Runtime activation requires an attested production micro-VM backend identity",
    );
  }
  return value;
}
