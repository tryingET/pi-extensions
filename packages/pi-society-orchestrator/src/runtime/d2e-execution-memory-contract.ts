/** Default-disabled Decision 100 execution-memory consumer. */

import type { D2ETemplateIdentity } from "./d2e-transfer-contract.ts";

export const D2E_EXECUTION_MEMORY_TEMPLATE = "execution-memory-transfer" as const;
export const D2E_EXECUTION_MEMORY_OWNER = "core" as const;
export const D2E_EXECUTION_MEMORY_GATE = "D2E_EXECUTION_MEMORY_V1" as const;
export const D2E_EXECUTION_MEMORY_RECEIPT = "D2E_EXECUTION_MEMORY_OBSERVATION_V1" as const;
export const EXECUTION_MEMORY_SURFACE = "decision.execution_memory_check" as const;
export const EXECUTION_MEMORY_PAYLOAD_KIND = "d2e_execution_memory_check" as const;
export const EXECUTION_MEMORY_PROFILE = "d2e-transfer-v1" as const;
export const EXECUTION_MEMORY_SCHEMA_LOCATOR =
  "ak machine schema decision-execution-memory-check" as const;
export const EXECUTION_MEMORY_TIMEOUT_MS = 30_000;

export const SHA256 = /^[a-f0-9]{64}$/u;
export const GITHUB_BLOB = /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[a-f0-9]{40}\/[^?#]+$/u;
export const RESULT_STATES = new Set([
  "memory_incomplete",
  "memory_ready_authorization_blocked",
  "memory_ready_authorization_unproven",
  "memory_ready_authorization_indeterminate",
]);
export const AUTHORIZATION_STATES = new Set([
  "blocked_pending_authorization",
  "unproven",
  "indeterminate",
]);
export const PROFILE_HEALTH_STATES = new Set(["healthy", "degraded"]);
export const PRODUCER_ERROR_CODES = new Set([
  "invalid_request",
  "unsupported_profile",
  "runtime_db_not_found",
  "repo_scope_unresolved",
  "repo_scope_mismatch",
  "incompatible_db_schema",
  "missing_required_capability",
  "query_only_capability_unavailable",
  "decision_not_found",
  "unsupported_decision_significance",
  "local_git_provider_unavailable",
  "critical_state_corrupt",
  "snapshot_read_failed",
  "internal_error",
]);
export const CAPABILITY_IDS = [
  "repo_registration_v1",
  "decision_post_adr_v1",
  "layer12_packet_identity_v1",
  "task_execution_memory_v1",
  "task_admission_v1",
  "task_closeout_v1",
  "fcos_metadata_boundary_v1",
] as const;

export type D2EExecutionMemoryMode = "proposal" | "applied";
export type D2EExecutionMemoryConsumerErrorCode =
  | "D2E_EXECUTION_MEMORY_DISABLED"
  | "D2E_EXECUTION_MEMORY_INPUT_INVALID"
  | "D2E_EXECUTION_MEMORY_TEMPLATE_IDENTITY_MISMATCH"
  | "D2E_EXECUTION_MEMORY_BINARY_IDENTITY_MISMATCH"
  | "D2E_EXECUTION_MEMORY_POSITIVE_AUTHORIZATION_UNSUPPORTED"
  | "D2E_EXECUTION_MEMORY_TRANSPORT_FAILED"
  | "D2E_EXECUTION_MEMORY_ENVELOPE_INVALID"
  | "D2E_EXECUTION_MEMORY_PRODUCER_REJECTED";

export class D2EExecutionMemoryConsumerError extends Error {
  readonly code: D2EExecutionMemoryConsumerErrorCode;
  readonly producerError?: Record<string, unknown>;

  constructor(
    code: D2EExecutionMemoryConsumerErrorCode,
    message: string,
    producerError?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "D2EExecutionMemoryConsumerError";
    this.code = code;
    this.producerError = producerError;
  }
}

export interface D2EExecutionMemoryRequest {
  mode?: D2EExecutionMemoryMode;
  templateIdentity: D2ETemplateIdentity;
  repo: string;
  decisionId: number;
  packetId: number;
  packetKey: string;
  packetSource: string;
  packetSourceSha256: string;
  expectedTaskIds: number[];
  expectedDependencies: string[];
  authorizationBlockRef?: string;
}

export interface D2EExecutionMemoryReceipt {
  schema: typeof D2E_EXECUTION_MEMORY_RECEIPT;
  lawful_success: true;
  read_only: true;
  execution_performed: false;
  status: "not_ready";
  mode: "proposal";
  applied: false;
  applied_ready: false;
  activation: "enabled";
  template: D2ETemplateIdentity;
  producer: {
    surface: typeof EXECUTION_MEMORY_SURFACE;
    envelope_schema_version: 1;
    payload_kind: typeof EXECUTION_MEMORY_PAYLOAD_KIND;
    profile: typeof EXECUTION_MEMORY_PROFILE;
    profile_schema_version: 1;
    binary_path: string;
    binary_sha256: string;
    envelope_sha256: string;
  };
  pre_execution_memory_ready: boolean;
  result_state:
    | "memory_incomplete"
    | "memory_ready_authorization_blocked"
    | "memory_ready_authorization_unproven"
    | "memory_ready_authorization_indeterminate";
  authorization: {
    capability: "negative_gate_only";
    positive_proof_supported: false;
    state: "blocked_pending_authorization" | "unproven" | "indeterminate";
  };
  profile_health: { state: "healthy" | "degraded" };
  transfer_materialization_authorization: {
    disposition: "not_authorized";
    basis: "negative_only_execution_memory_profile";
  };
  downstream_implementation_authorization: {
    disposition: "not_authorized";
    granted: false;
    basis: "separate_downstream_owner_authorization_required";
  };
  effect: { disposition: "not_materialized" };
  observation: Record<string, unknown>;
}
