/** Public closed contracts for the D2E transfer workflow gate. */

import type { WorkflowResult } from "./workflow.ts";

export const D2E_TRANSFER_COMPLETE_SCHEMA = "D2E_TRANSFER_COMPLETE_V1" as const;
export const D2E_TRANSFER_PROPOSAL_SCHEMA = "D2E_TRANSFER_PROPOSAL_V1" as const;
export const D2E_WORKFLOW_RESULT_SCHEMA = "D2E_WORKFLOW_RESULT_V1" as const;
export const D2E_WORKFLOW_TEMPLATE_OWNERS = Object.freeze({
  "layer12-040-direction-to-execution-ak-native": "software",
  "repo-direction-to-execution": "holding",
} as const);
export const D2E_WORKFLOW_TEMPLATE_NAMES = Object.freeze(
  Object.keys(D2E_WORKFLOW_TEMPLATE_OWNERS) as Array<keyof typeof D2E_WORKFLOW_TEMPLATE_OWNERS>,
);

export const AK_TIMEOUT_MS = 30_000;
export const SHA256 = /^[a-f0-9]{64}$/u;
export const EXPECTED_ARTIFACT_KIND = "procedure";
export const EXPECTED_CONTROL_MODE = "one_shot";
export const EXPECTED_FORMALIZATION_LEVEL = "workflow";
export type JsonRecord = Record<string, unknown>;

export type D2ETransferMode = "proposal" | "applied";
export type D2ETransferErrorCode =
  | "D2E_TRANSFER_TEMPLATE_UNBOUND"
  | "D2E_TRANSFER_TEMPLATE_IDENTITY_MISMATCH"
  | "D2E_TRANSFER_INPUT_INVALID"
  | "D2E_TRANSFER_DISABLED"
  | "D2E_TRANSFER_PACKET_READBACK_FAILED"
  | "D2E_TRANSFER_TASK_READBACK_FAILED"
  | "D2E_TRANSFER_DECISION_READBACK_FAILED"
  | "D2E_TRANSFER_PACKET_MISMATCH"
  | "D2E_TRANSFER_TASK_MISMATCH"
  | "D2E_TRANSFER_TASK_SCOPE_MISMATCH"
  | "D2E_TRANSFER_TASK_INTENT_MISMATCH"
  | "D2E_TRANSFER_DECISION_MISMATCH"
  | "D2E_TRANSFER_AUTHORIZATION_REQUIRED"
  | "D2E_TRANSFER_AUTHORIZATION_DRIFT"
  | "D2E_TRANSFER_VAULT_AUTHORIZATION_FAILED"
  | "D2E_TRANSFER_REPOSITORY_PRESTATE_INVALID"
  | "D2E_TRANSFER_EFFECTS_INVALID"
  | "D2E_TRANSFER_OUTPUT_INVALID"
  | "D2E_TRANSFER_POSTSTATE_INVALID"
  | "D2E_TRANSFER_WORKFLOW_INCOMPLETE";

export type D2EExecutionPhase =
  | "input_validation"
  | "activation_check"
  | "initial_readback"
  | "authorization_check"
  | "preparation"
  | "pre_dispatch_readback"
  | "vault_claim"
  | "dispatch"
  | "post_effect_verification"
  | "final_readback"
  | "vault_settlement";
export type D2EEffectDisposition = "not_materialized" | "indeterminate";
export type D2EFailureBoundary = "required_packet";
export interface D2EOriginalFailureCause {
  code: D2ETransferErrorCode;
  message: string;
  failure_boundary?: D2EFailureBoundary;
}
export interface D2ETransferFailureEnvelope {
  schema: "D2E_TRANSFER_FAILURE_V1";
  status: "not_ready";
  caller_mode: D2ETransferMode;
  execution_phase: D2EExecutionPhase;
  required_packet: { disposition: "ready" | "blocked" | "unknown" };
  transfer_materialization_authorization: {
    disposition: "authorized" | "not_authorized";
    existed_at_dispatch: boolean;
    readback?: AuthorizationReadback;
  };
  downstream_implementation_authorization: D2EDownstreamImplementationAuthorization;
  effect: { disposition: D2EEffectDisposition };
  error: { code: D2ETransferErrorCode; message: string };
  original_cause?: D2EOriginalFailureCause;
}

export class D2ETransferError extends Error {
  readonly code: D2ETransferErrorCode;
  readonly failureBoundary?: D2EFailureBoundary;
  readonly originalCause?: D2EOriginalFailureCause;
  failure?: D2ETransferFailureEnvelope;
  constructor(
    code: D2ETransferErrorCode,
    message: string,
    options: {
      failureBoundary?: D2EFailureBoundary;
      originalCause?: D2EOriginalFailureCause;
    } = {},
  ) {
    super(message);
    this.name = "D2ETransferError";
    this.code = code;
    this.failureBoundary = options.failureBoundary;
    this.originalCause = options.originalCause;
  }
  attachFailure(failure: D2ETransferFailureEnvelope): this {
    this.failure = failure;
    return this;
  }
}

export interface D2ETransferExecResult {
  stdout: string;
  stderr: string;
  code: number;
  killed?: boolean;
}
export type D2ETransferExec = (
  command: string,
  args: string[],
  options: { cwd: string; signal?: AbortSignal; timeout: number },
) => Promise<D2ETransferExecResult>;

export interface D2ETemplateIdentity {
  templateId: number;
  templateName: string;
  artifactKind: string;
  controlMode: string;
  formalizationLevel: string;
  ownerCompany: string;
  templateVersion: number;
  contentSha256: string;
}

export interface D2ETransferRequest {
  templateName: string;
  templateIdentity: D2ETemplateIdentity;
  expectedTemplateVersion?: number;
  expectedTemplateContentSha256?: string;
  mode?: D2ETransferMode;
  repo: string;
  packetKey: string;
  taskId: number;
  decisionId: number;
  expectedTaskScopeSha256?: string;
  expectedTaskIntentSha256?: string;
  objective: string;
  invokingActor: string;
  invokingSessionId: string;
}

export interface D2ERepositoryState {
  head: string;
  worktreeClean: boolean;
  changedPaths: string[];
}

export interface D2EPreparedTemplateClaim {
  authorizationId: string;
  sealedText: string;
  templateIdentity: D2ETemplateIdentity & { governedMetadataSha256: string };
  settle(outcome: "handed_off" | "failed"): void;
}

export interface TaskScope {
  allowed_paths: string[];
  required_paths: string[];
  forbidden_paths: string[];
}
export interface TaskIntentSemantics {
  schema: "D2E_TASK_INTENT_V1";
  title: string;
  description: string | null;
  done_contract: {
    entity_version: number;
    contract: JsonRecord;
  };
  guardrails: {
    entity_version: number;
    guardrails: JsonRecord;
  };
}
export interface TaskIntentReadback {
  semantics: TaskIntentSemantics;
  sha256: string;
  canonicalIntent: string;
}
export interface AuthorizationReadback {
  granted: boolean;
  basis: "actor_session_live_lease_without_active_deferral" | "not_authorized";
  claimedBy: string | null;
  invokingActor: string;
  invokingSessionId: string;
  leaseExpiresAt: string | null;
  blocker: string | null;
}
export interface IdentityReadback {
  packet: JsonRecord;
  task: JsonRecord;
  decision: JsonRecord;
  packetEnvelope: JsonRecord;
  decisionEnvelope: JsonRecord;
  scope: TaskScope;
  scopeSha256: string;
  taskIntent: TaskIntentReadback;
  authorization: AuthorizationReadback;
  snapshotSha256: string;
}

export interface D2EDownstreamImplementationAuthorization {
  disposition: "not_authorized";
  granted: false;
  basis: "separate_downstream_owner_authorization_required";
}
export interface D2ETransferMaterializationAuthorization {
  disposition: "authorized" | "not_authorized";
  readback: AuthorizationReadback;
}
export interface D2ESchemaBoundary {
  inner_workflow_output: typeof D2E_WORKFLOW_RESULT_SCHEMA;
  outer_transfer_receipt: typeof D2E_TRANSFER_COMPLETE_SCHEMA;
}

export interface D2ETransferProposalReceipt {
  schema: typeof D2E_TRANSFER_PROPOSAL_SCHEMA;
  lawful_success: true;
  read_only: true;
  execution_performed: false;
  mode: "proposal";
  caller_mode: "proposal";
  status: "ready" | "not_ready";
  applied: false;
  activation: "enabled" | "disabled";
  template: D2ETemplateIdentity;
  repo: string;
  packet_key: string;
  task_id: number;
  task_scope_sha256: string;
  task_intent_sha256: string;
  decision_id: number;
  applied_ready: boolean;
  required_packet: { disposition: "ready" };
  transfer_materialization_authorization: D2ETransferMaterializationAuthorization;
  downstream_implementation_authorization: D2EDownstreamImplementationAuthorization;
  effect: { disposition: "not_materialized" };
  schema_boundary: D2ESchemaBoundary;
  authorization: AuthorizationReadback;
}

export interface D2ETransferCompleteReceipt {
  schema: typeof D2E_TRANSFER_COMPLETE_SCHEMA;
  lawful_success: true;
  read_only: false;
  execution_performed: true;
  mode: "applied";
  caller_mode: "applied";
  status: "complete";
  applied: true;
  activation: "enabled";
  template: D2ETemplateIdentity & { governedMetadataSha256: string };
  transfer_materialization_authorization: D2ETransferMaterializationAuthorization & {
    disposition: "authorized";
  };
  downstream_implementation_authorization: D2EDownstreamImplementationAuthorization;
  schema_boundary: D2ESchemaBoundary;
  repo: string;
  packet: { key: string; id: number; source_ref: string; entity_version: number };
  task: {
    id: number;
    status: "claimed";
    entity_version: number;
    scope_sha256: string;
    intent_sha256: string;
  };
  decision: { id: number; state: "unblocked"; outcome: "accepted"; updated_at: string };
  authorization: AuthorizationReadback & { granted: true; blocker: null };
  effect: {
    disposition: "materialized";
    outcome: "applied";
    objective_sha256: string;
    task_intent_sha256: string;
    head_before: string;
    head_after: string;
    changed_paths: string[];
    output_sha256: string;
  };
  workflow: {
    mode: string;
    status: "done";
    step_count: 1;
    output_schema: typeof D2E_WORKFLOW_RESULT_SCHEMA;
  };
}

export type D2ETransferGateResult =
  | { kind: "proposal"; receipt: D2ETransferProposalReceipt }
  | { kind: "complete"; receipt: D2ETransferCompleteReceipt; workflow: WorkflowResult };
