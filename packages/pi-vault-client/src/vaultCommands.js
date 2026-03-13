import { runFzfProbe } from "./fuzzySelector.js";
import { createPreparedExecutionToken, formatVaultReceipt, receiptVisibleToCompany, stripPreparedExecutionMarkers, withPreparedExecutionMarker, } from "./vaultReceipts.js";
import { formatVaultReplayReport, replayVaultExecutionById } from "./vaultReplay.js";
import { buildRoutePrompt, getRoutePromptShapeForChannel } from "./vaultRoute.js";
const COMMAND_READ_CONTEXT_ERROR = "Explicit company context is required for visibility-sensitive vault reads. Set PI_COMPANY or run from a company-scoped cwd.";
function notifyPrepared(runtime, template, contextSuffix, selectionMessage, ctx) {
    if (!ctx.hasUI)
        return;
    ctx.ui.notify(`Prepared: ${template.name} (${runtime.facetLabel(template)})${contextSuffix} - ${selectionMessage}`, "info");
}
function formatVaultTemplateRenderError(templateName, error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Vault template render failed (${templateName}): ${message}`;
}
function formatSchemaMismatchMessage(runtime) {
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
function resolveCommandCompanyContext(runtime, ctx) {
    const companyContext = typeof runtime.resolveCurrentCompanyContext === "function"
        ? runtime.resolveCurrentCompanyContext(ctx.cwd)
        : {
            company: runtime.getCurrentCompany(ctx.cwd),
            source: ctx.cwd ? `cwd:${ctx.cwd}` : "fallback:getCurrentCompany",
        };
    if (companyContext.source === "contract-default") {
        return { ok: false, error: COMMAND_READ_CONTEXT_ERROR };
    }
    return {
        ok: true,
        currentCompany: companyContext.company,
        companySource: companyContext.source,
    };
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
function queuePreparedExecution(receipts, candidate) {
    if (!receipts)
        return candidate.prepared.text;
    const executionToken = createPreparedExecutionToken();
    receipts.queuePreparedExecution({
        ...candidate,
        execution_token: executionToken,
    });
    return withPreparedExecutionMarker(candidate.prepared.text, executionToken);
}
function getUserMessageText(message) {
    if (!message || message.role !== "user")
        return null;
    if (typeof message.content === "string")
        return message.content;
    if (!Array.isArray(message.content))
        return null;
    const textParts = message.content
        .filter((item) => item?.type === "text")
        .map((item) => item.text);
    return textParts.length > 0 ? textParts.join("\n") : null;
}
function resolvePreparedRoutePrompt(runtime, metaTemplate, options) {
    const shape = getRoutePromptShapeForChannel(options.channel);
    if (!shape) {
        return {
            ok: false,
            error: `Unsupported route replay channel: ${options.channel}`,
        };
    }
    const prepared = runtime.prepareVaultPrompt(metaTemplate, {
        context: options.context,
        currentCompany: options.currentCompany,
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
        prepared,
        prompt: buildRoutePrompt(prepared.prepared, options.context, shape),
    };
}
async function resolveVaultTemplateSelection(runtime, ctx, query, currentCompany) {
    const exactMatchResult = query.trim()
        ? runtime.getTemplateDetailed(query.trim(), {
            currentCompany,
            cwd: ctx.cwd,
            requireExplicitCompany: true,
        })
        : { ok: true, value: null, error: null };
    if (!exactMatchResult.ok) {
        return {
            template: null,
            modeMessage: "selection mode=exact",
            selectionMode: "exact",
            selectionReason: `lookup-error:${exactMatchResult.error}`,
        };
    }
    const exactMatch = exactMatchResult.value;
    if (exactMatch) {
        return {
            template: exactMatch,
            modeMessage: "selection mode=exact",
            selectionMode: "exact",
            selectionReason: "exact-match",
        };
    }
    const selection = await runtime.pickVaultTemplate(ctx, query);
    if (!selection.selected) {
        return {
            template: null,
            modeMessage: runtime.selectionModeMessage(selection),
            selectionMode: selection.mode === "fzf" ? "picker-fzf" : "picker-fallback",
            selectionReason: selection.reason ?? "no-selection",
        };
    }
    const templateResult = runtime.getTemplateDetailed(selection.selected.id, {
        currentCompany,
        cwd: ctx.cwd,
        requireExplicitCompany: true,
    });
    return {
        template: templateResult.ok ? templateResult.value : null,
        modeMessage: runtime.selectionModeMessage(selection),
        selectionMode: selection.mode === "fzf" ? "picker-fzf" : "picker-fallback",
        selectionReason: templateResult.ok
            ? (selection.reason ?? selection.mode)
            : `lookup-error:${templateResult.error}`,
    };
}
export function registerVaultCommands(pi, runtime, receipts) {
    if (receipts) {
        pi.on("message_end", async (event, ctx) => {
            const messageText = getUserMessageText(event.message);
            if (!messageText)
                return;
            const finalized = receipts.finalizePreparedExecution(messageText, ctx.model?.id || "unknown");
            if (finalized.status === "error") {
                const warning = `Vault execution receipt failed: ${finalized.message}`;
                if (ctx.hasUI)
                    ctx.ui.notify(warning, "warning");
                else
                    console.warn(warning);
            }
        });
        pi.on("context", async (event) => ({
            messages: event.messages.map((message) => {
                if (!message || message.role !== "user")
                    return message;
                if (typeof message.content === "string") {
                    return {
                        ...message,
                        content: stripPreparedExecutionMarkers(message.content),
                    };
                }
                if (!Array.isArray(message.content))
                    return message;
                return {
                    ...message,
                    content: message.content.map((item) => item?.type === "text"
                        ? {
                            ...item,
                            text: stripPreparedExecutionMarkers(item.text),
                        }
                        : item),
                };
            }),
        }));
    }
    pi.on("input", async (event, ctx) => {
        if (event.source === "extension")
            return { action: "continue" };
        const text = event.text.trim();
        const schemaReport = runtime.checkSchemaCompatibilityDetailed();
        const schemaMismatchMessage = schemaReport.ok ? "" : formatSchemaMismatchMessage(runtime);
        if (!schemaReport.ok &&
            /^\/(vault(?::|\s|$)|vault-search\b|route\b|next-10-expert-suggestions\b)/.test(text)) {
            if (ctx.hasUI) {
                ctx.ui.notify(schemaMismatchMessage, "warning");
                return { action: "handled" };
            }
            return { action: "transform", text: schemaMismatchMessage };
        }
        if (text.startsWith("/next-10-expert-suggestions")) {
            const companyContext = resolveCommandCompanyContext(runtime, ctx);
            if (!companyContext.ok) {
                if (ctx.hasUI) {
                    ctx.ui.notify(companyContext.error, "warning");
                    return { action: "handled" };
                }
                return { action: "transform", text: companyContext.error };
            }
            const grounded = runtime.buildGroundedNext10Prompt(text, {
                cwd: ctx.cwd,
                currentCompany: companyContext.currentCompany,
            });
            if (!grounded.ok) {
                const reason = "reason" in grounded ? grounded.reason : "Grounding unavailable";
                if (ctx.hasUI) {
                    ctx.ui.notify(reason, "error");
                    ctx.ui.setEditorText(reason);
                    return { action: "handled" };
                }
                return { action: "transform", text: reason };
            }
            const preparedPrompt = queuePreparedExecution(receipts, {
                queued_at: new Date().toISOString(),
                invocation: {
                    surface: "grounding",
                    channel: "input-transform",
                    selection_mode: "fixed-template",
                    llm_tool_call: null,
                },
                template: toTemplateSnapshot(grounded.template),
                company: {
                    current_company: grounded.currentCompany,
                    company_source: grounded.companySource,
                },
                render: {
                    engine: grounded.prepared.engine,
                    explicit_engine: grounded.prepared.explicitEngine,
                    context_appended: grounded.prepared.contextAppended,
                    append_context_section: false,
                    used_render_keys: grounded.prepared.usedRenderKeys,
                },
                prepared: { text: grounded.prompt },
                replay_safe_inputs: grounded.replaySafeInputs,
                input_context: grounded.inputContext,
            });
            if (ctx.hasUI)
                ctx.ui.notify("Grounded via Prompt Vault: frameworks pre-resolved and injected", "info");
            return { action: "transform", text: preparedPrompt };
        }
        const vaultSelectionInput = runtime.parseVaultSelectionInput(text);
        if (vaultSelectionInput) {
            const companyContext = resolveCommandCompanyContext(runtime, ctx);
            if (!companyContext.ok) {
                if (ctx.hasUI) {
                    ctx.ui.notify(companyContext.error, "warning");
                    return { action: "handled" };
                }
                return { action: "transform", text: companyContext.error };
            }
            const resolved = await resolveVaultTemplateSelection(runtime, ctx, vaultSelectionInput.query, companyContext.currentCompany);
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
                ctx.ui.notify(`Loaded: ${resolved.template.name} (${runtime.facetLabel(resolved.template)}) - ${resolved.modeMessage}`, "info");
            }
            const prepared = runtime.prepareVaultPrompt(resolved.template, {
                context: vaultSelectionInput.context,
                currentCompany: companyContext.currentCompany,
            });
            if (!prepared.ok) {
                const message = formatVaultTemplateRenderError(resolved.template.name, prepared.error);
                if (ctx.hasUI) {
                    ctx.ui.notify(message, "error");
                    return { action: "handled" };
                }
                return { action: "transform", text: message };
            }
            const preparedPrompt = queuePreparedExecution(receipts, {
                queued_at: new Date().toISOString(),
                invocation: {
                    surface: text.startsWith("/vault:") ? "/vault:" : "/vault",
                    channel: "input-transform",
                    selection_mode: resolved.selectionMode,
                    llm_tool_call: null,
                },
                template: toTemplateSnapshot(resolved.template),
                company: {
                    current_company: companyContext.currentCompany,
                    company_source: companyContext.companySource,
                },
                render: {
                    engine: prepared.engine,
                    explicit_engine: prepared.explicitEngine,
                    context_appended: prepared.contextAppended,
                    append_context_section: true,
                    used_render_keys: prepared.usedRenderKeys,
                },
                prepared: { text: prepared.prepared },
                replay_safe_inputs: {
                    kind: "vault-selection",
                    query: vaultSelectionInput.query,
                    context: vaultSelectionInput.context,
                },
                input_context: vaultSelectionInput.context,
            });
            return {
                action: "transform",
                text: preparedPrompt,
            };
        }
        if (text.startsWith("/vault-search ")) {
            const query = text.slice(14).trim();
            if (!query) {
                if (ctx.hasUI)
                    ctx.ui.notify("Usage: /vault-search <query>", "warning");
                return { action: "handled" };
            }
            const companyContext = resolveCommandCompanyContext(runtime, ctx);
            if (!companyContext.ok) {
                if (ctx.hasUI) {
                    ctx.ui.notify(companyContext.error, "warning");
                    return { action: "handled" };
                }
                return { action: "transform", text: companyContext.error };
            }
            const currentCompany = companyContext.currentCompany;
            const templatesResult = runtime.searchTemplatesDetailed(query, {
                currentCompany,
                cwd: ctx.cwd,
                requireExplicitCompany: true,
            }, { includeContent: false });
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
                if (ctx.hasUI)
                    ctx.ui.notify(`No templates found for: ${query}`, "warning");
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
            if (ctx.hasUI) {
                await ctx.ui.editor("Search Results", output);
                return { action: "handled" };
            }
            return { action: "transform", text: output };
        }
        if (text.startsWith("/route ")) {
            const context = text.slice(7).trim();
            const companyContext = resolveCommandCompanyContext(runtime, ctx);
            if (!companyContext.ok) {
                if (ctx.hasUI) {
                    ctx.ui.notify(companyContext.error, "warning");
                    return { action: "handled" };
                }
                return { action: "transform", text: companyContext.error };
            }
            const metaResult = runtime.getTemplateDetailed("meta-orchestration", {
                currentCompany: companyContext.currentCompany,
                cwd: ctx.cwd,
                requireExplicitCompany: true,
            });
            if (!metaResult.ok) {
                const message = `meta-orchestration lookup failed: ${metaResult.error}`;
                if (ctx.hasUI) {
                    ctx.ui.notify(message, "error");
                    return { action: "handled" };
                }
                return { action: "transform", text: message };
            }
            const meta = metaResult.value;
            if (!meta) {
                const message = "meta-orchestration template not found";
                if (ctx.hasUI) {
                    ctx.ui.notify(message, "error");
                    return { action: "handled" };
                }
                return { action: "transform", text: message };
            }
            const preparedRoutePrompt = resolvePreparedRoutePrompt(runtime, meta, {
                context,
                currentCompany: companyContext.currentCompany,
                cwd: ctx.cwd,
                channel: "input-transform",
            });
            if (!preparedRoutePrompt.ok) {
                if (ctx.hasUI) {
                    ctx.ui.notify(preparedRoutePrompt.error, "error");
                    return { action: "handled" };
                }
                return { action: "transform", text: preparedRoutePrompt.error };
            }
            const preparedPrompt = queuePreparedExecution(receipts, {
                queued_at: new Date().toISOString(),
                invocation: {
                    surface: "/route",
                    channel: "input-transform",
                    selection_mode: "fixed-template",
                    llm_tool_call: null,
                },
                template: toTemplateSnapshot(meta),
                company: {
                    current_company: companyContext.currentCompany,
                    company_source: companyContext.companySource,
                },
                render: {
                    engine: preparedRoutePrompt.prepared.engine,
                    explicit_engine: preparedRoutePrompt.prepared.explicitEngine,
                    context_appended: preparedRoutePrompt.prepared.contextAppended,
                    append_context_section: false,
                    used_render_keys: preparedRoutePrompt.prepared.usedRenderKeys,
                },
                prepared: { text: preparedRoutePrompt.prompt },
                replay_safe_inputs: {
                    kind: "route-request",
                    context,
                },
                input_context: context,
            });
            return {
                action: "transform",
                text: preparedPrompt,
            };
        }
        return { action: "continue" };
    });
    pi.registerCommand("vault", {
        description: "Load an exact visible vault template or open the picker",
        handler: async (args, ctx) => {
            if (!ctx.hasUI)
                return;
            const schemaReport = runtime.checkSchemaCompatibilityDetailed();
            if (!schemaReport.ok)
                return ctx.ui.notify(formatSchemaMismatchMessage(runtime), "warning");
            const companyContext = resolveCommandCompanyContext(runtime, ctx);
            if (!companyContext.ok)
                return ctx.ui.notify(companyContext.error, "warning");
            const parsed = runtime.splitVaultQueryAndContext(args.trim());
            const resolved = await resolveVaultTemplateSelection(runtime, ctx, parsed.query, companyContext.currentCompany);
            if (!resolved.template)
                return ctx.ui.notify(`No vault template selected${resolved.selectionReason ? ` (${resolved.selectionReason})` : ""}.`, "warning");
            const prepared = runtime.prepareVaultPrompt(resolved.template, {
                context: parsed.context,
                currentCompany: companyContext.currentCompany,
            });
            if (!prepared.ok) {
                return ctx.ui.notify(formatVaultTemplateRenderError(resolved.template.name, prepared.error), "error");
            }
            const preparedPrompt = queuePreparedExecution(receipts, {
                queued_at: new Date().toISOString(),
                invocation: {
                    surface: "/vault",
                    channel: "slash-command",
                    selection_mode: resolved.selectionMode,
                    llm_tool_call: null,
                },
                template: toTemplateSnapshot(resolved.template),
                company: {
                    current_company: companyContext.currentCompany,
                    company_source: companyContext.companySource,
                },
                render: {
                    engine: prepared.engine,
                    explicit_engine: prepared.explicitEngine,
                    context_appended: prepared.contextAppended,
                    append_context_section: true,
                    used_render_keys: prepared.usedRenderKeys,
                },
                prepared: { text: prepared.prepared },
                replay_safe_inputs: {
                    kind: "vault-selection",
                    query: parsed.query,
                    context: parsed.context,
                },
                input_context: parsed.context,
            });
            ctx.ui.setEditorText(preparedPrompt);
            notifyPrepared(runtime, resolved.template, parsed.context ? " + context" : "", resolved.modeMessage, ctx);
        },
    });
    pi.registerCommand("route", {
        description: "Route context to best cognitive tool via meta-orchestration",
        handler: async (args, ctx) => {
            if (!ctx.hasUI)
                return;
            const schemaReport = runtime.checkSchemaCompatibilityDetailed();
            if (!schemaReport.ok)
                return ctx.ui.notify(formatSchemaMismatchMessage(runtime), "warning");
            const companyContext = resolveCommandCompanyContext(runtime, ctx);
            if (!companyContext.ok)
                return ctx.ui.notify(companyContext.error, "warning");
            const context = args.trim();
            if (!context)
                return ctx.ui.notify("Usage: /route <describe your situation>", "warning");
            const metaResult = runtime.getTemplateDetailed("meta-orchestration", {
                currentCompany: companyContext.currentCompany,
                cwd: ctx.cwd,
                requireExplicitCompany: true,
            });
            if (!metaResult.ok) {
                return ctx.ui.notify(`meta-orchestration lookup failed: ${metaResult.error}`, "error");
            }
            const meta = metaResult.value;
            if (!meta)
                return ctx.ui.notify("meta-orchestration template not found", "error");
            const preparedRoutePrompt = resolvePreparedRoutePrompt(runtime, meta, {
                context,
                currentCompany: companyContext.currentCompany,
                cwd: ctx.cwd,
                channel: "slash-command",
            });
            if (!preparedRoutePrompt.ok) {
                return ctx.ui.notify(preparedRoutePrompt.error, "error");
            }
            const preparedPrompt = queuePreparedExecution(receipts, {
                queued_at: new Date().toISOString(),
                invocation: {
                    surface: "/route",
                    channel: "slash-command",
                    selection_mode: "fixed-template",
                    llm_tool_call: null,
                },
                template: toTemplateSnapshot(meta),
                company: {
                    current_company: companyContext.currentCompany,
                    company_source: companyContext.companySource,
                },
                render: {
                    engine: preparedRoutePrompt.prepared.engine,
                    explicit_engine: preparedRoutePrompt.prepared.explicitEngine,
                    context_appended: preparedRoutePrompt.prepared.contextAppended,
                    append_context_section: false,
                    used_render_keys: preparedRoutePrompt.prepared.usedRenderKeys,
                },
                prepared: { text: preparedRoutePrompt.prompt },
                replay_safe_inputs: {
                    kind: "route-request",
                    context,
                },
                input_context: context,
            });
            ctx.ui.setEditorText(preparedPrompt);
            ctx.ui.notify("Routing prompt ready. Press Enter to submit.", "info");
        },
    });
    pi.registerCommand("vault-check", {
        description: "Show vault schema, company-context, and visibility health",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI)
                return;
            const companyContext = runtime.resolveCurrentCompanyContext(ctx.cwd);
            const schemaReport = runtime.checkSchemaCompatibilityDetailed();
            const schemaOk = schemaReport.ok;
            const executionContext = { currentCompany: companyContext.company, cwd: ctx.cwd };
            const templatesResult = schemaOk
                ? runtime.listTemplatesDetailed(undefined, executionContext, { includeContent: false })
                : { ok: true, value: [], error: null };
            const metaResult = schemaOk
                ? runtime.getTemplateDetailed("meta-orchestration", executionContext)
                : { ok: true, value: null, error: null };
            const next10Result = schemaOk
                ? runtime.getTemplateDetailed("next-10-expert-suggestions", executionContext)
                : { ok: true, value: null, error: null };
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
            ctx.ui.notify(schemaOk ? "Vault check complete." : "Vault check found schema mismatch.", schemaOk ? "info" : "warning");
        },
    });
    pi.registerCommand("vault-fzf-spike", {
        description: "Run FZF viability probe for vault selector runtime",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI)
                return;
            const probe = runFzfProbe();
            await ctx.ui.editor("Vault FZF Spike", [
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
            ].join("\n"));
        },
    });
    pi.registerCommand("vault-live-telemetry", {
        description: "Show recent live /vault: trigger telemetry events",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI)
                return;
            await ctx.ui.editor("Vault Live Trigger Telemetry", runtime.summarizeLiveTriggerTelemetry());
        },
    });
    if (receipts) {
        pi.registerCommand("vault-last-receipt", {
            description: "Show the latest local vault execution receipt visible to the current company",
            handler: async (_args, ctx) => {
                if (!ctx.hasUI)
                    return;
                const companyContext = resolveCommandCompanyContext(runtime, ctx);
                if (!companyContext.ok)
                    return ctx.ui.notify(companyContext.error, "warning");
                const receipt = receipts.listRecentReceipts({
                    currentCompany: companyContext.currentCompany,
                    limit: 1,
                })[0];
                if (!receipt)
                    return ctx.ui.notify("No local vault execution receipts recorded yet for the current company.", "warning");
                await ctx.ui.editor("Latest Vault Receipt", formatVaultReceipt(receipt));
            },
        });
        pi.registerCommand("vault-receipt", {
            description: "Show a local vault execution receipt by execution id",
            handler: async (args, ctx) => {
                if (!ctx.hasUI)
                    return;
                const companyContext = resolveCommandCompanyContext(runtime, ctx);
                if (!companyContext.ok)
                    return ctx.ui.notify(companyContext.error, "warning");
                const executionId = Math.floor(Number(args.trim()));
                if (!Number.isFinite(executionId) || executionId < 1) {
                    return ctx.ui.notify("Usage: /vault-receipt <execution_id>", "warning");
                }
                const receipt = receipts.readReceiptByExecutionId(executionId);
                if (!receipt || !receiptVisibleToCompany(receipt, companyContext.currentCompany)) {
                    return ctx.ui.notify(`No local receipt found for execution ${executionId} in the current company context.`, "warning");
                }
                await ctx.ui.editor(`Vault Receipt ${executionId}`, formatVaultReceipt(receipt));
            },
        });
        pi.registerCommand("vault-replay", {
            description: "Replay a local vault execution receipt by execution id",
            handler: async (args, ctx) => {
                if (!ctx.hasUI)
                    return;
                const companyContext = resolveCommandCompanyContext(runtime, ctx);
                if (!companyContext.ok)
                    return ctx.ui.notify(companyContext.error, "warning");
                const executionId = Math.floor(Number(args.trim()));
                if (!Number.isFinite(executionId) || executionId < 1) {
                    return ctx.ui.notify("Usage: /vault-replay <execution_id>", "warning");
                }
                const receipt = receipts.readReceiptByExecutionId(executionId);
                if (!receipt || !receiptVisibleToCompany(receipt, companyContext.currentCompany)) {
                    return ctx.ui.notify(`No local receipt found for execution ${executionId} in the current company context.`, "warning");
                }
                const report = replayVaultExecutionById(runtime, receipts, executionId, {
                    currentCompany: companyContext.currentCompany,
                    cwd: ctx.cwd,
                });
                await ctx.ui.editor(`Vault Replay ${executionId}`, formatVaultReplayReport(report));
                ctx.ui.notify(`Vault replay status: ${report.status}`, "info");
            },
        });
    }
    pi.on("session_start", async (_event, ctx) => {
        if (!ctx.hasUI)
            return;
        const schemaReport = runtime.checkSchemaCompatibilityDetailed();
        if (!schemaReport.ok) {
            ctx.ui.notify(formatSchemaMismatchMessage(runtime), "warning");
            return;
        }
        const companyContext = runtime.resolveCurrentCompanyContext(ctx.cwd);
        if (companyContext.source === "contract-default") {
            ctx.ui.notify(COMMAND_READ_CONTEXT_ERROR, "warning");
            return;
        }
        const executionContext = {
            currentCompany: companyContext.company,
            cwd: ctx.cwd,
            requireExplicitCompany: true,
        };
        const templatesResult = runtime.listTemplatesDetailed(undefined, executionContext, {
            includeContent: false,
        });
        if (!templatesResult.ok) {
            ctx.ui.notify(`Vault unavailable: ${templatesResult.error}`, "warning");
            return;
        }
        const templates = templatesResult.value;
        const cognitive = templates.filter((t) => t.artifact_kind === "cognitive").length;
        const procedure = templates.filter((t) => t.artifact_kind === "procedure").length;
        const session = templates.filter((t) => t.artifact_kind === "session").length;
        const currentCompany = companyContext.company;
        ctx.ui.notify(`Vault (${currentCompany}): ${cognitive} cognitive, ${procedure} procedure, ${session} session templates - /vault loads exact matches or opens picker; live /vault: uses shared interaction runtime`, "info");
    });
    pi.registerCommand("vault-stats", {
        description: "Show vault execution statistics",
        handler: async (_args, ctx) => {
            if (!ctx.hasUI)
                return;
            const schemaReport = runtime.checkSchemaCompatibilityDetailed();
            if (!schemaReport.ok)
                return ctx.ui.notify(formatSchemaMismatchMessage(runtime), "warning");
            const companyContext = resolveCommandCompanyContext(runtime, ctx);
            if (!companyContext.ok)
                return ctx.ui.notify(companyContext.error, "warning");
            const currentCompany = companyContext.currentCompany;
            const result = runtime.queryVaultJsonDetailed(`
        SELECT pt.name, pt.owner_company, pt.artifact_kind, pt.control_mode, pt.formalization_level, COUNT(e.id) as uses, MAX(e.created_at) as last_used
        FROM prompt_templates pt
        LEFT JOIN executions e ON e.entity_type = 'template' AND e.entity_id = pt.id
        WHERE ${runtime.buildActiveVisibleTemplatePredicate(currentCompany, "pt")}
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
            let output = "# Vault Execution Stats\n\n| Template | Owner | Facets | Uses | Last Used |\n|----------|-------|--------|------|----------|\n";
            for (const row of result.value.rows)
                output += `| ${row.name || ""} | ${row.owner_company || ""} | ${row.artifact_kind || ""}/${row.control_mode || ""}/${row.formalization_level || ""} | ${row.uses || 0} | ${String(row.last_used || "never").slice(0, 10)} |\n`;
            await ctx.ui.editor("Vault Stats", output);
        },
    });
}
