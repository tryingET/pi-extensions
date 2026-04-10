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
        allow_picker_fallback?: boolean;
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
  render?: {
    engine?: string;
    explicit_engine?: string | null;
    context_appended?: boolean;
    used_render_keys?: string[];
  };
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
  version?: number;
  id?: number;
}

export interface VaultPromptPlaneRuntimeOptions {
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
  };
}

export function createVaultPromptPlaneRuntime(
  options?: VaultPromptPlaneRuntimeOptions,
): VaultPromptPlaneRuntime;
