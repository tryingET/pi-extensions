import { prepareTemplateForExecutionCompat } from "./templatePreparationCompat.js";
import { splitQueryAndContext } from "./triggerAdapter.js";
import { createVaultRuntime } from "./vaultDb.js";
import type { Template, VaultRuntime } from "./vaultTypes.js";

const PROMPT_PLANE_CONTEXT_ERROR =
  "Explicit company context is required for visibility-sensitive prompt-plane preparation. Set PI_COMPANY or run from a company-scoped cwd.";
const MAX_AMBIGUOUS_TEMPLATE_NAMES = 5;

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

interface PromptPlaneRuntimeDeps {
  resolveCurrentCompanyContext: VaultRuntime["resolveCurrentCompanyContext"];
  getTemplateDetailed: VaultRuntime["getTemplateDetailed"];
  searchTemplatesDetailed: VaultRuntime["searchTemplatesDetailed"];
}

export interface VaultPromptPlaneRuntimeOptions {
  runtime?: PromptPlaneRuntimeDeps;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toTemplateSnapshot(template: Template) {
  return {
    id: template.id,
    name: template.name,
    version: template.version,
    artifact_kind: template.artifact_kind,
    control_mode: template.control_mode,
    formalization_level: template.formalization_level,
    owner_company: template.owner_company,
    visibility_companies: [...template.visibility_companies],
  };
}

function blocked(reason: string): PreparedPromptPlaneCandidate {
  return {
    ok: false,
    status: "blocked",
    blocking_reason: reason,
  };
}

function ambiguous(reason: string): PreparedPromptPlaneCandidate {
  return {
    ok: false,
    status: "ambiguous",
    selection_mode: "picker-fallback",
    blocking_reason: reason,
  };
}

function resolvePromptPlaneCompanyContext(
  runtime: PromptPlaneRuntimeDeps,
  ctx: PromptPlaneExecutionContext | undefined,
): { ok: true; currentCompany: string; companySource: string } | { ok: false; error: string } {
  const explicitCompany = asNonEmptyString(ctx?.currentCompany);
  if (explicitCompany) {
    return {
      ok: true,
      currentCompany: explicitCompany,
      companySource: "explicit:currentCompany",
    };
  }

  const companyContext = runtime.resolveCurrentCompanyContext(ctx?.cwd);
  if (companyContext.source === "contract-default") {
    return { ok: false, error: PROMPT_PLANE_CONTEXT_ERROR };
  }

  return {
    ok: true,
    currentCompany: companyContext.company,
    companySource: companyContext.source,
  };
}

function normalizeSelectionRequest(request: PromptSelectionRequest): {
  query: string;
  context: string;
} {
  const rawQuery = typeof request?.query === "string" ? request.query : "";
  const explicitContext = typeof request?.context === "string" ? request.context : "";
  if (explicitContext) {
    return {
      query: rawQuery.trim(),
      context: explicitContext,
    };
  }

  const parsed = splitQueryAndContext(rawQuery, "::");
  return {
    query: parsed.query,
    context: parsed.context,
  };
}

function formatAmbiguousTemplateNames(templates: Template[]): string {
  const names = templates
    .slice(0, MAX_AMBIGUOUS_TEMPLATE_NAMES)
    .map((template) => template.name)
    .join(", ");
  const hiddenCount = templates.length - Math.min(templates.length, MAX_AMBIGUOUS_TEMPLATE_NAMES);
  return hiddenCount > 0 ? `${names}, +${hiddenCount} more` : names;
}

function prepareCandidate(
  template: Template,
  options: {
    currentCompany: string;
    context: string;
    args?: string[];
    selectionMode: "exact" | "picker-fallback";
  },
): PreparedPromptPlaneCandidate {
  const prepared = prepareTemplateForExecutionCompat(template.content, {
    currentCompany: options.currentCompany,
    context: options.context,
    templateName: template.name,
    args: options.args,
    appendContextSection: true,
    allowLegacyPiVarsAutoDetect: false,
  });
  if (!prepared.ok) {
    return blocked(`Vault template render failed (${template.name}): ${prepared.error}`);
  }

  return {
    ok: true,
    status: "ready",
    selection_mode: options.selectionMode,
    template: toTemplateSnapshot(template),
    prepared_text: prepared.prepared,
    render: {
      engine: prepared.engine,
      explicit_engine: prepared.explicitEngine,
      context_appended: prepared.contextAppended,
      used_render_keys: [...prepared.usedRenderKeys],
    },
  };
}

function resolveExactTemplate(
  runtime: PromptPlaneRuntimeDeps,
  query: string,
  ctx: {
    currentCompany: string;
    cwd?: string;
    context: string;
    args?: string[];
  },
): PreparedPromptPlaneCandidate | null {
  const exactMatch = runtime.getTemplateDetailed(query, {
    currentCompany: ctx.currentCompany,
    cwd: ctx.cwd,
    requireExplicitCompany: true,
  });
  if (!exactMatch.ok) return blocked(exactMatch.error);
  if (!exactMatch.value) return null;
  return prepareCandidate(exactMatch.value, {
    currentCompany: ctx.currentCompany,
    context: ctx.context,
    args: ctx.args,
    selectionMode: "exact",
  });
}

function resolveSearchSelection(
  runtime: PromptPlaneRuntimeDeps,
  query: string,
  ctx: {
    currentCompany: string;
    cwd?: string;
    context: string;
    args?: string[];
  },
): PreparedPromptPlaneCandidate {
  const searchResult = runtime.searchTemplatesDetailed(
    query,
    {
      currentCompany: ctx.currentCompany,
      cwd: ctx.cwd,
      requireExplicitCompany: true,
    },
    { includeContent: false },
  );
  if (!searchResult.ok) return blocked(searchResult.error);
  if (searchResult.value.length === 0) {
    return blocked(`No visible template matched "${query}".`);
  }
  if (searchResult.value.length > 1) {
    return ambiguous(
      `Multiple visible templates matched "${query}": ${formatAmbiguousTemplateNames(searchResult.value)}.`,
    );
  }

  return prepareCandidate(searchResult.value[0], {
    currentCompany: ctx.currentCompany,
    context: ctx.context,
    args: ctx.args,
    selectionMode: "picker-fallback",
  });
}

function validateContinuationEnvelope(envelope: unknown):
  | { ok: true; value: VaultContinuationEnvelopeV1 }
  | {
      ok: false;
      error: string;
    } {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, error: "Continuation envelope must be an object." };
  }
  const candidate = envelope as Record<string, unknown>;
  if (candidate.contract_version !== 1) {
    return { ok: false, error: "contract_version must be 1." };
  }
  if (
    candidate.status !== "ready" &&
    candidate.status !== "ambiguous" &&
    candidate.status !== "blocked"
  ) {
    return { ok: false, error: "status must be ready, ambiguous, or blocked." };
  }
  if (!candidate.resolution || typeof candidate.resolution !== "object") {
    return { ok: false, error: "resolution is required." };
  }

  const resolution = candidate.resolution as Record<string, unknown>;
  if (resolution.kind === "exact_template") {
    if (!asNonEmptyString(resolution.template_name)) {
      return { ok: false, error: "resolution.template_name is required for exact_template." };
    }
  } else if (resolution.kind === "picker_query") {
    if (!asNonEmptyString(resolution.query)) {
      return { ok: false, error: "resolution.query is required for picker_query." };
    }
    if (resolution.allow_picker_fallback !== true) {
      return {
        ok: false,
        error: "picker_query continuations must set allow_picker_fallback=true.",
      };
    }
  } else {
    return { ok: false, error: "resolution.kind must be exact_template or picker_query." };
  }

  if (candidate.status === "ambiguous" && resolution.kind !== "picker_query") {
    return {
      ok: false,
      error: "ambiguous continuations must use picker_query resolution in V3.",
    };
  }

  if (candidate.preparation !== undefined) {
    if (!candidate.preparation || typeof candidate.preparation !== "object") {
      return { ok: false, error: "preparation must be an object when provided." };
    }
    const preparation = candidate.preparation as Record<string, unknown>;
    if (preparation.context !== undefined && typeof preparation.context !== "string") {
      return { ok: false, error: "preparation.context must be a string when provided." };
    }
    if (
      preparation.inherit_current_company !== undefined &&
      typeof preparation.inherit_current_company !== "boolean"
    ) {
      return {
        ok: false,
        error: "preparation.inherit_current_company must be boolean when provided.",
      };
    }
    if (preparation.args !== undefined) {
      if (!Array.isArray(preparation.args)) {
        return { ok: false, error: "preparation.args must be an array when provided." };
      }
      if (preparation.args.some((value) => typeof value !== "string")) {
        return { ok: false, error: "preparation.args must contain only strings." };
      }
    }
  }

  if (candidate.provenance !== undefined) {
    if (!candidate.provenance || typeof candidate.provenance !== "object") {
      return { ok: false, error: "provenance must be an object when provided." };
    }
    const provenance = candidate.provenance as Record<string, unknown>;
    if (
      provenance.source_execution_id !== undefined &&
      !Number.isFinite(Number(provenance.source_execution_id))
    ) {
      return { ok: false, error: "provenance.source_execution_id must be numeric when provided." };
    }
  }

  return { ok: true, value: candidate as unknown as VaultContinuationEnvelopeV1 };
}

export function createVaultPromptPlaneRuntime(
  options: VaultPromptPlaneRuntimeOptions = {},
): VaultPromptPlaneRuntime {
  const runtime = options.runtime ?? createVaultRuntime();

  return {
    async prepareSelection(request, ctx = {}) {
      const companyContext = resolvePromptPlaneCompanyContext(runtime, ctx);
      if (!companyContext.ok) return blocked(companyContext.error);

      const normalized = normalizeSelectionRequest(request);
      if (!normalized.query) {
        return blocked("Prompt selection requires a non-empty template name or query.");
      }

      const exact = resolveExactTemplate(runtime, normalized.query, {
        currentCompany: companyContext.currentCompany,
        cwd: ctx.cwd,
        context: normalized.context,
      });
      if (exact) return exact;

      return resolveSearchSelection(runtime, normalized.query, {
        currentCompany: companyContext.currentCompany,
        cwd: ctx.cwd,
        context: normalized.context,
      });
    },

    async prepareContinuation(envelope, ctx = {}) {
      const validated = validateContinuationEnvelope(envelope);
      if (!validated.ok) {
        return blocked(`Invalid vault continuation envelope: ${validated.error}`);
      }

      const companyContext = resolvePromptPlaneCompanyContext(runtime, ctx);
      if (!companyContext.ok) return blocked(companyContext.error);

      if (validated.value.status === "blocked") {
        return blocked(
          "Continuation envelope reported blocked status; exact-next-step execution is not lawful yet.",
        );
      }

      if (validated.value.preparation?.inherit_current_company === false) {
        return blocked(
          "Continuation envelopes that disable current-company inheritance are not supported in V3.",
        );
      }

      const continuationContext = validated.value.preparation?.context ?? "";
      const continuationArgs =
        validated.value.preparation?.args?.map((value) => String(value)) ?? [];

      if (validated.value.resolution.kind === "exact_template") {
        const exact = resolveExactTemplate(runtime, validated.value.resolution.template_name, {
          currentCompany: companyContext.currentCompany,
          cwd: ctx.cwd,
          context: continuationContext,
          args: continuationArgs,
        });
        return (
          exact ??
          blocked(
            `No visible template matched "${validated.value.resolution.template_name}" for continuation.`,
          )
        );
      }

      return resolveSearchSelection(runtime, validated.value.resolution.query, {
        currentCompany: companyContext.currentCompany,
        cwd: ctx.cwd,
        context: continuationContext,
        args: continuationArgs,
      });
    },
  };
}
