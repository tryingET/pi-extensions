import type {
  DispatchPostureResult,
  ExecutionBinding,
  FrozenDispatchPolicy,
} from "./dispatchPosture.js";
import type { Template } from "./vaultTypes.js";

export type ExecutionSurface =
  | "vault_command"
  | "live_trigger"
  | "route"
  | "grounding"
  | "prompt_plane_selection"
  | "prompt_plane_continuation"
  | "orchestrator_adapter"
  | "projected_prompt";
export type CompositionKind = "single" | "grounding" | "route" | "batch";
export type DispatchBlockReason =
  | "missing_template"
  | "invisible_template"
  | "inactive_template"
  | "export_ineligible"
  | "schema_incompatible"
  | "unknown_governed_value"
  | "missing_binding"
  | "unsupported_surface"
  | "identity_drift"
  | "partial_batch"
  | "mixed_disposition"
  | "incompatible_bindings"
  | "company_context_conflict"
  | "invalid_identity"
  | "invalid_authorization_state";

export interface VaultDispatchExecutionContext {
  cwd?: string;
  currentCompany?: string;
}
export interface DispatchSubjectIdentity {
  templateId: number;
  templateName: string;
  templateVersion: number;
  contentSha256: string;
  governedMetadataSha256: string;
  resolvedCompany: string;
}
export interface PreparedIdentity {
  renderer: string;
  rendererVersion: string;
  wrapper: string;
  contextSha256: string;
  argumentsSha256: string;
}
export interface DispatchAggregateIdentity {
  primary: DispatchSubjectIdentity;
  members: readonly DispatchSubjectIdentity[];
  compositionKind: CompositionKind;
  finalPreparedBytesSha256: string;
  preparation: PreparedIdentity;
}
interface AuthorizationBase {
  schema: "pi.vault.dispatch-authorization.v1";
  authorizationId: string;
  aggregate: DispatchAggregateIdentity;
  surface: ExecutionSurface;
  registryId: string;
}
export type DispatchAuthorizationV1 =
  | (AuthorizationBase & { disposition: "text_ready"; revalidateImmediatelyBeforeSend: true })
  | (AuthorizationBase & {
      disposition: "dispatch_required";
      binding: Readonly<ExecutionBinding>;
      revalidateImmediatelyBeforeDispatch: true;
    })
  | {
      schema: "pi.vault.dispatch-authorization.v1";
      disposition: "blocked";
      reason: DispatchBlockReason;
      safeMessage: string;
    };
export interface PreparedExecutionRequest {
  templates: Template[];
  primaryTemplateName: string;
  finalPreparedText: string;
  compositionKind?: CompositionKind;
  surface: ExecutionSurface;
  currentCompany: string;
  renderer?: string;
  rendererVersion?: string;
  wrapper?: string;
  context?: string;
  args?: string[];
}
export interface ClaimedPreparedExecution {
  authorizationId: string;
  disposition: "text_ready" | "dispatch_required";
  sealedText: string;
  binding: Readonly<ExecutionBinding> | null;
  aggregate: DispatchAggregateIdentity;
  surface: ExecutionSurface;
}
export interface VaultDispatchCheckResult {
  ok: boolean;
  status: "ready" | "blocked";
  results?: DispatchPostureResult[];
  missing?: string[];
  current_company?: string;
  current_company_source?: string;
  blocking_reason?: string;
}
export interface VaultDispatchRuntime {
  checkTemplates(
    templateNames: string[],
    ctx?: VaultDispatchExecutionContext,
  ): Promise<VaultDispatchCheckResult>;
  authorizePreparedExecution(request: PreparedExecutionRequest): DispatchAuthorizationV1;
  claimPreparedExecution(
    authorizationId: string,
  ):
    | { ok: true; value: ClaimedPreparedExecution }
    | { ok: false; reason: DispatchBlockReason; error: string };
  settlePreparedExecution(authorizationId: string, outcome: "handed_off" | "failed"): boolean;
  policy: FrozenDispatchPolicy;
}
export interface VaultDispatchRuntimeOptions {
  runtime?: unknown;
  policy?: FrozenDispatchPolicy;
}
export declare function createVaultDispatchRuntime(
  options?: VaultDispatchRuntimeOptions,
): VaultDispatchRuntime;
export declare function isVaultDispatchRuntime(value: unknown): value is VaultDispatchRuntime;
export { createDispatchPolicy } from "./dispatchPosture.js";
