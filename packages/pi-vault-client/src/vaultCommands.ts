import { runFzfProbe } from "./fuzzySelector.js";
import type { PiExtension, Template, VaultModuleRuntime } from "./vaultTypes.js";

function buildRoutePrompt(
  metaContent: string,
  context: string,
  options: {
    outputHeading: "Output:" | "Output format:";
    reasoningLabel: string;
    includeInvokeStep: boolean;
  },
): string {
  return `${metaContent}

---

## ROUTING REQUEST

Analyze this situation and determine:
1. Which PHASE this is in
2. Which FORMALIZATION level (0-4)
3. Which cognitive tool(s) to apply
${options.includeInvokeStep ? "4. The command to invoke\n" : ""}
Context: ${context}

${options.outputHeading}
${options.outputHeading === "Output format:" ? "```\n" : ""}PHASE: [phase]
LEVEL: [0-4]
TOOLS: [tool1, tool2]
COMMAND: /vault:[tool]
REASONING: [${options.reasoningLabel}]
${options.outputHeading === "Output format:" ? "```\n" : ""}`;
}

function notifyPrepared(
  runtime: VaultModuleRuntime,
  template: {
    name: string;
    artifact_kind: string;
    control_mode: string;
    formalization_level: string;
  },
  contextSuffix: string,
  selectionMessage: string,
  ctx: { hasUI: boolean; ui: { notify: (message: string, level?: string) => void } },
): void {
  if (!ctx.hasUI) return;
  ctx.ui.notify(
    `Prepared: ${template.name} (${runtime.facetLabel(template)})${contextSuffix} — ${selectionMessage}`,
    "info",
  );
}

function formatVaultTemplateRenderError(templateName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Vault template render failed (${templateName}): ${message}`;
}

function formatSchemaMismatchMessage(
  runtime: Pick<VaultModuleRuntime, "checkSchemaCompatibilityDetailed">,
): string {
  const report = runtime.checkSchemaCompatibilityDetailed();
  const parts = [
    `expected=${report.expectedVersion}`,
    `actual=${report.actualVersion ?? "unknown"}`,
  ];
  if (report.missingPromptTemplateColumns.length > 0)
    parts.push(`prompt_templates:[${report.missingPromptTemplateColumns.join(", ")}]`);
  if (report.missingExecutionColumns.length > 0)
    parts.push(`executions:[${report.missingExecutionColumns.join(", ")}]`);
  if (report.missingFeedbackColumns.length > 0)
    parts.push(`feedback:[${report.missingFeedbackColumns.join(", ")}]`);
  return `Vault schema mismatch (${parts.join("; ")}). Use /vault-check or vault_schema_diagnostics.`;
}

function resolvePreparedRoutePrompt(
  runtime: VaultModuleRuntime,
  metaTemplate: Template,
  options: {
    context: string;
    cwd?: string;
    outputHeading: "Output:" | "Output format:";
    reasoningLabel: string;
    includeInvokeStep: boolean;
  },
): { ok: true; prompt: string } | { ok: false; error: string } {
  const prepared = runtime.prepareVaultPrompt(metaTemplate, {
    context: options.context,
    currentCompany: runtime.getCurrentCompany(options.cwd),
    cwd: options.cwd,
    appendContextSection: false,
  });
  if (!prepared.ok) {
    return {
      ok: false,
      error: formatVaultTemplateRenderError(metaTemplate.name, prepared.error),
    };
  }
  return {
    ok: true,
    prompt: buildRoutePrompt(prepared.prepared, options.context, {
      outputHeading: options.outputHeading,
      reasoningLabel: options.reasoningLabel,
      includeInvokeStep: options.includeInvokeStep,
    }),
  };
}

async function resolveVaultTemplateSelection(
  runtime: VaultModuleRuntime,
  ctx: { hasUI: boolean; cwd?: string; ui?: { notify: (message: string, level?: string) => void } },
  query: string,
) {
  const currentCompany = runtime.getCurrentCompany(ctx.cwd);
  const exactMatchResult = query.trim()
    ? runtime.getTemplateDetailed(query.trim(), { currentCompany, cwd: ctx.cwd })
    : { ok: true, value: null, error: null as null };
  if (!exactMatchResult.ok) {
    return {
      template: null,
      modeMessage: "selection mode=exact",
      selectionReason: `lookup-error:${exactMatchResult.error}`,
    } as const;
  }
  const exactMatch = exactMatchResult.value;
  if (exactMatch) {
    return {
      template: exactMatch,
      modeMessage: "selection mode=exact",
      selectionReason: "exact-match",
    } as const;
  }

  const selection = await runtime.pickVaultTemplate(ctx as never, query);
  if (!selection.selected) {
    return {
      template: null,
      modeMessage: runtime.selectionModeMessage(selection),
      selectionReason: selection.reason ?? "no-selection",
    } as const;
  }

  const templateResult = runtime.getTemplateDetailed(selection.selected.id, {
    currentCompany,
    cwd: ctx.cwd,
  });
  return {
    template: templateResult.ok ? templateResult.value : null,
    modeMessage: runtime.selectionModeMessage(selection),
    selectionReason: templateResult.ok
      ? (selection.reason ?? selection.mode)
      : `lookup-error:${templateResult.error}`,
  } as const;
}

export function registerVaultCommands(pi: PiExtension, runtime: VaultModuleRuntime): void {
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };
    const text = event.text.trim();
    const schemaReport = runtime.checkSchemaCompatibilityDetailed();
    const schemaMismatchMessage = schemaReport.ok ? "" : formatSchemaMismatchMessage(runtime);

    if (
      !schemaReport.ok &&
      /^\/(vault(?::|\s|$)|route\b|next-10-expert-suggestions\b)/.test(text)
    ) {
      if (ctx.hasUI) {
        ctx.ui.notify(schemaMismatchMessage, "warning");
        return { action: "handled" };
      }
      return { action: "transform", text: schemaMismatchMessage };
    }

    if (text.startsWith("/next-10-expert-suggestions")) {
      const grounded = runtime.buildGroundedNext10Prompt(text, {
        cwd: ctx.cwd,
        currentCompany: runtime.getCurrentCompany(ctx.cwd),
      });
      if (!grounded.ok) {
        const reason = "reason" in grounded ? grounded.reason : "Grounding unavailable";
        if (ctx.hasUI) {
          ctx.ui.notify(reason, "error");
          ctx.ui.setEditorText(reason);
        }
        return { action: "handled" };
      }
      if (ctx.hasUI)
        ctx.ui.notify("Grounded via Prompt Vault: frameworks pre-resolved and injected", "info");
      return { action: "transform", text: grounded.prompt };
    }

    const vaultSelectionInput = runtime.parseVaultSelectionInput(text);
    if (vaultSelectionInput) {
      const resolved = await resolveVaultTemplateSelection(runtime, ctx, vaultSelectionInput.query);
      if (!resolved.template) {
        if (ctx.hasUI) {
          const reason = resolved.selectionReason ? ` (${resolved.selectionReason})` : "";
          ctx.ui.notify(`No vault template selected${reason}.`, "warning");
          return { action: "handled" };
        }
        return {
          action: "transform",
          text: `Vault selection unavailable: ${resolved.selectionReason ?? "no-selection"}. Check VAULT_DIR/fzf availability.`,
        };
      }

      if (ctx.hasUI) {
        ctx.ui.notify(
          `Loaded: ${resolved.template.name} (${runtime.facetLabel(resolved.template)}) — ${resolved.modeMessage}`,
          "info",
        );
      }
      const prepared = runtime.prepareVaultPrompt(resolved.template, {
        context: vaultSelectionInput.context,
        currentCompany: runtime.getCurrentCompany(ctx.cwd),
      });
      if (!prepared.ok) {
        const message = formatVaultTemplateRenderError(resolved.template.name, prepared.error);
        if (ctx.hasUI) {
          ctx.ui.notify(message, "error");
          return { action: "handled" };
        }
        return { action: "transform", text: message };
      }

      if (resolved.template.id)
        runtime.logExecution(
          resolved.template,
          ctx.model?.id || "unknown",
          vaultSelectionInput.context,
        );
      return {
        action: "transform",
        text: prepared.prepared,
      };
    }

    if (text.startsWith("/vault-search ")) {
      const query = text.slice(14).trim();
      if (!query) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /vault-search <query>", "warning");
        return { action: "handled" };
      }
      const currentCompany = runtime.getCurrentCompany(ctx.cwd);
      const templatesResult = runtime.searchTemplatesDetailed(query, {
        currentCompany,
        cwd: ctx.cwd,
      });
      if (!templatesResult.ok) {
        const message = `Vault search failed: ${templatesResult.error}`;
        if (ctx.hasUI) {
          ctx.ui.notify(message, "error");
          return { action: "handled" };
        }
        return { action: "transform", text: message };
      }
      const templates = templatesResult.value;
      if (templates.length === 0) {
        if (ctx.hasUI) ctx.ui.notify(`No templates found for: ${query}`, "warning");
        return { action: "handled" };
      }
      const output = [
        `# Search Results: "${query}"`,
        "",
        `- current_company: ${currentCompany}`,
        "",
        ...templates
          .map((t) => runtime.formatTemplateDetails(t, false))
          .join("\n\n---\n\n")
          .split("\n"),
      ].join("\n");
      if (ctx.hasUI) await ctx.ui.editor("Search Results", output);
      return { action: "handled" };
    }

    if (text.startsWith("/route ")) {
      const context = text.slice(7).trim();
      const metaResult = runtime.getTemplateDetailed("meta-orchestration", {
        currentCompany: runtime.getCurrentCompany(ctx.cwd),
        cwd: ctx.cwd,
      });
      if (!metaResult.ok) {
        if (ctx.hasUI)
          ctx.ui.notify(`meta-orchestration lookup failed: ${metaResult.error}`, "error");
        return { action: "handled" };
      }
      const meta = metaResult.value;
      if (!meta) {
        if (ctx.hasUI) ctx.ui.notify("meta-orchestration template not found", "error");
        return { action: "handled" };
      }
      const preparedRoutePrompt = resolvePreparedRoutePrompt(runtime, meta, {
        context,
        cwd: ctx.cwd,
        outputHeading: "Output format:",
        reasoningLabel: "why these tools",
        includeInvokeStep: true,
      });
      if (!preparedRoutePrompt.ok) {
        if (ctx.hasUI) {
          ctx.ui.notify(preparedRoutePrompt.error, "error");
          return { action: "handled" };
        }
        return { action: "transform", text: preparedRoutePrompt.error };
      }
      return {
        action: "transform",
        text: preparedRoutePrompt.prompt,
      };
    }

    return { action: "continue" };
  });

  pi.registerCommand("vault", {
    description: "Load an exact visible vault template or open the picker",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const schemaReport = runtime.checkSchemaCompatibilityDetailed();
      if (!schemaReport.ok) return ctx.ui.notify(formatSchemaMismatchMessage(runtime), "warning");
      const parsed = runtime.splitVaultQueryAndContext(args.trim());
      const resolved = await resolveVaultTemplateSelection(runtime, ctx, parsed.query);
      if (!resolved.template)
        return ctx.ui.notify(
          `No vault template selected${resolved.selectionReason ? ` (${resolved.selectionReason})` : ""}.`,
          "warning",
        );

      const prepared = runtime.prepareVaultPrompt(resolved.template, {
        context: parsed.context,
        currentCompany: runtime.getCurrentCompany(ctx.cwd),
      });
      if (!prepared.ok) {
        return ctx.ui.notify(
          formatVaultTemplateRenderError(resolved.template.name, prepared.error),
          "error",
        );
      }

      ctx.ui.setEditorText(prepared.prepared);
      notifyPrepared(
        runtime,
        resolved.template,
        parsed.context ? " + context" : "",
        resolved.modeMessage,
        ctx,
      );
      if (resolved.template.id)
        runtime.logExecution(resolved.template, ctx.model?.id || "unknown", parsed.context);
    },
  });

  pi.registerCommand("route", {
    description: "Route context to best cognitive tool via meta-orchestration",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const schemaReport = runtime.checkSchemaCompatibilityDetailed();
      if (!schemaReport.ok) return ctx.ui.notify(formatSchemaMismatchMessage(runtime), "warning");
      const context = args.trim();
      if (!context) return ctx.ui.notify("Usage: /route <describe your situation>", "warning");
      const metaResult = runtime.getTemplateDetailed("meta-orchestration", {
        currentCompany: runtime.getCurrentCompany(ctx.cwd),
        cwd: ctx.cwd,
      });
      if (!metaResult.ok) {
        return ctx.ui.notify(`meta-orchestration lookup failed: ${metaResult.error}`, "error");
      }
      const meta = metaResult.value;
      if (!meta) return ctx.ui.notify("meta-orchestration template not found", "error");
      const preparedRoutePrompt = resolvePreparedRoutePrompt(runtime, meta, {
        context,
        cwd: ctx.cwd,
        outputHeading: "Output:",
        reasoningLabel: "why",
        includeInvokeStep: false,
      });
      if (!preparedRoutePrompt.ok) {
        return ctx.ui.notify(preparedRoutePrompt.error, "error");
      }
      ctx.ui.setEditorText(preparedRoutePrompt.prompt);
      ctx.ui.notify("Routing prompt ready. Press Enter to submit.", "info");
    },
  });

  pi.registerCommand("vault-check", {
    description: "Show vault schema, company-context, and visibility health",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const companyContext = runtime.resolveCurrentCompanyContext(ctx.cwd);
      const schemaReport = runtime.checkSchemaCompatibilityDetailed();
      const schemaOk = schemaReport.ok;
      const executionContext = { currentCompany: companyContext.company, cwd: ctx.cwd };
      const templatesResult = schemaOk
        ? runtime.listTemplatesDetailed(undefined, executionContext)
        : { ok: true, value: [], error: null as null };
      const metaResult = schemaOk
        ? runtime.getTemplateDetailed("meta-orchestration", executionContext)
        : { ok: true, value: null, error: null as null };
      const next10Result = schemaOk
        ? runtime.getTemplateDetailed("next-10-expert-suggestions", executionContext)
        : { ok: true, value: null, error: null as null };
      const queryError = !schemaOk
        ? "schema-mismatch"
        : !templatesResult.ok
          ? templatesResult.error
          : !metaResult.ok
            ? metaResult.error
            : !next10Result.ok
              ? next10Result.error
              : "none";
      const templates = templatesResult.ok ? templatesResult.value : [];
      const metaOrchestration = metaResult.ok ? metaResult.value : null;
      const next10 = next10Result.ok ? next10Result.value : null;
      const routerCount = templates.filter((template) => template.control_mode === "router").length;
      const output = [
        "# Vault Check",
        "",
        `- schema_required: ${schemaReport.expectedVersion}`,
        `- schema_actual: ${schemaReport.actualVersion ?? "unknown"}`,
        `- schema_status: ${schemaOk ? "ok" : "mismatch"}`,
        `- missing_prompt_template_columns: ${schemaReport.missingPromptTemplateColumns.join(", ") || "none"}`,
        `- missing_execution_columns: ${schemaReport.missingExecutionColumns.join(", ") || "none"}`,
        `- missing_feedback_columns: ${schemaReport.missingFeedbackColumns.join(", ") || "none"}`,
        `- current_company: ${companyContext.company}`,
        `- company_source: ${companyContext.source}`,
        `- query_error: ${queryError}`,
        `- visible_active_templates: ${templates.length}`,
        `- visible_router_templates: ${routerCount}`,
        `- meta-orchestration: ${metaOrchestration ? `visible (${runtime.facetLabel(metaOrchestration)})` : "not visible"}`,
        `- next-10-expert-suggestions: ${next10 ? `visible (${runtime.facetLabel(next10)})` : "not visible"}`,
      ].join("\n");
      await ctx.ui.editor("Vault Check", output);
      ctx.ui.notify(
        schemaOk ? "Vault check complete." : "Vault check found schema mismatch.",
        schemaOk ? "info" : "warning",
      );
    },
  });

  pi.registerCommand("vault-fzf-spike", {
    description: "Run FZF viability probe for vault selector runtime",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const probe = runFzfProbe();
      await ctx.ui.editor(
        "Vault FZF Spike",
        [
          "# Vault FZF Spike",
          "",
          `- cwd: ${ctx.cwd || process.cwd()}`,
          `- interactive status: ${probe.interactive.status ?? "n/a"}`,
          `- interactive stderr: ${probe.interactive.stderr}`,
          `- filter status: ${probe.filter.status ?? "n/a"}`,
          `- filter stdout: ${probe.filter.stdout}`,
          `- filter stderr: ${probe.filter.stderr}`,
          "",
          "Interpretation:",
          "- interactive status != 0 implies TTY-less runtime path; use deterministic fallback chooser.",
          "- filter status == 0 confirms non-interactive fzf ranking path is available.",
        ].join("\n"),
      );
    },
  });

  pi.registerCommand("vault-live-telemetry", {
    description: "Show recent live /vault: trigger telemetry events",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      await ctx.ui.editor("Vault Live Trigger Telemetry", runtime.summarizeLiveTriggerTelemetry());
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;
    const schemaReport = runtime.checkSchemaCompatibilityDetailed();
    if (!schemaReport.ok) {
      ctx.ui.notify(formatSchemaMismatchMessage(runtime), "warning");
      return;
    }
    const executionContext = {
      currentCompany: runtime.getCurrentCompany(ctx.cwd),
      cwd: ctx.cwd,
    };
    const templatesResult = runtime.listTemplatesDetailed(undefined, executionContext);
    if (!templatesResult.ok) {
      ctx.ui.notify(`Vault unavailable: ${templatesResult.error}`, "warning");
      return;
    }
    const templates = templatesResult.value;
    const cognitive = templates.filter((t) => t.artifact_kind === "cognitive").length;
    const procedure = templates.filter((t) => t.artifact_kind === "procedure").length;
    const session = templates.filter((t) => t.artifact_kind === "session").length;
    const currentCompany = ctx.cwd
      ? runtime.getCurrentCompany(ctx.cwd)
      : runtime.getCurrentCompany();
    ctx.ui.notify(
      `Vault (${currentCompany}): ${cognitive} cognitive, ${procedure} procedure, ${session} session templates — /vault loads exact matches or opens picker; live /vault: uses shared interaction runtime`,
      "info",
    );
  });

  pi.registerCommand("vault-stats", {
    description: "Show vault execution statistics",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const schemaReport = runtime.checkSchemaCompatibilityDetailed();
      if (!schemaReport.ok) return ctx.ui.notify(formatSchemaMismatchMessage(runtime), "warning");
      const currentCompany = runtime.getCurrentCompany(ctx.cwd);
      const result = runtime.queryVaultJsonDetailed(`
        SELECT pt.name, pt.owner_company, pt.artifact_kind, pt.control_mode, pt.formalization_level, COUNT(e.id) as uses, MAX(e.created_at) as last_used
        FROM prompt_templates pt
        LEFT JOIN executions e ON e.entity_type = 'template' AND e.entity_id = pt.id
        WHERE pt.status = 'active' AND ${runtime.buildVisibilityPredicate(currentCompany)}
        GROUP BY pt.id, pt.name, pt.owner_company, pt.artifact_kind, pt.control_mode, pt.formalization_level
        ORDER BY uses DESC
        LIMIT 20
      `);
      if (!result.ok) {
        return ctx.ui.notify(`Vault stats unavailable: ${result.error}`, "warning");
      }
      if (!result.value.rows?.length) {
        return ctx.ui.notify("No execution data available", "warning");
      }
      let output =
        "# Vault Execution Stats\n\n| Template | Owner | Facets | Uses | Last Used |\n|----------|-------|--------|------|----------|\n";
      for (const row of result.value.rows)
        output += `| ${row.name || ""} | ${row.owner_company || ""} | ${row.artifact_kind || ""}/${row.control_mode || ""}/${row.formalization_level || ""} | ${row.uses || 0} | ${String(row.last_used || "never").slice(0, 10)} |\n`;
      await ctx.ui.editor("Vault Stats", output);
    },
  });
}
