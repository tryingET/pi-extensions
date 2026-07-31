export type DispatchPosture =
  | "text_ok"
  | "orchestrator_loop_required"
  | "orchestrator_workflow_required"
  | "orchestrator_workflow_gate_required"
  | "missing_execution_binding_fail_closed"
  | "invalid_metadata_fail_closed";

export interface ExecutionBinding {
  execution_required: true;
  execution_surface: "loop_execute" | "workflow_execute";
  execution_args: Record<string, unknown>;
  on_missing_binding: "fail_closed";
  compositeCapable?: boolean;
}

export interface DispatchPostureResult {
  posture: DispatchPosture;
  template_name: string;
  control_mode: string;
  formalization_level: string;
  binding: Readonly<ExecutionBinding> | null;
  reason: string;
  registry_id: string;
}

export interface FrozenDispatchPolicy {
  readonly ontologyContractVersion: string;
  readonly registryId: string;
  readonly bindings: Readonly<Record<string, Readonly<ExecutionBinding>>>;
}

export interface ProjectionFreshnessResult {
  template_name: string;
  status: "fresh" | "quarantined" | "stale" | "not_exported" | "no_local_file" | "error";
  db_version: number | null;
  db_content_sha256: string | null;
  local_file_path: string | null;
  local_content_sha256: string | null;
  message: string;
}

export declare function canonicalJcsBytes(value: unknown): Buffer;
export declare function sha256Hex(content: string | Buffer): string;
export declare function createDispatchPolicy(options: {
  ontologyContractVersion: string;
  bindings: Record<string, ExecutionBinding>;
}): FrozenDispatchPolicy;
export declare function isOwnedDispatchPolicy(policy: unknown): policy is FrozenDispatchPolicy;
export declare const D2E_WORKFLOW_TEMPLATE_OWNERS: Readonly<{
  "layer12-040-direction-to-execution-ak-native": "software";
  "repo-direction-to-execution": "holding";
  "execution-memory-transfer": "core";
}>;
export declare const D2E_WORKFLOW_TEMPLATE_NAMES: readonly (
  | "layer12-040-direction-to-execution-ak-native"
  | "repo-direction-to-execution"
  | "execution-memory-transfer"
)[];
export declare const DEFAULT_DISPATCH_POLICY: FrozenDispatchPolicy;
export declare function classifyDispatchPosture(
  template: {
    name: string;
    control_mode: string;
    formalization_level: string;
  },
  policy?: FrozenDispatchPolicy,
): DispatchPostureResult;
export declare function isTextOk(posture: DispatchPosture): boolean;
export declare function isOrchestratorGateRequired(posture: DispatchPosture): boolean;
export declare function formatDispatchPosture(result: DispatchPostureResult): string;
export declare function checkProjectionFreshness(template: {
  name: string;
  content: string;
  artifact_kind?: string;
  control_mode?: string;
  formalization_level?: string;
  owner_company?: string;
  visibility_companies?: string[];
  controlled_vocabulary?: unknown;
  export_to_pi?: boolean;
  version?: number | null;
  status?: string | null;
}): ProjectionFreshnessResult;
export declare function formatProjectionFreshness(result: ProjectionFreshnessResult): string;
export declare function getKnownLoopBindings(): Readonly<
  Record<string, Readonly<ExecutionBinding>>
>;
/** @deprecated Active dispatch policies are immutable. */
export declare function registerLoopBinding(name: string, binding: ExecutionBinding): never;
