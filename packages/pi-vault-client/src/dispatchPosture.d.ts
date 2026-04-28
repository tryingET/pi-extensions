export type DispatchPosture =
  | "text_ok"
  | "orchestrator_loop_required"
  | "orchestrator_workflow_gate_required"
  | "missing_execution_binding_fail_closed";

export interface ExecutionBinding {
  execution_required: true;
  execution_surface: "loop_execute" | "workflow_execute";
  execution_args: Record<string, unknown>;
  on_missing_binding: "fail_closed";
}

export interface DispatchPostureResult {
  posture: DispatchPosture;
  template_name: string;
  control_mode: string;
  formalization_level: string;
  binding: ExecutionBinding | null;
  reason: string;
}

export interface ProjectionFreshnessResult {
  template_name: string;
  status: "fresh" | "stale" | "not_exported" | "no_local_file" | "error";
  db_version: number | null;
  db_content_sha256: string | null;
  local_file_path: string | null;
  local_content_sha256: string | null;
  message: string;
}

export declare function classifyDispatchPosture(template: {
  name: string;
  control_mode: string;
  formalization_level: string;
}): DispatchPostureResult;

export declare function isTextOk(posture: DispatchPosture): boolean;

export declare function isOrchestratorGateRequired(posture: DispatchPosture): boolean;

export declare function formatDispatchPosture(result: DispatchPostureResult): string;

export declare function checkProjectionFreshness(template: {
  name: string;
  content: string;
  export_to_pi?: boolean;
  version?: number | null;
  status?: string | null;
}): ProjectionFreshnessResult;

export declare function formatProjectionFreshness(result: ProjectionFreshnessResult): string;

export declare function getKnownLoopBindings(): Readonly<Record<string, ExecutionBinding>>;

export declare function registerLoopBinding(name: string, binding: ExecutionBinding): void;
