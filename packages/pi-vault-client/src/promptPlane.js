// summary: resolve visible vault selections and continuation envelopes into prepared prompt-plane candidates.
// read_when:
//   - integrating exact or fuzzy prompt selection, continuation validation, or company visibility gates.
import { guardPreparedText } from "./dispatchGuard.js";
import { classifyDispatchPosture } from "./dispatchPosture.js";
import { createVaultDispatchRuntime, isVaultDispatchRuntime } from "./dispatchRuntime.js";
import { prepareTemplateForExecutionCompat } from "./templatePreparationCompat.js";
import { splitQueryAndContext } from "./triggerAdapter.js";
import { createVaultRuntime } from "./vaultDb.js";
import { MAX_VAULT_QUERY_LIMIT } from "./vaultTypes.js";

const PROMPT_PLANE_CONTEXT_ERROR =
  "Explicit company context is required for visibility-sensitive prompt-plane preparation. Set PI_COMPANY or run from a company-scoped cwd.";
const MAX_AMBIGUOUS_TEMPLATE_NAMES = 5;
function asNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function toTemplateSnapshot(template) {
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
function toVisibleTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    version: template.version,
    artifact_kind: template.artifact_kind,
    control_mode: template.control_mode,
    formalization_level: template.formalization_level,
    owner_company: template.owner_company,
    visibility_companies: [...template.visibility_companies],
  };
}
function blocked(reason, dispatch) {
  return {
    ok: false,
    status: "blocked",
    blocking_reason: reason,
    ...(dispatch ? { dispatch } : {}),
  };
}
function ambiguous(reason) {
  return {
    ok: false,
    status: "ambiguous",
    selection_mode: "picker-fallback",
    blocking_reason: reason,
  };
}
function listBlocked(reason) {
  return {
    ok: false,
    status: "blocked",
    blocking_reason: reason,
  };
}
function resolvePromptPlaneCompanyContext(runtime, ctx) {
  const explicitCompany = asNonEmptyString(ctx?.currentCompany);
  const hasExplicitCwd = typeof ctx?.cwd === "string" && ctx.cwd.trim().length > 0;
  const companyContext = runtime.resolveCurrentCompanyContext(ctx?.cwd);
  const ambientCompanyContext = runtime.resolveCurrentCompanyContext(undefined);
  if (explicitCompany) {
    const conflictingContext = [companyContext, ambientCompanyContext].find(
      (candidate) =>
        candidate.source !== "contract-default" && candidate.company !== explicitCompany,
    );
    if (conflictingContext) {
      return {
        ok: false,
        error: `Explicit currentCompany (${explicitCompany}) conflicts with resolved company context (${conflictingContext.company} via ${conflictingContext.source}).`,
      };
    }
    return {
      ok: true,
      currentCompany: explicitCompany,
      companySource:
        companyContext.source !== "contract-default"
          ? companyContext.source
          : ambientCompanyContext.source !== "contract-default"
            ? ambientCompanyContext.source
            : "explicit:currentCompany",
    };
  }
  if (companyContext.source !== "contract-default") {
    return {
      ok: true,
      currentCompany: companyContext.company,
      companySource: companyContext.source,
    };
  }
  if (hasExplicitCwd) {
    return { ok: false, error: PROMPT_PLANE_CONTEXT_ERROR };
  }
  if (ambientCompanyContext.source === "contract-default") {
    return { ok: false, error: PROMPT_PLANE_CONTEXT_ERROR };
  }
  return {
    ok: true,
    currentCompany: ambientCompanyContext.company,
    companySource: ambientCompanyContext.source,
  };
}
function normalizeSelectionRequest(request) {
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
function formatAmbiguousTemplateNames(templates) {
  const names = templates
    .slice(0, MAX_AMBIGUOUS_TEMPLATE_NAMES)
    .map((template) => template.name)
    .join(", ");
  const hiddenCount = templates.length - Math.min(templates.length, MAX_AMBIGUOUS_TEMPLATE_NAMES);
  return hiddenCount > 0 ? `${names}, +${hiddenCount} more` : names;
}
function prepareCandidate(template, options) {
  const dispatch = classifyDispatchPosture(template, options.dispatchRuntime.policy);
  const prepared = prepareTemplateForExecutionCompat(template.content, {
    currentCompany: options.currentCompany,
    context: options.context,
    templateName: template.name,
    args: options.args,
    appendContextSection: true,
    allowLegacyPiVarsAutoDetect: false,
  });
  if (!prepared.ok) {
    return blocked(`Vault template render failed (${template.name}): ${prepared.error}`, dispatch);
  }
  const guarded = guardPreparedText(
    {
      templates: [template],
      primaryTemplateName: template.name,
      preparedText: prepared.prepared,
      surface: options.surface,
      currentCompany: options.currentCompany,
      renderer: prepared.engine,
      context: options.context,
      args: options.args,
    },
    options.dispatchRuntime,
  );
  if (!guarded.ok) return blocked(guarded.error, dispatch);
  return {
    ok: true,
    status: "ready",
    selection_mode: options.selectionMode,
    template: toTemplateSnapshot(template),
    prepared_text: guarded.text,
    dispatch,
    render: {
      engine: prepared.engine,
      explicit_engine: prepared.explicitEngine,
      context_appended: prepared.contextAppended,
      used_render_keys: [...prepared.usedRenderKeys],
    },
  };
}
function prepareCandidateV2(template, options) {
  const prepared = prepareTemplateForExecutionCompat(template.content, {
    currentCompany: options.currentCompany,
    context: options.context,
    templateName: template.name,
    args: options.args,
    appendContextSection: true,
    allowLegacyPiVarsAutoDetect: false,
  });
  if (!prepared.ok) {
    return {
      ok: false,
      status: "blocked",
      blocking_reason: `Vault template render failed (${template.name}): ${prepared.error}`,
    };
  }
  const authorization = options.dispatchRuntime.authorizePreparedExecution({
    templates: [template],
    primaryTemplateName: template.name,
    finalPreparedText: prepared.prepared,
    surface: options.surface,
    currentCompany: options.currentCompany,
    renderer: prepared.engine,
    context: options.context,
    args: options.args,
  });
  if (authorization.disposition === "blocked") {
    return {
      ok: false,
      status: "blocked",
      blocking_reason: authorization.safeMessage,
      authorization,
    };
  }
  if (authorization.disposition === "text_ready") {
    const claimed = options.dispatchRuntime.claimPreparedExecution(authorization.authorizationId);
    if (!claimed.ok) {
      return {
        ok: false,
        status: "blocked",
        blocking_reason: claimed.error,
      };
    }
    options.dispatchRuntime.settlePreparedExecution(authorization.authorizationId, "handed_off");
    return {
      ok: true,
      status: "text_ready",
      selection_mode: options.selectionMode,
      template: toTemplateSnapshot(template),
      authorization,
      prepared_text: claimed.value.sealedText,
    };
  }
  return {
    ok: true,
    status: "dispatch_required",
    selection_mode: options.selectionMode,
    template: toTemplateSnapshot(template),
    authorization,
  };
}
function resolveExactTemplate(runtime, query, ctx) {
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
    surface: ctx.surface,
    dispatchRuntime: ctx.dispatchRuntime,
  });
}
function resolveSearchSelection(runtime, query, ctx) {
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
    surface: ctx.surface,
    dispatchRuntime: ctx.dispatchRuntime,
  });
}
function validateContinuationEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object") {
    return { ok: false, error: "Continuation envelope must be an object." };
  }
  const candidate = envelope;
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
  const resolution = candidate.resolution;
  if (resolution.kind === "exact_template") {
    if (!asNonEmptyString(resolution.template_name)) {
      return { ok: false, error: "resolution.template_name is required for exact_template." };
    }
    if (
      resolution.allow_picker_fallback !== undefined &&
      typeof resolution.allow_picker_fallback !== "boolean"
    ) {
      return {
        ok: false,
        error: "resolution.allow_picker_fallback must be boolean when provided.",
      };
    }
    if (resolution.allow_picker_fallback === true) {
      return {
        ok: false,
        error: "exact_template continuations cannot set allow_picker_fallback=true in V3.",
      };
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
    const preparation = candidate.preparation;
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
    const provenance = candidate.provenance;
    if (
      provenance.source_execution_id !== undefined &&
      !Number.isFinite(Number(provenance.source_execution_id))
    ) {
      return { ok: false, error: "provenance.source_execution_id must be numeric when provided." };
    }
  }
  return { ok: true, value: candidate };
}
export function createVaultPromptPlaneRuntime(options = {}) {
  const runtime = options.runtime ?? createVaultRuntime();
  const dispatchRuntime =
    options.dispatchRuntime ?? createVaultDispatchRuntime({ runtime: runtime });
  if (!isVaultDispatchRuntime(dispatchRuntime)) {
    throw new Error("Prompt-plane dispatch runtime must be package-created.");
  }
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
        surface: "prompt_plane_selection",
        dispatchRuntime,
      });
      if (exact) return exact;
      return resolveSearchSelection(runtime, normalized.query, {
        currentCompany: companyContext.currentCompany,
        cwd: ctx.cwd,
        context: normalized.context,
        surface: "prompt_plane_selection",
        dispatchRuntime,
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
          surface: "prompt_plane_continuation",
          dispatchRuntime,
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
        surface: "prompt_plane_continuation",
        dispatchRuntime,
      });
    },
    async prepareSelectionV2(request, ctx = {}) {
      const companyContext = resolvePromptPlaneCompanyContext(runtime, ctx);
      if (!companyContext.ok)
        return { ok: false, status: "blocked", blocking_reason: companyContext.error };
      const normalized = normalizeSelectionRequest(request);
      if (!normalized.query)
        return {
          ok: false,
          status: "blocked",
          blocking_reason: "Prompt selection requires a non-empty template name or query.",
        };
      const exact = runtime.getTemplateDetailed(normalized.query, {
        currentCompany: companyContext.currentCompany,
        cwd: ctx.cwd,
        requireExplicitCompany: true,
      });
      if (!exact.ok) return { ok: false, status: "blocked", blocking_reason: exact.error };
      let selected = exact.value;
      let selectionMode = "exact";
      if (!selected) {
        const search = runtime.searchTemplatesDetailed(
          normalized.query,
          {
            currentCompany: companyContext.currentCompany,
            cwd: ctx.cwd,
            requireExplicitCompany: true,
          },
          { includeContent: true },
        );
        if (!search.ok) return { ok: false, status: "blocked", blocking_reason: search.error };
        if (search.value.length !== 1)
          return {
            ok: false,
            status: search.value.length > 1 ? "ambiguous" : "blocked",
            blocking_reason:
              search.value.length > 1
                ? `Multiple visible templates matched "${normalized.query}".`
                : `No visible template matched "${normalized.query}".`,
          };
        selected = search.value[0];
        selectionMode = "picker-fallback";
      }
      return prepareCandidateV2(selected, {
        currentCompany: companyContext.currentCompany,
        context: normalized.context,
        selectionMode,
        surface: "prompt_plane_selection",
        dispatchRuntime,
      });
    },
    async prepareContinuationV2(envelope, ctx = {}) {
      const validated = validateContinuationEnvelope(envelope);
      if (!validated.ok)
        return {
          ok: false,
          status: "blocked",
          blocking_reason: `Invalid vault continuation envelope: ${validated.error}`,
        };
      if (validated.value.status === "blocked")
        return {
          ok: false,
          status: "blocked",
          blocking_reason: "Continuation envelope reported blocked status.",
        };
      if (validated.value.preparation?.inherit_current_company === false)
        return {
          ok: false,
          status: "blocked",
          blocking_reason: "Continuation cannot disable current-company inheritance.",
        };
      const companyContext = resolvePromptPlaneCompanyContext(runtime, ctx);
      if (!companyContext.ok)
        return { ok: false, status: "blocked", blocking_reason: companyContext.error };
      const query =
        validated.value.resolution.kind === "exact_template"
          ? validated.value.resolution.template_name
          : validated.value.resolution.query;
      const exact = runtime.getTemplateDetailed(query, {
        currentCompany: companyContext.currentCompany,
        cwd: ctx.cwd,
        requireExplicitCompany: true,
      });
      if (!exact.ok) return { ok: false, status: "blocked", blocking_reason: exact.error };
      let selected = exact.value;
      let selectionMode = "exact";
      if (!selected && validated.value.resolution.kind === "picker_query") {
        const search = runtime.searchTemplatesDetailed(
          query,
          {
            currentCompany: companyContext.currentCompany,
            cwd: ctx.cwd,
            requireExplicitCompany: true,
          },
          { includeContent: true },
        );
        if (!search.ok) return { ok: false, status: "blocked", blocking_reason: search.error };
        if (search.value.length !== 1)
          return {
            ok: false,
            status: search.value.length > 1 ? "ambiguous" : "blocked",
            blocking_reason:
              search.value.length > 1
                ? `Multiple visible templates matched "${query}".`
                : `No visible template matched "${query}".`,
          };
        selected = search.value[0];
        selectionMode = "picker-fallback";
      }
      if (!selected)
        return {
          ok: false,
          status: "blocked",
          blocking_reason: `No visible template matched "${query}".`,
        };
      return prepareCandidateV2(selected, {
        currentCompany: companyContext.currentCompany,
        context: validated.value.preparation?.context ?? "",
        args: validated.value.preparation?.args ?? [],
        selectionMode,
        surface: "prompt_plane_continuation",
        dispatchRuntime,
      });
    },
    async listVisibleTemplates(request = {}, ctx = {}) {
      const companyContext = resolvePromptPlaneCompanyContext(runtime, ctx);
      if (!companyContext.ok) {
        return listBlocked(companyContext.error);
      }
      const limit = Number.isFinite(request.limit)
        ? Math.max(1, Math.min(MAX_VAULT_QUERY_LIMIT, Math.floor(request.limit)))
        : MAX_VAULT_QUERY_LIMIT;
      const result = runtime.queryTemplatesDetailed(request.filters || {}, limit, false, {
        currentCompany: companyContext.currentCompany,
        cwd: ctx.cwd,
        requireExplicitCompany: true,
      });
      if (!result.ok) {
        return listBlocked(result.error);
      }
      return {
        ok: true,
        status: "ready",
        templates: result.value.map((template) => toVisibleTemplate(template)),
      };
    },
  };
}
