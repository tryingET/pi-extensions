/** Shared types for the ASC live-runtime proof guard. */

export type TierName = "packageCheck" | "install" | "reload" | "postReloadDogfood";
export type LiveRuntimeTierStatus = "observed" | "required" | "failed" | "unknown";
export type ProofSequenceStatus = "observed" | "required" | "failed" | "unknown";
export type OwnerBindingStatus = "observed" | "failed" | "unknown";
export type EvidenceInput = string | Record<string, unknown>;
export type EvidenceOrigin =
  | "caller_context"
  | "session_command"
  | "session_validation"
  | "session_lifecycle"
  | "session_proof_ledger";

export interface LiveRuntimeSessionEvidence {
  commandProvenance?: EvidenceInput[];
  validationProvenance?: EvidenceInput[];
  lifecycleProvenance?: EvidenceInput[];
  proofLedger?: EvidenceInput[];
}

export interface TierSpec {
  name: TierName;
  statusKeys: readonly string[];
  signalKeys: readonly string[];
  provenanceKeys: readonly string[];
  positivePattern: RegExp;
  provenancePattern: RegExp;
  requiredPattern: RegExp;
  failedPattern: RegExp;
  nextAction: string;
  ownerBound: boolean;
}

export interface EvidenceEntry {
  text: string;
  source: string;
  origin: EvidenceOrigin;
  tier?: string;
  packageName?: string;
  observedAt?: number;
  sequence?: number;
  status?: LiveRuntimeTierStatus;
}
