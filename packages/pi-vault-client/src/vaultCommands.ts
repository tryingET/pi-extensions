import { runFzfProbe } from "./fuzzySelector.js";
import type { PiExtension, UiContext, VaultModuleRuntime } from "./vaultTypes.js";

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
      const selection = await runtime.pickVaultTemplate(ctx, vaultSelectionInput.query);
      if (!selection.selected) {
        if (ctx.hasUI) {
          const reason = selection.reason ? ` (${selection.reason})` : "";
          ctx.ui.notify(`No vault template selected${reason}.`, "warning");
          return { action: "handled" };
        }
        return {
          action: "transform",
          text: `Vault selection unavailable: ${selection.reason ?? "no-selection"}. Check VAULT_DIR/fzf availability.`,
        };
      }

      const template = runtime.loadVaultTemplate(selection.selected.id);
      if (!template) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Template not found: ${selection.selected.id}`, "error");
          return { action: "handled" };
        }
        return {
          action: "transform",
          text: `Vault template unavailable: ${selection.selected.id}.`,
        };
      }

      if (ctx.hasUI) {
        ctx.ui.notify(
          `Loaded: ${template.name} (${runtime.facetLabel(template)}) — ${runtime.selectionModeMessage(selection)}`,
          "info",
        );
      }
      if (template.id)
        runtime.logExecution(
          template.id,
          template.name,
          ctx.model?.id || "unknown",
          vaultSelectionInput.context,
        );
      return {
        action: "transform",
        text: runtime.buildVaultPrompt(template, vaultSelectionInput.context),
      };
    }

    if (text === "/vaults" || text === "/vault-list") {
      const templates = runtime.listTemplates();
      const byFacet = templates.reduce(
        (acc, t) => {
          const key = runtime.facetLabel(t);
          acc[key] = acc[key] || [];
          acc[key].push(t);
          return acc;
        },
        {} as Record<string, typeof templates>,
      );

      let output = "# Vault Templates\n\n";
      for (const [facetKey, items] of Object.entries(byFacet)) {
        output += `## ${facetKey} (${items.length})\n`;
        for (const t of items) {
          const desc = t.description.slice(0, 60);
          output += `- \`/vault:${t.name}\` — ${desc}${t.description.length > 60 ? "..." : ""}\n`;
        }
        output += "\n";
      }
      if (ctx.hasUI) await ctx.ui.editor("Vault Contents", output);
      return { action: "handled" };
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
      let output = `# Search Results: "${query}"\n\n`;
      for (const t of templates)
        output += `- \`/vault:${t.name}\` (${runtime.facetLabel(t)}) — ${t.description.slice(0, 50)}...\n`;
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
    description: "Pick vault template via fuzzy selector (use /vaults to list all)",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const selection = await runtime.pickVaultTemplate(ctx, args.trim());
      if (!selection.selected)
        return ctx.ui.notify(
          `No vault template selected${selection.reason ? ` (${selection.reason})` : ""}.`,
          "warning",
        );
      const template = runtime.loadVaultTemplate(selection.selected.id);
      if (!template) return ctx.ui.notify(`Template not found: ${selection.selected.id}`, "error");
      ctx.ui.setEditorText(runtime.buildVaultPrompt(template, ""));
      ctx.ui.notify(
        `Prepared: ${template.name} (${runtime.facetLabel(template)}) — ${runtime.selectionModeMessage(selection)}`,
        "info",
      );
    },
  });

  const browseVaultTemplates = async (args: string, ctx: UiContext) => {
    if (!ctx.hasUI) return;
    const parsed = runtime.splitVaultQueryAndContext(args);
    const templates = runtime.listTemplates();
    const candidates = templates.map((template) => ({
      id: template.name,
      label: `/vault:${template.name}`,
      source: "vault" as const,
    }));
    if (candidates.length === 0)
      return ctx.ui.notify(
        `Vault browser unavailable (${runtime.getVaultQueryError() ? "vault-db-unavailable" : "empty-vault"}).`,
        "warning",
      );
    const ranking = runtime.rankVaultCandidates(candidates, parsed.query);
    await ctx.ui.editor(
      "Vault Browser",
      runtime.buildVaultBrowserReport(parsed.query, candidates, ranking, runtime),
    );
    if (ranking.ranked.length === 0)
      return ctx.ui.notify(
        `No vault templates matched${ranking.reason ? ` (${ranking.reason})` : ""}.`,
        "warning",
      );
    const selection = await runtime.pickVaultTemplate(ctx, parsed.query);
    if (!selection.selected)
      return ctx.ui.notify(
        `No vault template selected${selection.reason ? ` (${selection.reason})` : ""}.`,
        "warning",
      );
    const template = runtime.loadVaultTemplate(selection.selected.id);
    if (!template) return ctx.ui.notify(`Template not found: ${selection.selected.id}`, "error");
    ctx.ui.setEditorText(runtime.buildVaultPrompt(template, parsed.context));
    ctx.ui.notify(
      `Prepared: ${template.name} (${runtime.facetLabel(template)})${parsed.context ? " + context" : ""} — ${runtime.selectionModeMessage(selection)}`,
      "info",
    );
  };

  pi.registerCommand("vault-browse", {
    description: "Browse ranked vault templates, then pick one with fuzzy selector",
    handler: browseVaultTemplates,
  });
  pi.registerCommand("vault-browser", {
    description: "Alias for /vault-browse",
    handler: browseVaultTemplates,
  });
  pi.registerCommand("vault-select", {
    description: "Pick a vault template with fuzzy selector and stage it in editor",
    handler: async (args, ctx) => {
      const selection = await runtime.pickVaultTemplate(ctx, args.trim());
      if (!selection.selected) {
        if (ctx.hasUI)
          ctx.ui.notify(
            `No vault template selected${selection.reason ? ` (${selection.reason})` : ""}.`,
            "warning",
          );
        return;
      }
      const template = runtime.loadVaultTemplate(selection.selected.id);
      if (!template) {
        if (ctx.hasUI) ctx.ui.notify(`Template not found: ${selection.selected.id}`, "error");
        return;
      }
      if (ctx.hasUI) {
        ctx.ui.setEditorText(runtime.buildVaultPrompt(template, ""));
        ctx.ui.notify(
          `Prepared: ${template.name} (${runtime.facetLabel(template)}) — ${runtime.selectionModeMessage(selection)}`,
          "info",
        );
      }
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
    const cognitive = templates.filter((t) => t.artifact_kind === "cognitive").length;
    const procedure = templates.filter((t) => t.artifact_kind === "procedure").length;
    ctx.ui.notify(
      `Vault: ${cognitive} cognitive, ${procedure} procedure templates — /vault for picker, /vault-browse for ranked browser, live /vault: via pi-input-triggers`,
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
        SELECT pt.name, pt.artifact_kind, pt.control_mode, pt.formalization_level, COUNT(e.id) as uses, MAX(e.created_at) as last_used
        FROM prompt_templates pt
        LEFT JOIN executions e ON e.entity_type = 'template' AND e.entity_id = pt.id
        GROUP BY pt.id, pt.name, pt.artifact_kind, pt.control_mode, pt.formalization_level
        ORDER BY uses DESC
        LIMIT 20
      `);
      if (!result?.rows?.length) return ctx.ui.notify("No execution data available", "warning");
      let output =
        "# Vault Execution Stats\n\n| Template | Facets | Uses | Last Used |\n|----------|--------|------|----------|\n";
      for (const row of result.rows)
        output += `| ${row.name || ""} | ${row.artifact_kind || ""}/${row.control_mode || ""}/${row.formalization_level || ""} | ${row.uses || 0} | ${String(row.last_used || "never").slice(0, 10)} |\n`;
      await ctx.ui.editor("Vault Stats", output);
    },
  });
}
