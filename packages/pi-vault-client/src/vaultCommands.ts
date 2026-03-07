import { runFzfProbe } from "./fuzzySelector.js";
import type { PiExtension, VaultModuleRuntime } from "./vaultTypes.js";

function notifyPrepared(
  runtime: VaultModuleRuntime,
  templateName: string,
  contextSuffix: string,
  selectionMessage: string,
  ctx: { hasUI: boolean; ui: { notify: (message: string, level?: string) => void } },
): void {
  const template = runtime.loadVaultTemplate(templateName);
  if (!template || !ctx.hasUI) return;
  ctx.ui.notify(
    `Prepared: ${template.name} (${runtime.facetLabel(template)})${contextSuffix} — ${selectionMessage}`,
    "info",
  );
}

async function resolveVaultTemplateSelection(
  runtime: VaultModuleRuntime,
  ctx: { hasUI: boolean; ui?: { notify: (message: string, level?: string) => void } },
  query: string,
) {
  const exactMatch = query.trim() ? runtime.loadVaultTemplate(query.trim()) : null;
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

  const template = runtime.loadVaultTemplate(selection.selected.id);
  return {
    template,
    modeMessage: runtime.selectionModeMessage(selection),
    selectionReason: selection.reason ?? selection.mode,
  } as const;
}

export function registerVaultCommands(pi: PiExtension, runtime: VaultModuleRuntime): void {
  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };
    const text = event.text.trim();

    if (text.startsWith("/next-10-expert-suggestions")) {
      const grounded = runtime.buildGroundedNext10Prompt(text);
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
      if (resolved.template.id)
        runtime.logExecution(
          resolved.template.id,
          resolved.template.name,
          ctx.model?.id || "unknown",
          vaultSelectionInput.context,
        );
      return {
        action: "transform",
        text: runtime.buildVaultPrompt(resolved.template, vaultSelectionInput.context),
      };
    }

    if (text.startsWith("/vault-search ")) {
      const query = text.slice(14).trim();
      if (!query) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /vault-search <query>", "warning");
        return { action: "handled" };
      }
      const templates = runtime.searchTemplates(query);
      const queryError = runtime.getVaultQueryError();
      if (queryError) {
        const message = `Vault search failed: ${queryError}`;
        if (ctx.hasUI) {
          ctx.ui.notify(message, "error");
          return { action: "handled" };
        }
        return { action: "transform", text: message };
      }
      if (templates.length === 0) {
        if (ctx.hasUI) ctx.ui.notify(`No templates found for: ${query}`, "warning");
        return { action: "handled" };
      }
      const output = [
        `# Search Results: "${query}"`,
        "",
        `- current_company: ${runtime.getCurrentCompany()}`,
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
      const meta = runtime.getTemplate("meta-orchestration");
      if (!meta) {
        if (ctx.hasUI) ctx.ui.notify("meta-orchestration template not found", "error");
        return { action: "handled" };
      }
      const prompt = `${meta.content}

---

## ROUTING REQUEST

Analyze this situation and determine:
1. Which PHASE this is in
2. Which FORMALIZATION level (0-4)
3. Which cognitive tool(s) to apply
4. The command to invoke

Context: ${context}

Output format:
\`\`\`
PHASE: [phase]
LEVEL: [0-4]
TOOLS: [tool1, tool2]
COMMAND: /vault:[tool]
REASONING: [why these tools]
\`\`\`
`;
      return { action: "transform", text: prompt };
    }

    return { action: "continue" };
  });

  pi.registerCommand("vault", {
    description: "Load an exact visible vault template or open the picker",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const parsed = runtime.splitVaultQueryAndContext(args.trim());
      const resolved = await resolveVaultTemplateSelection(runtime, ctx, parsed.query);
      if (!resolved.template)
        return ctx.ui.notify(
          `No vault template selected${resolved.selectionReason ? ` (${resolved.selectionReason})` : ""}.`,
          "warning",
        );
      ctx.ui.setEditorText(runtime.buildVaultPrompt(resolved.template, parsed.context));
      notifyPrepared(
        runtime,
        resolved.template.name,
        parsed.context ? " + context" : "",
        resolved.modeMessage,
        ctx,
      );
      if (resolved.template.id)
        runtime.logExecution(
          resolved.template.id,
          resolved.template.name,
          ctx.model?.id || "unknown",
          parsed.context,
        );
    },
  });

  pi.registerCommand("route", {
    description: "Route context to best cognitive tool via meta-orchestration",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const context = args.trim();
      if (!context) return ctx.ui.notify("Usage: /route <describe your situation>", "warning");
      const meta = runtime.getTemplate("meta-orchestration");
      if (!meta) return ctx.ui.notify("meta-orchestration template not found", "error");
      ctx.ui.setEditorText(`${meta.content}

---

## ROUTING REQUEST

Analyze this situation and determine:
1. Which PHASE this is in
2. Which FORMALIZATION level (0-4)
3. Which cognitive tool(s) to apply

Context: ${context}

Output:
PHASE: [phase]
LEVEL: [0-4]
TOOLS: [tool1, tool2]
COMMAND: /vault:[tool]
REASONING: [why]
`);
      ctx.ui.notify("Routing prompt ready. Press Enter to submit.", "info");
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
    const templates = runtime.listTemplates();
    const queryError = runtime.getVaultQueryError();
    if (queryError) {
      ctx.ui.notify(`Vault unavailable: ${queryError}`, "warning");
      return;
    }
    const cognitive = templates.filter((t) => t.artifact_kind === "cognitive").length;
    const procedure = templates.filter((t) => t.artifact_kind === "procedure").length;
    const session = templates.filter((t) => t.artifact_kind === "session").length;
    ctx.ui.notify(
      `Vault (${runtime.getCurrentCompany()}): ${cognitive} cognitive, ${procedure} procedure, ${session} session templates — /vault loads exact matches or opens picker; live /vault: uses shared interaction runtime`,
      "info",
    );
  });

  pi.on("session_shutdown", async () => {
    runtime.commitVault("Log template executions");
  });

  pi.registerCommand("vault-stats", {
    description: "Show vault execution statistics",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;
      const result = runtime.queryVaultJson(`
        SELECT pt.name, pt.owner_company, pt.artifact_kind, pt.control_mode, pt.formalization_level, COUNT(e.id) as uses, MAX(e.created_at) as last_used
        FROM prompt_templates pt
        LEFT JOIN executions e ON e.entity_type = 'template' AND e.entity_id = pt.id
        WHERE pt.status = 'active' AND ${runtime.buildVisibilityPredicate()}
        GROUP BY pt.id, pt.name, pt.owner_company, pt.artifact_kind, pt.control_mode, pt.formalization_level
        ORDER BY uses DESC
        LIMIT 20
      `);
      if (!result?.rows?.length) {
        const error = runtime.getVaultQueryError();
        return ctx.ui.notify(
          error ? `Vault stats unavailable: ${error}` : "No execution data available",
          "warning",
        );
      }
      let output =
        "# Vault Execution Stats\n\n| Template | Owner | Facets | Uses | Last Used |\n|----------|-------|--------|------|----------|\n";
      for (const row of result.rows)
        output += `| ${row.name || ""} | ${row.owner_company || ""} | ${row.artifact_kind || ""}/${row.control_mode || ""}/${row.formalization_level || ""} | ${row.uses || 0} | ${String(row.last_used || "never").slice(0, 10)} |\n`;
      await ctx.ui.editor("Vault Stats", output);
    },
  });
}
