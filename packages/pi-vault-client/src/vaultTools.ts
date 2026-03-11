import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type {
  PiExtension,
  RouterControlledVocabulary,
  TemplateUpdatePatch,
  VaultExecutionContext,
  VaultMutationContext,
  VaultQueryFilters,
  VaultRuntime,
} from "./vaultTypes.js";
import {
  DEFAULT_VAULT_QUERY_LIMIT,
  MAX_VAULT_QUERY_LIMIT,
  renderTextPreview,
} from "./vaultTypes.js";

function normalizeStringArray(value: unknown): string[] {
  return ((value as string[]) || [])
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeControlledVocabulary(value: unknown): VaultQueryFilters["controlled_vocabulary"] {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const normalized: NonNullable<VaultQueryFilters["controlled_vocabulary"]> = {};

  for (const key of [
    "routing_context",
    "activity_phase",
    "input_artifact",
    "transition_target_type",
    "selection_principles",
    "output_commitment",
  ] as const) {
    const values = normalizeStringArray(raw[key]);
    if (values.length > 0) normalized[key] = values;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function hasOwn(value: object, key: string): boolean {
  return Object.hasOwn(value, key);
}

function normalizeControlledVocabularyPatch(
  value: unknown,
): TemplateUpdatePatch["controlled_vocabulary"] {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const normalized: RouterControlledVocabulary = {};
  let hasAny = false;

  for (const key of [
    "routing_context",
    "activity_phase",
    "input_artifact",
    "transition_target_type",
    "output_commitment",
  ] as const) {
    if (!hasOwn(raw, key)) continue;
    normalized[key] = String(raw[key] ?? "").trim();
    hasAny = true;
  }

  if (hasOwn(raw, "selection_principles")) {
    normalized.selection_principles = Array.isArray(raw.selection_principles)
      ? raw.selection_principles.map((value) => String(value).trim()).filter(Boolean)
      : [];
    hasAny = true;
  }

  return hasAny ? normalized : undefined;
}

function buildTemplateUpdatePatch(params: Record<string, unknown>): TemplateUpdatePatch {
  const patch: TemplateUpdatePatch = {};

  if (hasOwn(params, "content")) patch.content = String(params.content ?? "");
  if (hasOwn(params, "description")) patch.description = String(params.description ?? "");
  if (hasOwn(params, "artifact_kind"))
    patch.artifact_kind = String(params.artifact_kind ?? "").trim();
  if (hasOwn(params, "control_mode")) patch.control_mode = String(params.control_mode ?? "").trim();
  if (hasOwn(params, "formalization_level")) {
    patch.formalization_level = String(params.formalization_level ?? "").trim();
  }
  if (hasOwn(params, "owner_company"))
    patch.owner_company = String(params.owner_company ?? "").trim();
  if (hasOwn(params, "visibility_companies")) {
    patch.visibility_companies = Array.isArray(params.visibility_companies)
      ? params.visibility_companies.map((value) => String(value).trim()).filter(Boolean)
      : [];
  }
  const controlledVocabularyPatch = normalizeControlledVocabularyPatch(
    params.controlled_vocabulary,
  );
  if (controlledVocabularyPatch) patch.controlled_vocabulary = controlledVocabularyPatch;

  return patch;
}

function normalizeToolCwd(ctx: unknown): string | undefined {
  const cwd = (ctx as { cwd?: unknown } | undefined)?.cwd;
  return typeof cwd === "string" && cwd.trim() ? cwd.trim() : undefined;
}

const TOOL_READ_CONTEXT_ERROR =
  "Explicit company context is required for visibility-sensitive vault reads on the tool surface. Set PI_COMPANY or invoke the tool from a company-scoped cwd.";

function resolveToolExecutionContext(
  runtime: VaultRuntime,
  ctx: unknown,
): VaultExecutionContext & { currentCompany: string; companySource: string } {
  const cwd = normalizeToolCwd(ctx);
  const companyContext = runtime.resolveCurrentCompanyContext(cwd);
  return {
    ...(cwd ? { cwd } : {}),
    currentCompany: companyContext.company,
    companySource: companyContext.source,
  };
}

function resolveStrictToolReadExecutionContext(
  runtime: VaultRuntime,
  ctx: unknown,
):
  | { ok: true; value: VaultExecutionContext & { currentCompany: string; companySource: string } }
  | { ok: false; error: string } {
  const executionContext = resolveToolExecutionContext(runtime, ctx);
  if (executionContext.companySource === "contract-default") {
    return { ok: false, error: TOOL_READ_CONTEXT_ERROR };
  }
  return { ok: true, value: executionContext };
}

function buildToolMutationContext(ctx: unknown): VaultMutationContext {
  const cwd = normalizeToolCwd(ctx);
  return {
    ...(cwd ? { cwd } : {}),
    allowAmbientCwdFallback: false,
  };
}

function formatSchemaDiagnosticsReport(
  runtime: VaultRuntime,
  currentCompany: string,
  currentCompanySource: string,
): string {
  const report = runtime.checkSchemaCompatibilityDetailed();
  return [
    "# Vault Schema Diagnostics",
    "",
    `- schema_required: ${report.expectedVersion}`,
    `- schema_actual: ${report.actualVersion ?? "unknown"}`,
    `- schema_status: ${report.ok ? "ok" : "mismatch"}`,
    `- missing_prompt_template_columns: ${report.missingPromptTemplateColumns.join(", ") || "none"}`,
    `- missing_execution_columns: ${report.missingExecutionColumns.join(", ") || "none"}`,
    `- missing_feedback_columns: ${report.missingFeedbackColumns.join(", ") || "none"}`,
    `- current_company: ${currentCompany}`,
    `- current_company_source: ${currentCompanySource}`,
  ].join("\n");
}

export function registerVaultDiagnosticsTool(pi: PiExtension, runtime: VaultRuntime): void {
  pi.registerTool({
    name: "vault_schema_diagnostics",
    label: "Vault Schema Diagnostics",
    description: `Inspect Prompt Vault schema compatibility for this client runtime.

Use when /vault or vault tools may be unavailable due to schema drift.
Reports expected vs actual schema version plus missing prompt/execution/feedback columns.`,
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const executionContext = resolveToolExecutionContext(runtime, ctx);
      const output = formatSchemaDiagnosticsReport(
        runtime,
        executionContext.currentCompany,
        executionContext.companySource,
      );
      const report = runtime.checkSchemaCompatibilityDetailed();
      return {
        content: [{ type: "text", text: output }],
        details: {
          ok: report.ok,
          expectedVersion: report.expectedVersion,
          actualVersion: report.actualVersion,
          missingPromptTemplateColumns: report.missingPromptTemplateColumns,
          missingExecutionColumns: report.missingExecutionColumns,
          missingFeedbackColumns: report.missingFeedbackColumns,
          currentCompany: executionContext.currentCompany,
          currentCompanySource: executionContext.companySource,
        },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("vault_schema_diagnostics")), 0, 0);
    },
    renderResult(result) {
      const details = result.details as { ok?: boolean } | undefined;
      return new Text(details?.ok ? "schema ok" : "schema mismatch", 0, 0);
    },
  });
}

export function registerVaultTools(pi: PiExtension, runtime: VaultRuntime): void {
  pi.registerTool({
    name: "vault_query",
    label: "Vault Query",
    description: `Query templates by ontology facets, governance fields, and controlled vocabulary.

Use to find prompts visible to the current company context.
Visibility is applied implicitly from runtime context.
On the tool surface, visibility-sensitive reads fail closed without explicit company context and cross-company visibility overrides are rejected.
By default, query output shows only classification + governed semantics; governance metadata is hidden unless include_governance=true.

Examples:
- vault_query({ formalization_level: ["napkin"] })
- vault_query({ artifact_kind: ["procedure"], formalization_level: ["workflow"] })
- vault_query({ control_mode: ["router"], formalization_level: ["structured"] })
- vault_query({ artifact_kind: ["session"] })
- vault_query({ intent_text: "simplify and make retrieval feel almost alien" })
- vault_query({ controlled_vocabulary: { routing_context: ["review_followup"] }, include_governance: true })`,
    parameters: Type.Object({
      artifact_kind: Type.Optional(Type.Array(Type.String())),
      control_mode: Type.Optional(Type.Array(Type.String())),
      formalization_level: Type.Optional(Type.Array(Type.String())),
      owner_company: Type.Optional(Type.Array(Type.String())),
      visibility_company: Type.Optional(
        Type.String({
          description:
            "Explicitly pin visible company; cross-company overrides are rejected on the tool surface",
        }),
      ),
      intent_text: Type.Optional(
        Type.String({ description: "Rank the candidate set against this intent text" }),
      ),
      controlled_vocabulary: Type.Optional(
        Type.Object({
          routing_context: Type.Optional(Type.Array(Type.String())),
          activity_phase: Type.Optional(Type.Array(Type.String())),
          input_artifact: Type.Optional(Type.Array(Type.String())),
          transition_target_type: Type.Optional(Type.Array(Type.String())),
          selection_principles: Type.Optional(Type.Array(Type.String())),
          output_commitment: Type.Optional(Type.Array(Type.String())),
        }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 20)" })),
      include_content: Type.Optional(
        Type.Boolean({ description: "Include full content (default: false)" }),
      ),
      include_governance: Type.Optional(
        Type.Boolean({
          description: "Include owner/visibility metadata in output (default: false)",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const executionContextResult = resolveStrictToolReadExecutionContext(runtime, ctx);
      if (!executionContextResult.ok) {
        return {
          content: [{ type: "text", text: executionContextResult.error }],
          details: { ok: false, error: executionContextResult.error },
        };
      }
      const executionContext = executionContextResult.value;
      const filters: VaultQueryFilters = {
        artifact_kind: normalizeStringArray(params.artifact_kind),
        control_mode: normalizeStringArray(params.control_mode),
        formalization_level: normalizeStringArray(params.formalization_level),
        owner_company: normalizeStringArray(params.owner_company),
        visibility_company:
          typeof params.visibility_company === "string" && params.visibility_company.trim()
            ? params.visibility_company.trim()
            : undefined,
        intent_text:
          typeof params.intent_text === "string" && params.intent_text.trim()
            ? params.intent_text.trim()
            : undefined,
        controlled_vocabulary: normalizeControlledVocabulary(params.controlled_vocabulary),
      };
      if (
        filters.visibility_company &&
        filters.visibility_company !== executionContext.currentCompany
      ) {
        const error =
          "Cross-company visibility overrides are rejected on the tool surface. Set PI_COMPANY or invoke from the target company-scoped cwd instead.";
        return {
          content: [{ type: "text", text: error }],
          details: {
            ok: false,
            error,
            requestedVisibilityCompany: filters.visibility_company,
            currentCompany: executionContext.currentCompany,
            currentCompanySource: executionContext.companySource,
          },
        };
      }
      const requestedLimit = params.limit as number;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(MAX_VAULT_QUERY_LIMIT, Math.max(1, Math.floor(requestedLimit)))
        : DEFAULT_VAULT_QUERY_LIMIT;
      const includeContent = Boolean(params.include_content);
      const includeGovernance = Boolean(params.include_governance);
      const templatesResult = runtime.queryTemplatesDetailed(
        filters,
        limit,
        includeContent,
        executionContext,
      );

      if (!templatesResult.ok) {
        return {
          content: [{ type: "text", text: `Vault query failed: ${templatesResult.error}` }],
          details: {
            count: 0,
            filters,
            includeContent,
            includeGovernance,
            error: templatesResult.error,
            currentCompany: executionContext.currentCompany,
            currentCompanySource: executionContext.companySource,
          },
        };
      }
      const templates = templatesResult.value;
      if (templates.length === 0) {
        return {
          content: [{ type: "text", text: "No templates found matching criteria." }],
          details: {
            count: 0,
            filters,
            includeContent,
            includeGovernance,
            currentCompany: executionContext.currentCompany,
            currentCompanySource: executionContext.companySource,
          },
        };
      }

      let output = `# Vault Query Results (${templates.length})\n\n`;
      output += templates
        .map((template) =>
          runtime.formatTemplateDetails(template, includeContent, { includeGovernance }),
        )
        .join("\n\n---\n\n");
      return {
        content: [{ type: "text", text: output }],
        details: {
          count: templates.length,
          filters,
          includeContent,
          includeGovernance,
          currentCompany: executionContext.currentCompany,
          currentCompanySource: executionContext.companySource,
        },
      };
    },
    renderCall(args, theme) {
      const parts = [];
      const artifactKinds = (args.artifact_kind as string[]) || [];
      const controlModes = (args.control_mode as string[]) || [];
      const formalizationLevels = (args.formalization_level as string[]) || [];
      const ownerCompanies = (args.owner_company as string[]) || [];
      const visibilityCompany = (args.visibility_company as string) || "";
      const intentText = (args.intent_text as string) || "";
      const controlledVocabulary = (args.controlled_vocabulary as Record<string, string[]>) || {};
      if (artifactKinds.length > 0) parts.push(`kind:[${artifactKinds.slice(0, 2).join(", ")}]`);
      if (controlModes.length > 0) parts.push(`mode:[${controlModes.slice(0, 2).join(", ")}]`);
      if (formalizationLevels.length > 0)
        parts.push(`formal:[${formalizationLevels.slice(0, 2).join(", ")}]`);
      if (ownerCompanies.length > 0) parts.push(`owner:[${ownerCompanies.slice(0, 2).join(", ")}]`);
      if (visibilityCompany) parts.push(`visible:${visibilityCompany}`);
      if (intentText)
        parts.push(`intent:${intentText.slice(0, 24)}${intentText.length > 24 ? "..." : ""}`);
      const firstCv = Object.entries(controlledVocabulary).find(
        ([, values]) => (values || []).length > 0,
      );
      if (firstCv) parts.push(`cv:${firstCv[0]}=[${firstCv[1].slice(0, 2).join(", ")}]`);
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_query ")) + theme.fg("accent", parts.join(" ")),
        0,
        0,
      );
    },
    renderResult: renderTextPreview,
  });

  pi.registerTool({
    name: "vault_retrieve",
    label: "Vault Retrieve",
    description: `Retrieve templates by exact name(s). Returns full content by default.

Use when you know the exact template names and need their content.
Retrieval is filtered by current visibility context.
Example: vault_retrieve({ names: ["inversion", "nexus"], include_content: true })`,
    parameters: Type.Object({
      names: Type.Array(Type.String(), { description: "Template names to retrieve" }),
      include_content: Type.Optional(
        Type.Boolean({ description: "Include full content (default: true)" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const executionContextResult = resolveStrictToolReadExecutionContext(runtime, ctx);
      if (!executionContextResult.ok)
        return {
          content: [{ type: "text", text: executionContextResult.error }],
          details: { ok: false, error: executionContextResult.error },
        };
      const executionContext = executionContextResult.value;
      const names = normalizeStringArray(params.names);
      const includeContent = (params.include_content as boolean) ?? true;
      if (names.length === 0)
        return { content: [{ type: "text", text: "No names provided." }], details: { ok: false } };
      const templatesResult = runtime.retrieveByNamesDetailed(
        names,
        includeContent,
        executionContext,
      );
      if (!templatesResult.ok)
        return {
          content: [{ type: "text", text: `Vault retrieve failed: ${templatesResult.error}` }],
          details: {
            ok: false,
            error: templatesResult.error,
            requested: names,
            currentCompany: executionContext.currentCompany,
            currentCompanySource: executionContext.companySource,
          },
        };
      const templates = templatesResult.value;
      if (templates.length === 0)
        return {
          content: [{ type: "text", text: `No templates found: ${names.join(", ")}` }],
          details: {
            ok: false,
            requested: names,
            currentCompany: executionContext.currentCompany,
            currentCompanySource: executionContext.companySource,
          },
        };

      const found = templates.map((t) => t.name);
      const output = [
        `# Retrieved Templates (${templates.length})`,
        "",
        `- current_company: ${executionContext.currentCompany}`,
        "",
        ...templates
          .map((t) => runtime.formatTemplateDetails(t, includeContent))
          .join("\n\n---\n\n")
          .split("\n"),
      ].join("\n");
      return {
        content: [{ type: "text", text: output }],
        details: {
          ok: true,
          found,
          missing: names.filter((n) => !found.includes(n)),
          includeContent,
          currentCompany: executionContext.currentCompany,
          currentCompanySource: executionContext.companySource,
        },
      };
    },
    renderCall(args, theme) {
      const names = (args.names as string[]) || [];
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_retrieve ")) +
          theme.fg("accent", names.slice(0, 3).join(", ") + (names.length > 3 ? "..." : "")),
        0,
        0,
      );
    },
    renderResult(result) {
      const text = result.content[0];
      return new Text(
        text?.type === "text"
          ? `Retrieved ${String(text.text).split("## ").length - 1} templates`
          : "",
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "vault_vocabulary",
    label: "Vault Vocabulary",
    description: `List canonical ontology, controlled-vocabulary, and governance values.

Use to inspect the governed contract surfaces before querying or inserting templates.
This output reflects Prompt Vault contracts rather than ad-hoc row-derived tags.

Example: vault_vocabulary()`,
    parameters: Type.Object({}),
    async execute() {
      const vocab = runtime.getVocabulary();
      let output = "# Vault Governed Vocabulary\n\n";
      for (const [namespace, values] of Object.entries(vocab).sort()) {
        output += `## ${namespace}\n`;
        for (const value of values) output += `- ${value}\n`;
        output += "\n";
      }
      const totalCount = Object.values(vocab).reduce((sum, arr) => sum + arr.length, 0);
      return {
        content: [{ type: "text", text: output }],
        details: { namespaces: Object.keys(vocab), totalValues: totalCount },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("vault_vocabulary")), 0, 0);
    },
    renderResult(result) {
      const details = result.details as { totalValues?: number } | undefined;
      return new Text(`${details?.totalValues || 0} values`, 0, 0);
    },
  });

  pi.registerTool({
    name: "vault_insert",
    label: "Vault Insert",
    description: `Insert a new template using Prompt Vault schema v9 ontology, governance, and controlled vocabulary.

Validates artifact_kind/control_mode/formalization_level against the ontology contract.
Validates owner_company/visibility_companies against the governance contract.
Requires controlled_vocabulary for routers.
Mutation fails closed unless the active mutation company is explicit, and owner_company must match it.
Fails closed when the exact template name already exists; use vault_update for explicit in-place edits.

Example:
- vault_insert({ name: "my-router", content: "...", artifact_kind: "procedure", control_mode: "router", formalization_level: "structured", owner_company: "core", visibility_companies: ["core", "software"], controlled_vocabulary: { routing_context: "review_followup", activity_phase: "post_review", input_artifact: "review_findings", transition_target_type: "framework_mode", selection_principles: ["constraint_preserving"], output_commitment: "exact_next_prompt" } })`,
    parameters: Type.Object({
      name: Type.String({ description: "Template name (unique identifier)" }),
      content: Type.String({ description: "Template content (markdown)" }),
      description: Type.Optional(Type.String({ description: "Brief description" })),
      artifact_kind: Type.String({ description: "Ontology facet: artifact kind" }),
      control_mode: Type.String({ description: "Ontology facet: control mode" }),
      formalization_level: Type.String({ description: "Ontology facet: formalization level" }),
      owner_company: Type.String({ description: "Governance owner company" }),
      visibility_companies: Type.Array(Type.String(), {
        description: "Governance visibility boundary",
      }),
      controlled_vocabulary: Type.Optional(
        Type.Object({
          routing_context: Type.Optional(Type.String()),
          activity_phase: Type.Optional(Type.String()),
          input_artifact: Type.Optional(Type.String()),
          transition_target_type: Type.Optional(Type.String()),
          selection_principles: Type.Optional(Type.Array(Type.String())),
          output_commitment: Type.Optional(Type.String()),
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const mutationContext = buildToolMutationContext(ctx);
      const name = String(params.name || "").trim();
      const content = String(params.content || "");
      if (!name || !content)
        return {
          content: [{ type: "text", text: "name and content are required." }],
          details: { ok: false },
        };
      const description = String(params.description || "");
      const artifactKind = String(params.artifact_kind || "").trim();
      const controlMode = String(params.control_mode || "").trim();
      const formalizationLevel = String(params.formalization_level || "").trim();
      const ownerCompany = String(params.owner_company || "").trim();
      const visibilityCompanies = normalizeStringArray(params.visibility_companies);
      const controlledVocabularyRaw = params.controlled_vocabulary as
        | RouterControlledVocabulary
        | undefined;
      const controlledVocabulary = controlledVocabularyRaw
        ? {
            routing_context: controlledVocabularyRaw.routing_context?.trim(),
            activity_phase: controlledVocabularyRaw.activity_phase?.trim(),
            input_artifact: controlledVocabularyRaw.input_artifact?.trim(),
            transition_target_type: controlledVocabularyRaw.transition_target_type?.trim(),
            selection_principles: normalizeStringArray(
              controlledVocabularyRaw.selection_principles,
            ),
            output_commitment: controlledVocabularyRaw.output_commitment?.trim(),
          }
        : null;
      const result = runtime.insertTemplate(
        name,
        content,
        description,
        artifactKind,
        controlMode,
        formalizationLevel,
        ownerCompany,
        visibilityCompanies,
        controlledVocabulary,
        mutationContext,
      );
      if (result.status === "error")
        return {
          content: [{ type: "text", text: `Error: ${result.message}` }],
          details: { ok: false, error: result.message },
        };
      return {
        content: [{ type: "text", text: result.message }],
        details: {
          ok: true,
          templateId: result.templateId,
          artifactKind,
          controlMode,
          formalizationLevel,
          ownerCompany,
          visibilityCompanies,
        },
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_insert ")) +
          theme.fg("accent", (args.name as string) || "?"),
        0,
        0,
      );
    },
    renderResult(result) {
      const details = result.details as { ok?: boolean } | undefined;
      return new Text(details?.ok ? "ok" : "error", 0, 0);
    },
  });

  pi.registerTool({
    name: "vault_update",
    label: "Vault Update",
    description: `Update an existing template in place by exact name using Prompt Vault schema v9 ontology, governance, and controlled vocabulary rules.

Loads the current template row first, merges only the provided patch fields, and revalidates the merged result against the same governed contracts used by vault_insert.
Fails clearly if the target template does not exist, if no update fields were provided, if the active mutation company does not own the row, or if the row changed during the update.
This first slice avoids fuzzy matching, bulk mutation, rename behavior, and owner reassignment.

Example:
- vault_update({ name: "my-router", description: "Refined router guidance", controlled_vocabulary: { selection_principles: ["constraint_preserving", "minimal_change"] } })`,
    parameters: Type.Object({
      name: Type.String({ description: "Template name to update (exact match)" }),
      content: Type.Optional(Type.String({ description: "Updated template content (markdown)" })),
      description: Type.Optional(Type.String({ description: "Updated brief description" })),
      artifact_kind: Type.Optional(
        Type.String({ description: "Updated ontology facet: artifact kind" }),
      ),
      control_mode: Type.Optional(
        Type.String({ description: "Updated ontology facet: control mode" }),
      ),
      formalization_level: Type.Optional(
        Type.String({ description: "Updated ontology facet: formalization level" }),
      ),
      owner_company: Type.Optional(
        Type.String({ description: "Updated governance owner company" }),
      ),
      visibility_companies: Type.Optional(
        Type.Array(Type.String(), { description: "Updated governance visibility boundary" }),
      ),
      controlled_vocabulary: Type.Optional(
        Type.Object({
          routing_context: Type.Optional(Type.String()),
          activity_phase: Type.Optional(Type.String()),
          input_artifact: Type.Optional(Type.String()),
          transition_target_type: Type.Optional(Type.String()),
          selection_principles: Type.Optional(Type.Array(Type.String())),
          output_commitment: Type.Optional(Type.String()),
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const mutationContext = buildToolMutationContext(ctx);
      const name = String(params.name || "").trim();
      if (!name)
        return {
          content: [{ type: "text", text: "name is required." }],
          details: { ok: false },
        };

      const patch = buildTemplateUpdatePatch(params as Record<string, unknown>);
      const result = runtime.updateTemplate(name, patch, mutationContext);
      if (result.status === "error")
        return {
          content: [{ type: "text", text: `Error: ${result.message}` }],
          details: { ok: false, error: result.message },
        };
      return {
        content: [{ type: "text", text: result.message }],
        details: {
          ok: true,
          templateId: result.templateId,
          updatedFields: Object.keys(patch).sort(),
        },
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_update ")) +
          theme.fg("accent", (args.name as string) || "?"),
        0,
        0,
      );
    },
    renderResult(result) {
      const details = result.details as { ok?: boolean } | undefined;
      return new Text(details?.ok ? "ok" : "error", 0, 0);
    },
  });

  pi.registerTool({
    name: "vault_executions",
    label: "Vault Executions",
    description: `List recent visible template executions with exact execution_id and entity_version.

Use before vault_rate so feedback can bind to a specific execution instead of a template name.
Example: vault_executions({ template_name: "nexus", limit: 10 })`,
    parameters: Type.Object({
      template_name: Type.Optional(
        Type.String({ description: "Optional exact template name filter" }),
      ),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 20)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const executionContextResult = resolveStrictToolReadExecutionContext(runtime, ctx);
      if (!executionContextResult.ok) {
        return {
          content: [{ type: "text", text: executionContextResult.error }],
          details: { ok: false, error: executionContextResult.error },
        };
      }
      const executionContext = executionContextResult.value;
      const templateName =
        typeof params.template_name === "string" && params.template_name.trim()
          ? params.template_name.trim()
          : "";
      const requestedLimit = params.limit as number;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(MAX_VAULT_QUERY_LIMIT, Math.max(1, Math.floor(requestedLimit)))
        : DEFAULT_VAULT_QUERY_LIMIT;
      const templateFilter = templateName
        ? ` AND pt.name = '${runtime.escapeSql(templateName)}'`
        : "";
      const result = runtime.queryVaultJsonDetailed(`
        SELECT
          e.id AS execution_id,
          pt.name AS template_name,
          e.entity_version,
          pt.owner_company,
          pt.artifact_kind,
          pt.control_mode,
          pt.formalization_level,
          e.model,
          e.success,
          e.created_at
        FROM executions e
        INNER JOIN prompt_templates pt ON pt.id = e.entity_id
        WHERE e.entity_type = 'template'
          AND pt.status = 'active'
          AND ${runtime.buildVisibilityPredicate(executionContext.currentCompany)}
          ${templateFilter}
        ORDER BY e.created_at DESC
        LIMIT ${limit}
      `);
      if (!result.ok) {
        return {
          content: [{ type: "text", text: `Vault executions query failed: ${result.error}` }],
          details: {
            ok: false,
            error: result.error,
            currentCompany: executionContext.currentCompany,
            currentCompanySource: executionContext.companySource,
          },
        };
      }

      const rows = result.value.rows || [];
      if (rows.length === 0) {
        return {
          content: [{ type: "text", text: "No executions found matching criteria." }],
          details: {
            ok: false,
            currentCompany: executionContext.currentCompany,
            currentCompanySource: executionContext.companySource,
          },
        };
      }

      let output =
        "# Vault Executions\n\n| Execution ID | Template | Version | Owner | Facets | Model | Success | Created |\n|---|---|---:|---|---|---|---|---|\n";
      for (const row of rows) {
        output += `| ${row.execution_id || ""} | ${row.template_name || ""} | ${row.entity_version || ""} | ${row.owner_company || ""} | ${row.artifact_kind || ""}/${row.control_mode || ""}/${row.formalization_level || ""} | ${row.model || ""} | ${row.success ? "true" : "false"} | ${String(row.created_at || "").slice(0, 19)} |\n`;
      }

      return {
        content: [{ type: "text", text: output }],
        details: {
          ok: true,
          count: rows.length,
          templateName: templateName || undefined,
          currentCompany: executionContext.currentCompany,
          currentCompanySource: executionContext.companySource,
        },
      };
    },
    renderCall(args, theme) {
      const templateName = (args.template_name as string) || "recent";
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_executions ")) + theme.fg("accent", templateName),
        0,
        0,
      );
    },
    renderResult(result) {
      const details = result.details as { count?: number } | undefined;
      return new Text(`${details?.count || 0} executions`, 0, 0);
    },
  });

  pi.registerTool({
    name: "vault_rate",
    label: "Vault Rate",
    description: `Rate a specific template execution after use.

Use vault_executions first, then pass the exact execution_id so feedback binds to a single run.
Rating: 1-5 (1=poor, 5=excellent)

Example: vault_rate({ execution_id: 42, rating: 4, success: true, notes: "Found root cause quickly" })`,
    parameters: Type.Object({
      execution_id: Type.Number({ description: "Exact execution id to rate" }),
      rating: Type.Number({ description: "Rating 1-5" }),
      success: Type.Boolean({ description: "Was the template effective?" }),
      notes: Type.Optional(Type.String({ description: "Optional feedback notes" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const mutationContext = buildToolMutationContext(ctx);
      const executionId = params.execution_id as number;
      const rating = params.rating as number;
      if (!Number.isFinite(executionId) || executionId < 1)
        return {
          content: [{ type: "text", text: "execution_id must be a positive integer." }],
          details: { ok: false },
        };
      if (rating < 1 || rating > 5)
        return {
          content: [{ type: "text", text: "rating must be between 1 and 5." }],
          details: { ok: false },
        };
      const result = runtime.rateTemplate(
        executionId,
        rating,
        params.success as boolean,
        (params.notes as string) || "",
        mutationContext,
      );
      return {
        content: [{ type: "text", text: result.message }],
        details: { ok: result.ok, executionId, rating, success: params.success as boolean },
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_rate ")) +
          theme.fg(
            "accent",
            `execution:${(args.execution_id as number) || 0} (${(args.rating as number) || 0}/5)`,
          ),
        0,
        0,
      );
    },
    renderResult(result) {
      const details = result.details as { ok?: boolean } | undefined;
      return new Text(details?.ok ? "Recorded" : "Failed", 0, 0);
    },
  });
}
