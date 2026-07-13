import type { DispatchPostureResult } from "./dispatchPosture.js";
import type { DispatchAuthorizationV1, VaultDispatchRuntime } from "./dispatchRuntime.js";

export interface PromptPlaneExecutionContext {
  cwd?: string;
  currentCompany?: string;
}

export interface PromptSelectionRequest {
  query: string;
  context?: string;
}

export interface VaultContinuationEnvelopeV1 {
  contract_version: 1;
  status: "ready" | "ambiguous" | "blocked";
  resolution:
    | {
        kind: "exact_template";
        template_name: string;
        allow_picker_fallback?: false;
      }
    | {
        kind: "picker_query";
        query: string;
        allow_picker_fallback: true;
      };
  preparation?: {
    context?: string;
    args?: string[];
    inherit_current_company?: boolean;
  };
  provenance?: {
    source_template?: string;
    source_execution_id?: number;
    source_output_commitment?: string;
  };
}

export interface PreparedPromptPlaneCandidate {
  ok: boolean;
  status: "ready" | "ambiguous" | "blocked";
  selection_mode?: "exact" | "picker-fzf" | "picker-fallback";
  template?: {
    name: string;
    artifact_kind: string;
    control_mode: string;
    formalization_level: string;
    owner_company: string;
    visibility_companies: string[];
    version?: number;
    id?: number;
  };
  prepared_text?: string;
  blocking_reason?: string;
  dispatch?: DispatchPostureResult;
  render?: {
    engine?: string;
    explicit_engine?: string | null;
    context_appended?: boolean;
    used_render_keys?: string[];
  };
}

export type PreparedPromptPlaneCandidateV2 =
  | {
      ok: true;
      status: "text_ready" | "dispatch_required";
      selection_mode: "exact" | "picker-fallback";
      template: NonNullable<PreparedPromptPlaneCandidate["template"]>;
      authorization: Exclude<DispatchAuthorizationV1, { disposition: "blocked" }>;
      prepared_text?: string;
    }
  | {
      ok: false;
      status: "ambiguous" | "blocked";
      blocking_reason: string;
      authorization?: Extract<DispatchAuthorizationV1, { disposition: "blocked" }>;
    };

export interface PromptPlaneTemplateListRequest {
  filters?: {
    artifact_kind?: string[];
    control_mode?: string[];
    formalization_level?: string[];
    owner_company?: string[];
  };
  limit?: number;
}

export interface VisiblePromptPlaneTemplate {
  name: string;
  description: string;
  artifact_kind: string;
  control_mode: string;
  formalization_level: string;
  owner_company: string;
  visibility_companies: string[];
  version?: number;
  id?: number;
}

export interface ListedPromptPlaneTemplatesResult {
  ok: boolean;
  status: "ready" | "blocked";
  templates?: VisiblePromptPlaneTemplate[];
  blocking_reason?: string;
}

export interface VaultPromptPlaneRuntime {
  prepareSelection(
    request: PromptSelectionRequest,
    ctx?: PromptPlaneExecutionContext,
  ): Promise<PreparedPromptPlaneCandidate>;
  prepareContinuation(
    envelope: VaultContinuationEnvelopeV1,
    ctx?: PromptPlaneExecutionContext,
  ): Promise<PreparedPromptPlaneCandidate>;
  prepareSelectionV2(
    request: PromptSelectionRequest,
    ctx?: PromptPlaneExecutionContext,
  ): Promise<PreparedPromptPlaneCandidateV2>;
  prepareContinuationV2(
    envelope: VaultContinuationEnvelopeV1,
    ctx?: PromptPlaneExecutionContext,
  ): Promise<PreparedPromptPlaneCandidateV2>;
  listVisibleTemplates(
    request?: PromptPlaneTemplateListRequest,
    ctx?: PromptPlaneExecutionContext,
  ): Promise<ListedPromptPlaneTemplatesResult>;
}

export interface VaultPromptPlaneTemplate {
  name: string;
  description: string;
  content: string;
  artifact_kind: string;
  control_mode: string;
  formalization_level: string;
  owner_company: string;
  visibility_companies: string[];
  controlled_vocabulary: Record<string, unknown> | null;
  status?: string;
  export_to_pi?: boolean;
  render_engine?: string | null;
  version?: number;
  id?: number;
}

export interface VaultPromptPlaneRuntimeOptions {
  dispatchRuntime?: VaultDispatchRuntime;
  runtime?: {
    resolveCurrentCompanyContext: (cwd?: string) => { company: string; source: string };
    getTemplateDetailed: (
      name: string,
      context?: { currentCompany?: string; cwd?: string; requireExplicitCompany?: boolean },
    ) =>
      | { ok: true; value: VaultPromptPlaneTemplate | null; error: null }
      | { ok: false; value: null; error: string };
    searchTemplatesDetailed: (
      query: string,
      context?: { currentCompany?: string; cwd?: string; requireExplicitCompany?: boolean },
      options?: { includeContent?: boolean },
    ) =>
      | { ok: true; value: VaultPromptPlaneTemplate[]; error: null }
      | { ok: false; value: null; error: string };
    queryTemplatesDetailed: (
      filters: {
        artifact_kind?: string[];
        control_mode?: string[];
        formalization_level?: string[];
        owner_company?: string[];
      },
      limit: number,
      includeContent: boolean,
      context?: { currentCompany?: string; cwd?: string; requireExplicitCompany?: boolean },
    ) =>
      | { ok: true; value: VaultPromptPlaneTemplate[]; error: null }
      | { ok: false; value: null; error: string };
  };
}

export function createVaultPromptPlaneRuntime(
  options?: VaultPromptPlaneRuntimeOptions,
): VaultPromptPlaneRuntime;
