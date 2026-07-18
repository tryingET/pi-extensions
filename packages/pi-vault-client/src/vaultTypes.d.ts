// summary: declaration-only types shared by pi-vault-client's public package seams.
// read_when:
//   - maintaining public prompt-plane or dispatch-runtime declarations without exposing implementation sources.

export type Company = "core" | "software" | "finance" | "house" | "health" | "teaching" | "holding";
export type RenderEngine = "none" | "pi-vars" | "nunjucks";
export type ArtifactKind = "cognitive" | "procedure" | "session";
export type ControlMode = "one_shot" | "router" | "loop";
export type FormalizationLevel = "napkin" | "bounded" | "structured" | "workflow";

export interface RouterControlledVocabulary {
  routing_context?: string;
  activity_phase?: string;
  input_artifact?: string;
  transition_target_type?: string;
  selection_principles?: string[];
  output_commitment?: string;
}

export interface Template {
  name: string;
  description: string;
  content: string;
  render_engine?: RenderEngine | null;
  artifact_kind: ArtifactKind | string;
  control_mode: ControlMode | string;
  formalization_level: FormalizationLevel | string;
  owner_company: Company | string;
  visibility_companies: string[];
  controlled_vocabulary: RouterControlledVocabulary | null;
  status?: string;
  export_to_pi?: boolean;
  version?: number;
  id?: number;
}

export type DispatchPosture =
  | "text_ok"
  | "orchestrator_loop_required"
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
