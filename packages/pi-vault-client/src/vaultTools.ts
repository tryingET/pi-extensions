import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type {
  PiExtension,
  RouterControlledVocabulary,
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

export function registerVaultTools(pi: PiExtension, runtime: VaultRuntime): void {
  pi.registerTool({
    name: "vault_query",
    label: "Vault Query",
    description: `Query templates by ontology facets, governance fields, and controlled vocabulary.

Use to find prompts visible to the current company context.
Visibility is applied implicitly from runtime context unless visibility_company is explicitly provided.

Examples:
- vault_query({ artifact_kind: ["cognitive"], limit: 3 })
- vault_query({ control_mode: ["router"], formalization_level: ["structured"] })
- vault_query({ owner_company: ["core"], controlled_vocabulary: { routing_context: ["review_followup"] } })`,
    parameters: Type.Object({
      artifact_kind: Type.Optional(Type.Array(Type.String())),
      control_mode: Type.Optional(Type.Array(Type.String())),
      formalization_level: Type.Optional(Type.Array(Type.String())),
      owner_company: Type.Optional(Type.Array(Type.String())),
      visibility_company: Type.Optional(
        Type.String({ description: "Override visible company context when explicitly needed" }),
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
      limit: Type.Optional(Type.Number({ description: "Max results (default: 5)" })),
      include_content: Type.Optional(
        Type.Boolean({ description: "Include full content (default: false)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const filters: VaultQueryFilters = {
        artifact_kind: normalizeStringArray(params.artifact_kind),
        control_mode: normalizeStringArray(params.control_mode),
        formalization_level: normalizeStringArray(params.formalization_level),
        owner_company: normalizeStringArray(params.owner_company),
        visibility_company:
          typeof params.visibility_company === "string" && params.visibility_company.trim()
            ? params.visibility_company.trim()
            : undefined,
        controlled_vocabulary: normalizeControlledVocabulary(params.controlled_vocabulary),
      };
      const requestedLimit = params.limit as number;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(MAX_VAULT_QUERY_LIMIT, Math.max(1, Math.floor(requestedLimit)))
        : DEFAULT_VAULT_QUERY_LIMIT;
      const includeContent = Boolean(params.include_content);
      const templates = runtime.queryTemplates(filters, limit, includeContent);
      const queryError = runtime.getVaultQueryError();

      if (queryError) {
        return {
          content: [{ type: "text", text: `Vault query failed: ${queryError}` }],
          details: {
            count: 0,
            filters,
            includeContent,
            error: queryError,
            currentCompany: runtime.getCurrentCompany(),
          },
        };
      }
      if (templates.length === 0) {
        return {
          content: [{ type: "text", text: "No templates found matching criteria." }],
          details: {
            count: 0,
            filters,
            includeContent,
            currentCompany: runtime.getCurrentCompany(),
          },
        };
      }

      let output = `# Vault Query Results (${templates.length})\n\n`;
      output += `- current_company: ${filters.visibility_company || runtime.getCurrentCompany()}\n\n`;
      output += templates
        .map((template) => runtime.formatTemplateDetails(template, includeContent))
        .join("\n\n---\n\n");
      return {
        content: [{ type: "text", text: output }],
        details: {
          count: templates.length,
          filters,
          includeContent,
          currentCompany: runtime.getCurrentCompany(),
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
      const controlledVocabulary = (args.controlled_vocabulary as Record<string, string[]>) || {};
      if (artifactKinds.length > 0) parts.push(`kind:[${artifactKinds.slice(0, 2).join(", ")}]`);
      if (controlModes.length > 0) parts.push(`mode:[${controlModes.slice(0, 2).join(", ")}]`);
      if (formalizationLevels.length > 0)
        parts.push(`formal:[${formalizationLevels.slice(0, 2).join(", ")}]`);
      if (ownerCompanies.length > 0) parts.push(`owner:[${ownerCompanies.slice(0, 2).join(", ")}]`);
      if (visibilityCompany) parts.push(`visible:${visibilityCompany}`);
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
    async execute(_toolCallId, params) {
      const names = normalizeStringArray(params.names);
      const includeContent = (params.include_content as boolean) ?? true;
      if (names.length === 0)
        return { content: [{ type: "text", text: "No names provided." }], details: { ok: false } };
      const templates = runtime.retrieveByNames(names, includeContent);
      if (templates.length === 0)
        return {
          content: [{ type: "text", text: `No templates found: ${names.join(", ")}` }],
          details: { ok: false, requested: names, currentCompany: runtime.getCurrentCompany() },
        };

      const found = templates.map((t) => t.name);
      const output = [
        `# Retrieved Templates (${templates.length})`,
        "",
        `- current_company: ${runtime.getCurrentCompany()}`,
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
          currentCompany: runtime.getCurrentCompany(),
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
    description: `Insert a new template using Prompt Vault schema v7 ontology, governance, and controlled vocabulary.

Validates artifact_kind/control_mode/formalization_level against the ontology contract.
Validates owner_company/visibility_companies against the governance contract.
Requires controlled_vocabulary for routers.

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
    async execute(_toolCallId, params) {
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
    name: "vault_rate",
    label: "Vault Rate",
    description: `Rate a template after use for A/B tracking and improvement.

Use to provide feedback on template effectiveness.
Rating: 1-5 (1=poor, 5=excellent)

Example: vault_rate({ template_name: "inversion", rating: 4, success: true, notes: "Found root cause quickly" })`,
    parameters: Type.Object({
      template_name: Type.String({ description: "Template name that was used" }),
      variant: Type.Optional(
        Type.String({ description: "Variant identifier (default: 'default')" }),
      ),
      rating: Type.Number({ description: "Rating 1-5" }),
      success: Type.Boolean({ description: "Was the template effective?" }),
      notes: Type.Optional(Type.String({ description: "Optional feedback notes" })),
    }),
    async execute(_toolCallId, params) {
      const templateName = params.template_name as string;
      const rating = params.rating as number;
      if (!templateName)
        return {
          content: [{ type: "text", text: "template_name is required." }],
          details: { ok: false },
        };
      if (rating < 1 || rating > 5)
        return {
          content: [{ type: "text", text: "rating must be between 1 and 5." }],
          details: { ok: false },
        };
      const result = runtime.rateTemplate(
        templateName,
        (params.variant as string) || "default",
        rating,
        params.success as boolean,
        (params.notes as string) || "",
      );
      return {
        content: [{ type: "text", text: result.message }],
        details: { ok: result.ok, templateName, rating, success: params.success as boolean },
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("vault_rate ")) +
          theme.fg(
            "accent",
            `${(args.template_name as string) || "?"} (${(args.rating as number) || 0}/5)`,
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
