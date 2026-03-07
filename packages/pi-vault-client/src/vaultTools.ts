import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import type { PiExtension, VaultRuntime } from "./vaultTypes.js";
import {
  DEFAULT_VAULT_QUERY_LIMIT,
  MAX_VAULT_QUERY_LIMIT,
  renderTextPreview,
} from "./vaultTypes.js";

export function registerVaultTools(pi: PiExtension, runtime: VaultRuntime): void {
  pi.registerTool({
    name: "vault_query",
    label: "Vault Query",
    description: `Query templates by tags and/or keywords. Returns matching templates.

Use to find relevant prompts by ontology facets, tags, and/or keywords.
Tags use namespace:value format (e.g., action:invert, phase:sensemaking, domain:security).

Examples:
- vault_query({ artifact_kind: ["cognitive"], limit: 3 })
- vault_query({ control_mode: ["router"], formalization_level: ["structured"] })
- vault_query({ tags: ["phase:validation"], keywords: ["security"], limit: 5, include_content: true })`,
    parameters: Type.Object({
      artifact_kind: Type.Optional(Type.Array(Type.String())),
      control_mode: Type.Optional(Type.Array(Type.String())),
      formalization_level: Type.Optional(Type.Array(Type.String())),
      tags: Type.Optional(Type.Array(Type.String())),
      keywords: Type.Optional(Type.Array(Type.String())),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 5)" })),
      include_content: Type.Optional(
        Type.Boolean({ description: "Include full content (default: false)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const artifactKinds = ((params.artifact_kind as string[]) || [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
      const controlModes = ((params.control_mode as string[]) || [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
      const formalizationLevels = ((params.formalization_level as string[]) || [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
      const tags = ((params.tags as string[]) || [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
      const keywords = ((params.keywords as string[]) || [])
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
      const requestedLimit = params.limit as number;
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(MAX_VAULT_QUERY_LIMIT, Math.max(1, Math.floor(requestedLimit)))
        : DEFAULT_VAULT_QUERY_LIMIT;
      const includeContent = Boolean(params.include_content);
      const templates = runtime.queryTemplates(
        tags,
        keywords,
        limit,
        includeContent,
        artifactKinds,
        controlModes,
        formalizationLevels,
      );
      const queryError = runtime.getVaultQueryError();

      if (queryError) {
        return {
          content: [{ type: "text", text: `Vault query failed: ${queryError}` }],
          details: {
            count: 0,
            artifactKinds,
            controlModes,
            formalizationLevels,
            tags,
            keywords,
            includeContent,
            error: queryError,
          },
        };
      }
      if (templates.length === 0) {
        return {
          content: [{ type: "text", text: "No templates found matching criteria." }],
          details: {
            count: 0,
            artifactKinds,
            controlModes,
            formalizationLevels,
            tags,
            keywords,
            includeContent,
          },
        };
      }

      let output = `# Vault Query Results (${templates.length})\n\n`;
      for (const t of templates) {
        output += `## ${t.name}\nFacets: ${runtime.facetLabel(t)}\n`;
        if (t.tags.length > 0) output += `Tags: ${t.tags.join(", ")}\n`;
        output += `${t.description}\n`;
        if (includeContent && t.content) output += `\n---\n${t.content}\n`;
        output += "\n";
      }
      return {
        content: [{ type: "text", text: output }],
        details: {
          count: templates.length,
          artifactKinds,
          controlModes,
          formalizationLevels,
          tags,
          keywords,
          includeContent,
        },
      };
    },
    renderCall(args, theme) {
      const parts = [];
      const artifactKinds = (args.artifact_kind as string[]) || [];
      const controlModes = (args.control_mode as string[]) || [];
      const formalizationLevels = (args.formalization_level as string[]) || [];
      const tags = (args.tags as string[]) || [];
      const keywords = (args.keywords as string[]) || [];
      if (artifactKinds.length > 0) parts.push(`kind:[${artifactKinds.slice(0, 2).join(", ")}]`);
      if (controlModes.length > 0) parts.push(`mode:[${controlModes.slice(0, 2).join(", ")}]`);
      if (formalizationLevels.length > 0)
        parts.push(`formal:[${formalizationLevels.slice(0, 2).join(", ")}]`);
      if (tags.length > 0)
        parts.push(`tags:[${tags.slice(0, 2).join(", ")}${tags.length > 2 ? "..." : ""}]`);
      if (keywords.length > 0) parts.push(`kw:[${keywords.slice(0, 2).join(", ")}]`);
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
Example: vault_retrieve({ names: ["inversion", "nexus"], include_content: true })`,
    parameters: Type.Object({
      names: Type.Array(Type.String(), { description: "Template names to retrieve" }),
      include_content: Type.Optional(
        Type.Boolean({ description: "Include full content (default: true)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const names = params.names as string[];
      const includeContent = (params.include_content as boolean) ?? true;
      if (!names || names.length === 0)
        return { content: [{ type: "text", text: "No names provided." }], details: { ok: false } };
      const templates = runtime.retrieveByNames(names, includeContent);
      if (templates.length === 0)
        return {
          content: [{ type: "text", text: `No templates found: ${names.join(", ")}` }],
          details: { ok: false, requested: names },
        };

      let output = `# Retrieved Templates (${templates.length})\n\n`;
      for (const t of templates) {
        output += `## ${t.name}\nFacets: ${runtime.facetLabel(t)}\n`;
        if (t.tags.length > 0) output += `Tags: ${t.tags.join(", ")}\n`;
        output += `${t.description}\n`;
        if (includeContent && t.content) output += `\n---\n${t.content}\n`;
        output += "\n---\n\n";
      }
      const found = templates.map((t) => t.name);
      return {
        content: [{ type: "text", text: output }],
        details: {
          ok: true,
          found,
          missing: names.filter((n) => !found.includes(n)),
          includeContent,
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
          ? `Retrieved ${String(text.text).split("##").length - 1} templates`
          : "",
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "vault_vocabulary",
    label: "Vault Vocabulary",
    description: `List all existing tags grouped by namespace.

Use to discover available ontology facet values and tag vocabulary before inserting templates.
Facets: artifact_kind, control_mode, formalization_level.
Tag namespaces commonly include: action, phase, formalization, domain, scope.

Example: vault_vocabulary()`,
    parameters: Type.Object({}),
    async execute() {
      const vocab = runtime.getVocabulary();
      if (Object.keys(vocab).length === 0)
        return {
          content: [
            { type: "text", text: "No tags found in vault. Templates need to be tagged first." },
          ],
          details: { empty: true },
        };
      let output = "# Vault Tag Vocabulary\n\n";
      for (const [ns, values] of Object.entries(vocab).sort()) {
        output += `## ${ns}:\n`;
        for (const v of values)
          output +=
            ns === "artifact_kind" || ns === "control_mode" || ns === "formalization_level"
              ? `- ${v}\n`
              : `- ${ns}:${v}\n`;
        output += "\n";
      }
      const totalCount = Object.values(vocab).reduce((sum, arr) => sum + arr.length, 0);
      return {
        content: [{ type: "text", text: output }],
        details: { namespaces: Object.keys(vocab), totalTags: totalCount },
      };
    },
    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("vault_vocabulary")), 0, 0);
    },
    renderResult(result) {
      const details = result.details as { totalTags?: number } | undefined;
      return new Text(`${details?.totalTags || 0} tags`, 0, 0);
    },
  });

  pi.registerTool({
    name: "vault_insert",
    label: "Vault Insert",
    description: `Insert a new template using the Prompt Vault v2 ontology facets.

Validates artifact_kind/control_mode/formalization_level against existing vocabulary.
If new tags are detected, returns confirmation request with suggestions.
Set confirmNewTags: true to proceed with new tags.

Example:
- vault_insert({ name: "my-tool", content: "...", description: "...", artifact_kind: "procedure", control_mode: "router", formalization_level: "structured", tags: ["action:invert", "phase:hypothesis"] })
- If new tags: vault_insert({ ..., confirm_new_tags: true })`,
    parameters: Type.Object({
      name: Type.String({ description: "Template name (unique identifier)" }),
      content: Type.String({ description: "Template content (markdown)" }),
      description: Type.Optional(Type.String({ description: "Brief description" })),
      artifact_kind: Type.String({ description: "Ontology facet: artifact kind" }),
      control_mode: Type.String({ description: "Ontology facet: control mode" }),
      formalization_level: Type.String({ description: "Ontology facet: formalization level" }),
      tags: Type.Optional(Type.Array(Type.String())),
      confirm_new_tags: Type.Optional(
        Type.Boolean({ description: "Confirm new tags (default: false)" }),
      ),
    }),
    async execute(_toolCallId, params) {
      const name = params.name as string;
      const content = params.content as string;
      if (!name || !content)
        return {
          content: [{ type: "text", text: "name and content are required." }],
          details: { ok: false },
        };
      const description = (params.description as string) || "";
      const artifactKind = params.artifact_kind as string;
      const controlMode = params.control_mode as string;
      const formalizationLevel = params.formalization_level as string;
      const tags = (params.tags as string[]) || [];
      const confirmNewTags = (params.confirm_new_tags as boolean) || false;
      const result = runtime.insertTemplate(
        name,
        content,
        description,
        tags,
        artifactKind,
        controlMode,
        formalizationLevel,
        confirmNewTags,
      );
      if (result.status === "confirm") {
        let output = "# New Tags Detected\n\nThe following tags are not in the vocabulary:\n";
        for (const t of result.newTags || []) output += `- ${t}\n`;
        output += `\n## Existing Vocabulary\n\n`;
        for (const [ns, values] of Object.entries(result.existingVocab || {}))
          output += `**${ns}:** ${values.join(", ")}\n`;
        output += `\nSet confirm_new_tags: true to proceed with these new tags.`;
        return {
          content: [{ type: "text", text: output }],
          details: {
            status: "confirm",
            newTags: result.newTags,
            existingVocab: result.existingVocab,
          },
        };
      }
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
          tags,
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
      const details = result.details as { ok?: boolean; status?: string } | undefined;
      const status = details?.status || (details?.ok ? "ok" : "error");
      return new Text(status, 0, 0);
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
