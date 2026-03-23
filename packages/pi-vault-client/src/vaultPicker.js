import { selectFuzzyCandidate } from "./fuzzySelector.js";
import { prepareTemplateForExecutionCompat } from "./templatePreparationCompat.js";
import { registerPickerInteraction, splitQueryAndContext } from "./triggerAdapter.js";
import { toVaultCandidates } from "./vaultCandidateAdapter.js";
import { createPreparedExecutionToken, withPreparedExecutionMarker } from "./vaultReceipts.js";
import { LIVE_TRIGGER_TELEMETRY_LIMIT, LIVE_VAULT_MIN_QUERY, LIVE_VAULT_TRIGGER_DEBOUNCE_MS, LIVE_VAULT_TRIGGER_ID, } from "./vaultTypes.js";
const PICKER_READ_CONTEXT_ERROR = "Explicit company context is required for visibility-sensitive vault reads. Set PI_COMPANY or run from a company-scoped cwd.";
function createLiveTriggerTelemetryState() {
    return {
        registrations: 0,
        registrationFailures: 0,
        events: [],
    };
}
function recordLiveTriggerTelemetry(telemetry, event) {
    const normalized = {
        timestamp: String(event.timestamp ?? new Date().toISOString()),
        event: String(event.event ?? "unknown"),
        triggerId: event.triggerId ? String(event.triggerId) : undefined,
        query: event.query ? String(event.query) : undefined,
        contextLength: typeof event.contextLength === "number" ? event.contextLength : undefined,
        candidateCount: typeof event.candidateCount === "number" ? event.candidateCount : undefined,
        selectedId: event.selectedId ? String(event.selectedId) : undefined,
        selectedLabel: event.selectedLabel ? String(event.selectedLabel) : undefined,
        mode: event.mode ? String(event.mode) : undefined,
        reason: event.reason ? String(event.reason) : undefined,
        error: event.error ? String(event.error) : undefined,
    };
    telemetry.events.push(normalized);
    if (telemetry.events.length > LIVE_TRIGGER_TELEMETRY_LIMIT)
        telemetry.events.shift();
}
function summarizeLiveTriggerTelemetry(telemetry) {
    const recent = telemetry.events.slice(-10);
    const lines = [
        "# Vault Live Trigger Telemetry",
        "",
        `- registrations: ${telemetry.registrations}`,
        `- registration_failures: ${telemetry.registrationFailures}`,
        `- retained_events: ${telemetry.events.length}`,
        "",
        "## Recent events",
    ];
    if (recent.length === 0)
        lines.push("_No live-trigger telemetry recorded yet._");
    else {
        for (const event of recent) {
            const parts = [event.timestamp, event.event];
            if (event.query)
                parts.push(`query=${event.query}`);
            if (event.selectedId)
                parts.push(`selected=${event.selectedId}`);
            if (event.mode)
                parts.push(`mode=${event.mode}`);
            if (event.reason)
                parts.push(`reason=${event.reason}`);
            lines.push(`- ${parts.join(" | ")}`);
        }
    }
    return lines.join("\n");
}
function getLiveTriggerTelemetryStats(telemetry) {
    return {
        registrations: telemetry.registrations,
        failures: telemetry.registrationFailures,
        eventCount: telemetry.events.length,
    };
}
function selectionModeMessage(selection) {
    if (selection.mode === "fzf")
        return "selection mode=fzf";
    return selection.reason
        ? `selection mode=fallback (${selection.reason})`
        : "selection mode=fallback";
}
function splitVaultQueryAndContext(rest) {
    return splitQueryAndContext(rest, "::");
}
function parseVaultSelectionInput(text) {
    if (text === "/vault")
        return { query: "", context: "" };
    if (text.startsWith("/vault:"))
        return splitVaultQueryAndContext(text.slice(7));
    if (text.startsWith("/vault "))
        return splitVaultQueryAndContext(text.slice(7));
    return null;
}
function resolvePickerCompanyContext(runtime, context) {
    if (context?.currentCompany?.trim()) {
        return {
            ok: true,
            currentCompany: context.currentCompany.trim(),
            companySource: "explicit:currentCompany",
        };
    }
    const companyContext = runtime.resolveCurrentCompanyContext(context?.cwd);
    if (companyContext.source === "contract-default") {
        return { ok: false, reason: "explicit-company-context-required" };
    }
    return {
        ok: true,
        currentCompany: companyContext.company,
        companySource: companyContext.source,
    };
}
function prepareVaultPrompt(runtime, template, options = {}) {
    return prepareTemplateForExecutionCompat(template.content, {
        currentCompany: options.currentCompany ?? runtime.getCurrentCompany(options.cwd),
        context: options.context ?? "",
        templateName: template.name,
        appendContextSection: options.appendContextSection,
        allowLegacyPiVarsAutoDetect: false,
    });
}
function loadVaultTemplate(runtime, name, context) {
    return runtime.getTemplate(name, context);
}
async function pickVaultTemplate(runtime, ctx, query, telemetry) {
    const companyContext = resolvePickerCompanyContext(runtime, ctx);
    if (!companyContext.ok) {
        return { selected: null, mode: "fallback", reason: companyContext.reason };
    }
    const templatesResult = runtime.listTemplatesDetailed(undefined, {
        currentCompany: companyContext.currentCompany,
        cwd: ctx.cwd,
        requireExplicitCompany: true,
    }, { includeContent: false });
    if (!templatesResult.ok) {
        return {
            selected: null,
            mode: "fallback",
            reason: templatesResult.error === PICKER_READ_CONTEXT_ERROR
                ? "explicit-company-context-required"
                : "vault-db-unavailable",
        };
    }
    const candidates = toVaultCandidates(templatesResult.value);
    if (candidates.length === 0) {
        return { selected: null, mode: "fallback", reason: "empty-vault" };
    }
    return (await selectFuzzyCandidate(candidates, {
        query,
        title: query
            ? `Vault template picker (query: ${query})`
            : "Vault template picker (all templates)",
        ui: ctx.hasUI ? ctx.ui : undefined,
        maxOptions: Math.max(1, candidates.length),
        telemetry: (event) => recordLiveTriggerTelemetry(telemetry, event),
    }));
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
function registerVaultLiveTrigger(runtime, telemetry, receipts) {
    try {
        const registration = registerPickerInteraction({
            id: LIVE_VAULT_TRIGGER_ID,
            description: "Show vault template picker while typing /vault:<query>",
            priority: 115,
            match: /^\/vault:(.*)$/,
            requireCursorAtEnd: true,
            debounceMs: LIVE_VAULT_TRIGGER_DEBOUNCE_MS,
            showInPicker: true,
            pickerLabel: "/vault: picker",
            pickerDetail: "Live vault template selector",
            parseInput: (match) => {
                const raw = String(match?.groups?.[0] ?? "");
                const parsed = splitVaultQueryAndContext(raw);
                return { query: parsed.query, context: parsed.context, raw };
            },
            minQueryLength: LIVE_VAULT_MIN_QUERY,
            loadCandidates: ({ context }) => {
                const companyContext = resolvePickerCompanyContext(runtime, context);
                if (!companyContext.ok) {
                    return {
                        candidates: [],
                        reason: companyContext.reason,
                        metadata: { templateCount: 0 },
                    };
                }
                const templatesResult = runtime.listTemplatesDetailed(undefined, {
                    currentCompany: companyContext.currentCompany,
                    cwd: context?.cwd,
                    requireExplicitCompany: true,
                }, { includeContent: false });
                if (!templatesResult.ok) {
                    return {
                        candidates: [],
                        reason: templatesResult.error === PICKER_READ_CONTEXT_ERROR
                            ? "explicit-company-context-required"
                            : "vault-db-unavailable",
                        metadata: { templateCount: 0 },
                    };
                }
                const candidates = toVaultCandidates(templatesResult.value);
                const reason = candidates.length === 0 ? "empty-vault" : undefined;
                return { candidates, reason, metadata: { templateCount: templatesResult.value.length } };
            },
            selectTitle: ({ query }) => query ? `Vault live picker (query: ${query})` : "Vault live picker",
            promptForQueryWhenEmpty: true,
            promptQueryThreshold: 15,
            queryPromptTitle: "Filter vault templates",
            queryPromptPlaceholder: "Type a query (e.g. nex, inversion, security)",
            maxOptions: 25,
            applySelection: ({ selected, parsed, context, api, selection, }) => {
                const companyContext = resolvePickerCompanyContext(runtime, context);
                if (!companyContext.ok) {
                    api.notify?.(PICKER_READ_CONTEXT_ERROR, "warning");
                    return;
                }
                const currentCompany = companyContext.currentCompany;
                const templateResult = runtime.getTemplateDetailed(selected.id, {
                    currentCompany,
                    cwd: context?.cwd,
                    requireExplicitCompany: true,
                });
                if (!templateResult.ok) {
                    api.notify?.(`Template lookup failed (${selected.id}): ${templateResult.error}`, "error");
                    return;
                }
                const template = templateResult.value;
                if (!template) {
                    api.notify?.(`Template not found: ${selected.id}`, "error");
                    return;
                }
                const prepared = prepareVaultPrompt(runtime, template, {
                    context: parsed.context,
                    currentCompany,
                    cwd: context?.cwd,
                });
                if (!prepared.ok) {
                    api.notify?.(`Vault live picker render failed (${template.name}): ${prepared.error}`, "error");
                    return;
                }
                const preparedPrompt = queuePreparedExecution(receipts, {
                    queued_at: new Date().toISOString(),
                    invocation: {
                        surface: "/vault:",
                        channel: "live-trigger",
                        selection_mode: selection.mode === "fzf" ? "picker-fzf" : "picker-fallback",
                        llm_tool_call: null,
                    },
                    template: toTemplateSnapshot(template),
                    company: {
                        current_company: currentCompany,
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
                api.setText(preparedPrompt);
                const contextSuffix = parsed.context ? " + context" : "";
                api.notify?.(`Prepared: ${template.name} (${runtime.facetLabel(template)})${contextSuffix} — ${selectionModeMessage(selection)}`, "info");
            },
            onNoCandidates: ({ parsed, reason, api, }) => {
                api.notify?.(reason
                    ? `Vault live picker unavailable (${reason}).`
                    : `No vault templates matched: ${parsed.query}`, "warning");
            },
            onError: ({ error, api, }) => {
                const message = error instanceof Error ? error.message : String(error);
                api.notify?.(`Vault live picker failed: ${message}`, "error");
            },
            telemetry: (event) => recordLiveTriggerTelemetry(telemetry, event),
        });
        if (registration.success) {
            telemetry.registrations += 1;
            recordLiveTriggerTelemetry(telemetry, {
                event: "registration-success",
                triggerId: LIVE_VAULT_TRIGGER_ID,
            });
            return;
        }
        telemetry.registrationFailures += 1;
        recordLiveTriggerTelemetry(telemetry, {
            event: "registration-failed",
            triggerId: LIVE_VAULT_TRIGGER_ID,
            reason: registration.error ?? "unknown",
        });
    }
    catch (error) {
        telemetry.registrationFailures += 1;
        recordLiveTriggerTelemetry(telemetry, {
            event: "registration-error",
            triggerId: LIVE_VAULT_TRIGGER_ID,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
export function createPickerRuntime(runtime, receipts) {
    const telemetry = createLiveTriggerTelemetryState();
    return {
        recordLiveTriggerTelemetry: (event) => recordLiveTriggerTelemetry(telemetry, event),
        summarizeLiveTriggerTelemetry: () => summarizeLiveTriggerTelemetry(telemetry),
        getLiveTriggerTelemetryStats: () => getLiveTriggerTelemetryStats(telemetry),
        selectionModeMessage,
        splitVaultQueryAndContext,
        parseVaultSelectionInput,
        pickVaultTemplate: (ctx, query) => pickVaultTemplate(runtime, ctx, query, telemetry),
        registerVaultLiveTrigger: () => registerVaultLiveTrigger(runtime, telemetry, receipts),
        prepareVaultPrompt: (template, options) => prepareVaultPrompt(runtime, template, options),
        loadVaultTemplate: (name, context) => loadVaultTemplate(runtime, name, context),
    };
}
